"""Admin signage content management (RFC-010, Phase 25.5 — specs/modules/signage.md).

Playlists + slides CRUD, reorder, and JWT preview endpoints that mirror the
device payload shapes so the admin preview pane renders identical data
(SGN-6). Every content mutation publishes PLAYLIST_UPDATED (SGN-5).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    TenantContext,
    accessible_tenant_ids,
    get_tenant_context,
    require_role,
)
from app.models.device import Device, SignagePlaylist, SignageSlide, SignageSlideType
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderSource, OrderStatus
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.device import (
    OrderBoardEntry,
    OrderBoardResponse,
    PlaylistCreate,
    PlaylistPatch,
    PlaylistResponse,
    SlideCreate,
    SlidePatch,
    SlideReorderRequest,
    SlideResponse,
    TrendingItemEntry,
    TrendingItemsResponse,
)
from app.schemas.public import PublicMenuResponse
from app.services import menu_service
from app.services.ws_pubsub import publish_event

router = APIRouter(prefix="/signage", tags=["signage"])

_BOARD_ACTIVE_STATUSES = (
    OrderStatus.pending_confirmation,
    OrderStatus.confirmed,
    OrderStatus.preparing,
    OrderStatus.ready,
)


async def _notify_playlist_updated(tenant_id, playlist_id) -> None:
    """SGN-5: connected displays re-fetch on any content mutation."""
    await publish_event(tenant_id, {"type": "PLAYLIST_UPDATED", "playlist_id": str(playlist_id)})


async def _get_scoped_playlist(
    playlist_id: uuid.UUID, ctx: TenantContext, db: AsyncSession, *, with_slides: bool = False
) -> SignagePlaylist:
    allowed = await accessible_tenant_ids(ctx, db)
    query = select(SignagePlaylist).where(SignagePlaylist.playlist_id == playlist_id)
    if with_slides:
        query = query.options(selectinload(SignagePlaylist.slides))
    result = await db.execute(query)
    playlist = result.scalar_one_or_none()
    if playlist is None or playlist.tenant_id not in allowed:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist


async def _clear_previous_default(db: AsyncSession, tenant_id, outlet_id, exclude_id) -> None:
    """SGN-4: setting a new default clears the previous one in the same transaction."""
    query = select(SignagePlaylist).where(
        SignagePlaylist.tenant_id == tenant_id,
        SignagePlaylist.is_default.is_(True),
    )
    if exclude_id is not None:
        query = query.where(SignagePlaylist.playlist_id != exclude_id)
    query = query.where(
        SignagePlaylist.outlet_id == outlet_id if outlet_id is not None else SignagePlaylist.outlet_id.is_(None)
    )
    result = await db.execute(query)
    for row in result.scalars().all():
        row.is_default = False


# ── Playlists ─────────────────────────────────────────────────────────────────

@router.post("/playlists", response_model=PlaylistResponse, status_code=201)
async def create_playlist(
    payload: PlaylistCreate,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    if payload.outlet_id is not None:
        allowed = await accessible_tenant_ids(ctx, db)
        if payload.outlet_id not in allowed:
            raise HTTPException(status_code=404, detail="Outlet not found")

    # SGN-4: clear the previous default BEFORE the new row is flushed, or the
    # partial unique index rejects the transient two-defaults state.
    if payload.is_default:
        await _clear_previous_default(db, ctx.tenant_id, payload.outlet_id, exclude_id=None)
        await db.flush()

    playlist = SignagePlaylist(
        tenant_id=ctx.tenant_id,
        outlet_id=payload.outlet_id,
        name=payload.name,
        is_default=payload.is_default,
    )
    db.add(playlist)
    await db.commit()

    result = await db.execute(
        select(SignagePlaylist)
        .options(selectinload(SignagePlaylist.slides))
        .where(SignagePlaylist.playlist_id == playlist.playlist_id)
    )
    return PlaylistResponse.model_validate(result.scalar_one())


@router.get("/playlists", response_model=list[PlaylistResponse])
async def list_playlists(
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    allowed = await accessible_tenant_ids(ctx, db)
    result = await db.execute(
        select(SignagePlaylist)
        .options(selectinload(SignagePlaylist.slides))
        .where(SignagePlaylist.tenant_id.in_(allowed))
        .order_by(SignagePlaylist.created_at)
    )
    return [PlaylistResponse.model_validate(p) for p in result.scalars().all()]


@router.patch("/playlists/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(
    playlist_id: uuid.UUID,
    payload: PlaylistPatch,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    playlist = await _get_scoped_playlist(playlist_id, ctx, db, with_slides=True)
    data = payload.model_dump(exclude_unset=True)
    # SGN-4: clear the previous default before this row becomes one, or the
    # partial unique index rejects the transient two-defaults state on flush.
    if data.get("is_default"):
        await _clear_previous_default(db, playlist.tenant_id, playlist.outlet_id, playlist.playlist_id)
        await db.flush()
    for field, value in data.items():
        setattr(playlist, field, value)
    await db.commit()
    await db.refresh(playlist)
    await _notify_playlist_updated(playlist.tenant_id, playlist.playlist_id)
    return PlaylistResponse.model_validate(playlist)


@router.delete("/playlists/{playlist_id}", status_code=204)
async def delete_playlist(
    playlist_id: uuid.UUID,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    playlist = await _get_scoped_playlist(playlist_id, ctx, db)
    tenant_id = playlist.tenant_id
    await db.delete(playlist)
    await db.commit()
    await _notify_playlist_updated(tenant_id, playlist_id)


# ── Slides ────────────────────────────────────────────────────────────────────

@router.post("/playlists/{playlist_id}/slides", response_model=SlideResponse, status_code=201)
async def add_slide(
    playlist_id: uuid.UUID,
    payload: SlideCreate,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    playlist = await _get_scoped_playlist(playlist_id, ctx, db)

    if payload.position is None:
        max_pos = await db.execute(
            select(func.coalesce(func.max(SignageSlide.position), -1)).where(
                SignageSlide.playlist_id == playlist_id
            )
        )
        position = max_pos.scalar_one() + 1
    else:
        position = payload.position

    slide = SignageSlide(
        playlist_id=playlist_id,
        slide_type=SignageSlideType(payload.slide_type),
        position=position,
        duration_seconds=payload.duration_seconds,
        config=payload.config,
        active_from=payload.active_from,
        active_until=payload.active_until,
        is_active=payload.is_active,
    )
    db.add(slide)
    await db.commit()
    await db.refresh(slide)
    await _notify_playlist_updated(playlist.tenant_id, playlist_id)
    return SlideResponse.model_validate(slide)


async def _get_scoped_slide(slide_id: uuid.UUID, ctx: TenantContext, db: AsyncSession) -> tuple[SignageSlide, SignagePlaylist]:
    result = await db.execute(select(SignageSlide).where(SignageSlide.slide_id == slide_id))
    slide = result.scalar_one_or_none()
    if slide is None:
        raise HTTPException(status_code=404, detail="Slide not found")
    playlist = await _get_scoped_playlist(slide.playlist_id, ctx, db)
    return slide, playlist


@router.patch("/slides/{slide_id}", response_model=SlideResponse)
async def update_slide(
    slide_id: uuid.UUID,
    payload: SlidePatch,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    slide, playlist = await _get_scoped_slide(slide_id, ctx, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(slide, field, value)
    await db.commit()
    await db.refresh(slide)
    await _notify_playlist_updated(playlist.tenant_id, playlist.playlist_id)
    return SlideResponse.model_validate(slide)


@router.delete("/slides/{slide_id}", status_code=204)
async def delete_slide(
    slide_id: uuid.UUID,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    slide, playlist = await _get_scoped_slide(slide_id, ctx, db)
    await db.delete(slide)
    await db.commit()
    await _notify_playlist_updated(playlist.tenant_id, playlist.playlist_id)


@router.put("/playlists/{playlist_id}/slides/reorder", response_model=PlaylistResponse)
async def reorder_slides(
    playlist_id: uuid.UUID,
    payload: SlideReorderRequest,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    playlist = await _get_scoped_playlist(playlist_id, ctx, db, with_slides=True)
    slides_by_id = {s.slide_id: s for s in playlist.slides}
    if set(payload.slide_ids) != set(slides_by_id.keys()):
        raise HTTPException(status_code=400, detail="slide_ids must contain exactly this playlist's slides")
    for position, slide_id in enumerate(payload.slide_ids):
        slides_by_id[slide_id].position = position
    await db.commit()
    await db.refresh(playlist)
    await _notify_playlist_updated(playlist.tenant_id, playlist_id)
    return PlaylistResponse.model_validate(playlist)


# ── Admin preview endpoints (SGN-6 / KSK-8) ───────────────────────────────────
# Same payload shapes as the /device/* equivalents, resolved from the admin's
# tenant context — the preview pane feeds the identical renderer components.

@router.get("/playlists/{playlist_id}/preview", response_model=PlaylistResponse)
async def preview_playlist(
    playlist_id: uuid.UUID,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    playlist = await _get_scoped_playlist(playlist_id, ctx, db, with_slides=True)
    resp = PlaylistResponse.model_validate(playlist)
    resp.slides = [s for s in resp.slides if s.is_active]
    return resp


async def _admin_tenant(ctx: TenantContext, db: AsyncSession) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.get("/preview/menu", response_model=PublicMenuResponse)
async def preview_menu(
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _admin_tenant(ctx, db)
    return await menu_service.build_public_menu(tenant, db)


@router.get("/preview/board", response_model=OrderBoardResponse)
async def preview_board(
    response: Response,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    allowed = await accessible_tenant_ids(ctx, db)
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(Order)
        .where(
            Order.tenant_id.in_(allowed),
            Order.pickup_number.is_not(None),
            Order.order_source.in_([OrderSource.kiosk, OrderSource.guest_qr]),
            Order.status.in_(_BOARD_ACTIVE_STATUSES),
            Order.created_at >= since,
        )
        .order_by(Order.created_at)
    )
    return OrderBoardResponse(
        orders=[
            OrderBoardEntry(
                order_id=o.order_id,
                pickup_number=o.pickup_number,
                status=getattr(o.status, "value", o.status),
            )
            for o in result.scalars().all()
        ]
    )


@router.get("/preview/trending", response_model=TrendingItemsResponse)
async def preview_trending(
    window_days: int = Query(7, ge=1, le=30),
    limit: int = Query(5, ge=1, le=10),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    allowed = await accessible_tenant_ids(ctx, db)
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    result = await db.execute(
        select(
            MenuItem.item_id,
            MenuItem.name,
            MenuItem.image_url,
            MenuItem.price,
            func.sum(OrderItem.quantity).label("quantity_sold"),
        )
        .join(OrderItem, OrderItem.item_id == MenuItem.item_id)
        .join(Order, Order.order_id == OrderItem.order_id)
        .where(
            Order.tenant_id.in_(allowed),
            Order.status != OrderStatus.cancelled,
            Order.created_at >= since,
        )
        .group_by(MenuItem.item_id, MenuItem.name, MenuItem.image_url, MenuItem.price)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
    )
    return TrendingItemsResponse(
        items=[
            TrendingItemEntry(
                item_id=row.item_id,
                name=row.name,
                image_url=row.image_url,
                price=str(Decimal(str(row.price))),
                quantity_sold=int(row.quantity_sold),
                rank=i + 1,
            )
            for i, row in enumerate(result.all())
        ]
    )

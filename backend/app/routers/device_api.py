"""Device-facing API (RFC-010, Phase 25 — specs/modules/devices.md).

Mounted at /api/v1/device. No JWT: `POST /pair` is unauthenticated (rate-limited),
everything else requires the opaque device token via `X-Device-Token`
(get_current_device — ADR-013). Kiosk/signage-specific endpoints land in
Phases 25.3/25.4 (specs/modules/kiosk.md, signage.md).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_device, require_device_type
from app.core.redis import get_redis
from app.models.device import Device, DeviceType
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderSource, OrderStatus
from app.models.tenant import Tenant, TenantType
from app.schemas.device import (
    DevicePairRequest,
    DevicePairResponse,
    DeviceProfileResponse,
    KioskOrderCreate,
    OrderBoardEntry,
    OrderBoardResponse,
    PlaylistResponse,
    TrendingItemEntry,
    TrendingItemsResponse,
)
from app.schemas.public import GuestOrderGroupResponse, PublicMenuResponse
from app.services import device_service, menu_service
from app.services.order_service import OrderService
from app.services.ws_pubsub import publish_event

router = APIRouter(prefix="/device", tags=["device"])
order_service = OrderService()

_PAIR_RATE_LIMIT_MAX = 5
_PAIR_RATE_LIMIT_WINDOW_SECONDS = 60

# KSK rate limit: per-device order cap replaces the guest per-table pending cap.
_ORDER_RATE_LIMIT_MAX = 10
_ORDER_RATE_LIMIT_WINDOW_SECONDS = 60

_BOARD_ACTIVE_STATUSES = (
    OrderStatus.pending_confirmation,
    OrderStatus.confirmed,
    OrderStatus.preparing,
    OrderStatus.ready,
)


async def _check_pair_rate_limit(request: Request) -> None:
    """DEV-2: 5 redemption attempts / minute / IP (PUB-2 fixed-window pattern)."""
    client_ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:device_pair:{client_ip}"
    redis = await get_redis()
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, _PAIR_RATE_LIMIT_WINDOW_SECONDS)
    if count > _PAIR_RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many pairing attempts. Please wait a minute.")


async def _build_profile(db: AsyncSession, device: Device) -> dict:
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == device.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None or not tenant.is_active:
        raise HTTPException(status_code=401, detail="Invalid or revoked device token")

    kiosk_config = None
    if device.device_type == DeviceType.kiosk:
        kiosk_config = await device_service.resolve_kiosk_config(
            db, device.tenant_id, device.outlet_id
        )

    return {
        "device_id": device.device_id,
        "device_type": device.device_type.value,
        "tenant_id": tenant.tenant_id,
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.name,
        "brand_color": tenant.brand_color,
        "outlet_id": device.outlet_id,
        "settings": device.settings or {},
        "kiosk_config": kiosk_config,
    }


@router.post("/pair", response_model=DevicePairResponse, status_code=201)
async def pair_device(
    payload: DevicePairRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Redeem an admin-issued pairing code for a device token (DEV-1/2/4).
    The plaintext token in this response is shown exactly once."""
    await _check_pair_rate_limit(request)

    redeemed = await device_service.redeem_pairing_code(db, payload.code)
    if redeemed is None:
        raise HTTPException(status_code=404, detail="Invalid or expired pairing code")
    device, token = redeemed

    profile = await _build_profile(db, device)
    return DevicePairResponse(device_token=token, **profile)


@router.get("/me", response_model=DeviceProfileResponse)
async def get_device_profile(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
):
    """Heartbeat + settings refresh (kiosks re-fetch on KIOSK_CONFIG_UPDATED)."""
    profile = await _build_profile(db, device)
    return DeviceProfileResponse(**profile)


async def _device_tenant(db: AsyncSession, device: Device) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == device.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None or not tenant.is_active:
        raise HTTPException(status_code=401, detail="Invalid or revoked device token")
    return tenant


async def _device_scope_tenant_ids(db: AsyncSession, device: Device) -> set[UUID]:
    return await device_service.device_scope_tenant_ids(db, device)


@router.get("/menu", response_model=PublicMenuResponse)
async def get_device_menu(
    device: Device = Depends(get_current_device),
    db: AsyncSession = Depends(get_db),
):
    """DEV-6: same cost-stripped shape as the public menu (shared builder),
    gated by the device credential instead of public_menu_enabled."""
    tenant = await _device_tenant(db, device)

    redis = await get_redis()
    cache_key = f"device:menu:{tenant.tenant_id}"
    cached = await redis.get(cache_key)
    if cached:
        return PublicMenuResponse.model_validate_json(cached)

    response = await menu_service.build_public_menu(tenant, db)
    await redis.set(cache_key, response.model_dump_json(), ex=60)
    return response


@router.post("/orders", response_model=GuestOrderGroupResponse, status_code=201)
async def create_kiosk_order(
    payload: KioskOrderCreate,
    device: Device = Depends(require_device_type(DeviceType.kiosk)),
    db: AsyncSession = Depends(get_db),
):
    """KSK-1..KSK-5 (specs/modules/kiosk.md): counter-pay kiosk order with a
    pickup number. All segments allowed — the registered device is the gate."""
    redis = await get_redis()
    rl_key = f"ratelimit:device_order:{device.device_id}"
    count = await redis.incr(rl_key)
    if count == 1:
        await redis.expire(rl_key, _ORDER_RATE_LIMIT_WINDOW_SECONDS)
    if count > _ORDER_RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many orders from this kiosk. Please wait a minute.")

    tenant = await _device_tenant(db, device)
    orders = await order_service.create_kiosk_order_session(db, tenant, payload)

    for order in orders:
        await publish_event(
            order.tenant_id,
            {
                "type": "ORDER_PLACED",
                "order_id": str(order.order_id),
                "table_id": None,
                "order_source": "kiosk",
                "guest_name": order.guest_name,
                "pickup_number": order.pickup_number,
                "total_amount": str(order.total_amount),
            },
        )

    # Same group-response shape as the public surface (vendor attribution etc.).
    from app.routers.public import _group_response
    return await _group_response(db, orders)


@router.get("/orders/board", response_model=OrderBoardResponse)
async def get_order_board(
    response: Response,
    device: Device = Depends(require_device_type(DeviceType.signage)),
    db: AsyncSession = Depends(get_db),
):
    """SGN-7: seeds the signage order-status slide — pickup numbers + status
    only, never names/phones/contents. Live updates then arrive over /ws/device."""
    response.headers["Cache-Control"] = "no-store"
    scope_ids = await _device_scope_tenant_ids(db, device)
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    result = await db.execute(
        select(Order)
        .where(
            Order.tenant_id.in_(scope_ids),
            Order.pickup_number.is_not(None),
            Order.order_source.in_([OrderSource.kiosk, OrderSource.guest_qr]),
            Order.status.in_(_BOARD_ACTIVE_STATUSES),
            Order.created_at >= since,
        )
        .order_by(Order.created_at)
    )
    orders = result.scalars().all()
    return OrderBoardResponse(
        orders=[
            OrderBoardEntry(
                order_id=o.order_id,
                pickup_number=o.pickup_number,
                status=getattr(o.status, "value", o.status),
            )
            for o in orders
        ]
    )


@router.get("/orders/{guest_token}", response_model=GuestOrderGroupResponse)
async def get_kiosk_order_status(
    guest_token: str,
    response: Response,
    device: Device = Depends(require_device_type(DeviceType.kiosk)),
    db: AsyncSession = Depends(get_db),
):
    """Track a session this device's tenant scope owns (404 otherwise — DEV-5)."""
    response.headers["Cache-Control"] = "no-store"
    orders = await order_service.get_guest_order_group(db, guest_token)
    scope_ids = await _device_scope_tenant_ids(db, device)
    if any(o.tenant_id not in scope_ids for o in orders):
        raise HTTPException(status_code=404, detail="Order not found")

    from app.routers.public import _group_response
    return await _group_response(db, orders)


@router.get("/playlist", response_model=PlaylistResponse)
async def get_device_playlist(
    device: Device = Depends(require_device_type(DeviceType.signage)),
    db: AsyncSession = Depends(get_db),
):
    """SGN-3 resolution; slides come back WITH schedule windows so a cached
    playlist keeps filtering correctly offline (SGN-2)."""
    playlist = await device_service.resolve_playlist(db, device)
    if playlist is None:
        raise HTTPException(status_code=404, detail="No content assigned to this display")

    from app.models.device import SignagePlaylist

    result = await db.execute(
        select(SignagePlaylist)
        .options(selectinload(SignagePlaylist.slides))
        .where(SignagePlaylist.playlist_id == playlist.playlist_id)
    )
    loaded = result.scalar_one()
    resp = PlaylistResponse.model_validate(loaded)
    resp.slides = [s for s in resp.slides if s.is_active]
    return resp


@router.get("/trending", response_model=TrendingItemsResponse)
async def get_trending_items(
    window_days: int = Query(7, ge=1, le=30),
    limit: int = Query(5, ge=1, le=10),
    device: Device = Depends(require_device_type(DeviceType.signage)),
    db: AsyncSession = Depends(get_db),
):
    """Top-N items by quantity over the window (trending_items slide).
    Cached 10 min per (tenant, window, limit)."""
    redis = await get_redis()
    cache_key = f"device:trending:{device.tenant_id}:{window_days}:{limit}"
    cached = await redis.get(cache_key)
    if cached:
        return TrendingItemsResponse.model_validate_json(cached)

    scope_ids = await _device_scope_tenant_ids(db, device)
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
            Order.tenant_id.in_(scope_ids),
            Order.status != OrderStatus.cancelled,
            Order.created_at >= since,
        )
        .group_by(MenuItem.item_id, MenuItem.name, MenuItem.image_url, MenuItem.price)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
    )
    rows = result.all()
    response = TrendingItemsResponse(
        items=[
            TrendingItemEntry(
                item_id=row.item_id,
                name=row.name,
                image_url=row.image_url,
                price=str(Decimal(str(row.price))),
                quantity_sold=int(row.quantity_sold),
                rank=i + 1,
            )
            for i, row in enumerate(rows)
        ]
    )
    await redis.set(cache_key, response.model_dump_json(), ex=600)
    return response

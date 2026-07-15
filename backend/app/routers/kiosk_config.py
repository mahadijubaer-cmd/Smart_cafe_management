"""Admin kiosk customization (RFC-010, Phase 25.5 — specs/modules/kiosk.md).

GET/PUT the per-tenant (or per-outlet) kiosk config. Outlet row overrides the
tenant-wide row; defaults fill the gaps. Saving publishes KIOSK_CONFIG_UPDATED
so paired kiosks refresh via GET /device/me without a reboot.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    TenantContext,
    accessible_tenant_ids,
    get_tenant_context,
    require_role,
)
from app.models.device import KioskConfig
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.device import KioskConfigResponse, KioskConfigUpdate
from app.schemas.public import PublicMenuResponse
from app.services import device_service, menu_service
from app.services.ws_pubsub import publish_event

router = APIRouter(prefix="/kiosk-config", tags=["kiosk-config"])


def _contrast_ratio(hex_a: str, hex_b: str) -> float:
    """WCAG 1.4.3 relative-luminance contrast ratio (KSK-7)."""
    def _lum(hex_color: str) -> float:
        rgb = [int(hex_color.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        channels = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

    la, lb = _lum(hex_a), _lum(hex_b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


@router.get("", response_model=KioskConfigResponse)
async def get_kiosk_config(
    outlet_id: UUID | None = Query(None),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    """Resolved config (outlet row overrides tenant row, defaults filled)."""
    if outlet_id is not None:
        allowed = await accessible_tenant_ids(ctx, db)
        if outlet_id not in allowed:
            raise HTTPException(status_code=404, detail="Outlet not found")
    config = await device_service.resolve_kiosk_config(db, ctx.tenant_id, outlet_id)
    return KioskConfigResponse(config=config, outlet_id=outlet_id)


@router.put("", response_model=KioskConfigResponse)
async def upsert_kiosk_config(
    payload: KioskConfigUpdate,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    outlet_id = payload.outlet_id
    if outlet_id is not None:
        allowed = await accessible_tenant_ids(ctx, db)
        if outlet_id not in allowed:
            raise HTTPException(status_code=404, detail="Outlet not found")

    # KSK-7: the accent fills primary buttons rendered with white label text,
    # so it must reach 4.5:1 against white (WCAG 1.4.3). The renderer
    # double-checks at paint time and falls back to the accessible default.
    if payload.accent_color and _contrast_ratio(payload.accent_color, "#ffffff") < 4.5:
        raise HTTPException(
            status_code=422,
            detail="accent_color fails WCAG 1.4.3 contrast (needs ≥4.5:1 against white button text)",
        )

    updates = payload.model_dump(exclude_unset=True, mode="json")
    updates.pop("outlet_id", None)

    query = select(KioskConfig).where(KioskConfig.tenant_id == ctx.tenant_id)
    query = query.where(
        KioskConfig.outlet_id == outlet_id if outlet_id is not None else KioskConfig.outlet_id.is_(None)
    )
    result = await db.execute(query)
    row = result.scalar_one_or_none()

    if row is None:
        row = KioskConfig(
            tenant_id=ctx.tenant_id,
            outlet_id=outlet_id,
            config=updates,
            updated_by=current_user.user_id,
        )
        db.add(row)
    else:
        row.config = {**(row.config or {}), **updates}
        row.updated_by = current_user.user_id
        row.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # Live refresh: paired kiosks re-fetch /device/me on this event.
    await publish_event(ctx.tenant_id, {"type": "KIOSK_CONFIG_UPDATED"})

    resolved = await device_service.resolve_kiosk_config(db, ctx.tenant_id, outlet_id)
    return KioskConfigResponse(config=resolved, outlet_id=outlet_id, updated_at=row.updated_at)


@router.get("/preview/menu", response_model=PublicMenuResponse)
async def preview_kiosk_menu(
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    """KSK-8: same shape as GET /device/menu, for the admin preview pane."""
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return await menu_service.build_public_menu(tenant, db)

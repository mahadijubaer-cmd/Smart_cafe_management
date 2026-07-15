"""Admin device registry (RFC-010, Phase 25 — specs/modules/devices.md).

POST   /devices                        — register a kiosk/signage terminal
GET    /devices                        — list with paired state / last-seen
PATCH  /devices/{device_id}            — rename, settings, activate/deactivate
POST   /devices/{device_id}/pairing-code — issue 6-digit single-use code (DEV-2)
POST   /devices/{device_id}/revoke     — kill credential immediately (DEV-3)
DELETE /devices/{device_id}            — remove device
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
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
from app.models.device import Device, DeviceType
from app.models.user import User
from app.schemas.device import (
    DeviceCreate,
    DevicePatch,
    DeviceResponse,
    PairingCodeResponse,
)
from app.services import device_service
from app.services.ws_pubsub import publish_event

router = APIRouter(prefix="/devices", tags=["devices"])


def _to_response(device: Device) -> DeviceResponse:
    resp = DeviceResponse.model_validate(device)
    resp.paired = device.token_hash is not None
    return resp


async def _get_scoped_device(
    device_id: uuid.UUID, ctx: TenantContext, db: AsyncSession
) -> Device:
    """DEV-5 admin side: a device is only visible within the caller's family scope."""
    allowed = await accessible_tenant_ids(ctx, db)
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if device is None or device.tenant_id not in allowed:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.post("", response_model=DeviceResponse, status_code=201)
async def create_device(
    payload: DeviceCreate,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    if payload.outlet_id is not None:
        allowed = await accessible_tenant_ids(ctx, db)
        if payload.outlet_id not in allowed:
            raise HTTPException(status_code=404, detail="Outlet not found")

    device = Device(
        tenant_id=ctx.tenant_id,
        outlet_id=payload.outlet_id,
        name=payload.name,
        device_type=DeviceType(payload.device_type),
        settings=payload.settings,
        created_by=current_user.user_id,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return _to_response(device)


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    allowed = await accessible_tenant_ids(ctx, db)
    result = await db.execute(
        select(Device).where(Device.tenant_id.in_(allowed)).order_by(Device.created_at)
    )
    return [_to_response(d) for d in result.scalars().all()]


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: uuid.UUID,
    payload: DevicePatch,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    device = await _get_scoped_device(device_id, ctx, db)

    data = payload.model_dump(exclude_unset=True)
    if "outlet_id" in data and data["outlet_id"] is not None:
        allowed = await accessible_tenant_ids(ctx, db)
        if data["outlet_id"] not in allowed:
            raise HTTPException(status_code=404, detail="Outlet not found")
    for field, value in data.items():
        setattr(device, field, value)
    await db.commit()
    await db.refresh(device)
    return _to_response(device)


@router.post("/{device_id}/pairing-code", response_model=PairingCodeResponse)
async def issue_pairing_code(
    device_id: uuid.UUID,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    device = await _get_scoped_device(device_id, ctx, db)
    code, ttl = await device_service.issue_pairing_code(device)
    return PairingCodeResponse(code=code, expires_in=ttl)


@router.post("/{device_id}/revoke", response_model=DeviceResponse)
async def revoke_device(
    device_id: uuid.UUID,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    device = await _get_scoped_device(device_id, ctx, db)
    await device_service.revoke_device(db, device)
    # Targeted push so a live device wipes its token and re-enters pairing (DEV-3).
    await publish_event(
        device.tenant_id,
        {"type": "DEVICE_REVOKED", "target_device_id": str(device.device_id)},
    )
    await db.refresh(device)
    return _to_response(device)


@router.delete("/{device_id}", status_code=204)
async def delete_device(
    device_id: uuid.UUID,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    device = await _get_scoped_device(device_id, ctx, db)
    await device_service.revoke_device(db, device)  # clears caches + credential first
    await publish_event(
        device.tenant_id,
        {"type": "DEVICE_REVOKED", "target_device_id": str(device.device_id)},
    )
    await db.delete(device)
    await db.commit()

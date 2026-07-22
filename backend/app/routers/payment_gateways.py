from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import EncryptionNotConfigured
from app.core.database import get_db
from app.core.dependencies import TenantContext, get_tenant_context, require_role
from app.models.payment_gateway import GatewayType
from app.models.user import User, UserRole
from app.schemas.payment_gateway import (
    AvailableGatewayResponse,
    GatewayConfigMasked,
    GatewayConfigUpsert,
    GatewayTestResponse,
)
from app.services import gateway_configs_service
from app.services.gateway_configs_service import build_gateway_client

router = APIRouter(prefix="/payment-gateways", tags=["payment-gateways"])

# Mirrors tenants.py's own _SETTINGS_ROLES exactly — the established role set for
# self-service settings scoped to the caller's own tenant (via TenantContext).
_SETTINGS_ROLES = (UserRole.tenant_admin, UserRole.outlet_admin, UserRole.food_court_admin)


@router.get("/me", response_model=list[GatewayConfigMasked])
async def list_my_gateways(
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(*_SETTINGS_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    return await gateway_configs_service.list_masked_configs(db, ctx.tenant_id)


@router.put("/me/{gateway_type}", response_model=GatewayConfigMasked)
async def upsert_my_gateway(
    gateway_type: GatewayType,
    data: GatewayConfigUpsert,
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(*_SETTINGS_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await gateway_configs_service.upsert_config(db, ctx.tenant_id, gateway_type, data)
    except EncryptionNotConfigured as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/me/{gateway_type}", status_code=204)
async def delete_my_gateway(
    gateway_type: GatewayType,
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(*_SETTINGS_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    found = await gateway_configs_service.delete_config(db, ctx.tenant_id, gateway_type)
    if not found:
        raise HTTPException(status_code=404, detail="Gateway not configured")


@router.post("/me/{gateway_type}/test", response_model=GatewayTestResponse)
async def test_my_gateway(
    gateway_type: GatewayType,
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(*_SETTINGS_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """RFC-011 Stage 5 / PAY-15 — a real connectivity check, not a stub. Ignores `is_enabled` so an
    admin can verify credentials before switching a gateway live."""
    config = await gateway_configs_service.get_decrypted_config_any(db, ctx.tenant_id, gateway_type)
    if not config:
        raise HTTPException(status_code=400, detail="No credentials saved for this gateway yet")

    client = build_gateway_client(gateway_type, config)
    result = await client.test_connection()
    return GatewayTestResponse(success=result.success, message=result.message)


@router.get("/available", response_model=AvailableGatewayResponse)
async def get_available_gateways(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    """Which payment methods the calling user's own tenant currently supports —
    drives the checkout UI's dynamic method list instead of a hardcoded one."""
    methods = await gateway_configs_service.get_available_methods(db, ctx.tenant_id)
    return AvailableGatewayResponse(**methods)

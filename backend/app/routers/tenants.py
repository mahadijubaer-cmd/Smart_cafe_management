"""Tenant management — platform_admin only.

Endpoints:
  GET    /tenants                       list all tenants
  POST   /tenants                       create a tenant
  GET    /tenants/{tenant_id}           get one tenant
  PATCH  /tenants/{tenant_id}           update metadata
  POST   /tenants/{tenant_id}/activate  re-activate a suspended tenant
  POST   /tenants/{tenant_id}/suspend   suspend a tenant
  GET    /tenants/{tenant_id}/outlets   list child outlets (franchise)
  POST   /tenants/{tenant_id}/outlets   create a franchise outlet under a brand
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.tenant import Tenant, TenantType
from app.models.user import UserRole
from app.schemas.tenant import OutletCreate, TenantCreate, TenantListResponse, TenantResponse, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["tenants"])

_admin_only = Depends(require_role(UserRole.platform_admin))


@router.get("", response_model=TenantListResponse, dependencies=[_admin_only])
async def list_tenants(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    total_result = await db.execute(select(func.count()).select_from(Tenant))
    total = total_result.scalar_one()

    result = await db.execute(
        select(Tenant).order_by(Tenant.created_at.desc()).offset(skip).limit(limit)
    )
    tenants = result.scalars().all()
    return TenantListResponse(items=list(tenants), total=total)


@router.post("", response_model=TenantResponse, status_code=201, dependencies=[_admin_only])
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Tenant).where(Tenant.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Slug '{data.slug}' already taken")

    tenant = Tenant(**data.model_dump())
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.get("/{tenant_id}", response_model=TenantResponse, dependencies=[_admin_only])
async def get_tenant(tenant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.patch("/{tenant_id}", response_model=TenantResponse, dependencies=[_admin_only])
async def update_tenant(
    tenant_id: UUID,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(tenant, field, value)

    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.post("/{tenant_id}/activate", response_model=TenantResponse, dependencies=[_admin_only])
async def activate_tenant(tenant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = True
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.post("/{tenant_id}/suspend", response_model=TenantResponse, dependencies=[_admin_only])
async def suspend_tenant(tenant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = False
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.get("/{tenant_id}/outlets", response_model=TenantListResponse, dependencies=[_admin_only])
async def list_outlets(tenant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tenant).where(Tenant.parent_tenant_id == tenant_id)
    )
    outlets = result.scalars().all()
    return TenantListResponse(items=list(outlets), total=len(outlets))


@router.post("/{tenant_id}/outlets", response_model=TenantResponse, status_code=201, dependencies=[_admin_only])
async def create_outlet(
    tenant_id: UUID,
    data: OutletCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a franchise_outlet under the specified franchise_brand tenant."""
    brand_result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    brand = brand_result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand tenant not found")
    if brand.tenant_type != TenantType.franchise_brand:
        raise HTTPException(status_code=400, detail="Parent tenant is not a franchise_brand")

    slug_check = await db.execute(select(Tenant).where(Tenant.slug == data.slug))
    if slug_check.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Slug '{data.slug}' already taken")

    outlet = Tenant(
        **data.model_dump(),
        tenant_type=TenantType.franchise_outlet,
        parent_tenant_id=tenant_id,
    )
    db.add(outlet)
    await db.commit()
    await db.refresh(outlet)
    return outlet

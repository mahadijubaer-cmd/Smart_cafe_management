"""Tenant management.

Public endpoints (no auth):
  GET    /tenants/public               list all active tenants
  GET    /tenants/public/{slug}        single tenant public profile

Platform-admin endpoints:
  GET    /tenants                       list all tenants
  POST   /tenants                       create a tenant
  GET    /tenants/{tenant_id}           get one tenant
  PATCH  /tenants/{tenant_id}           update metadata
  POST   /tenants/{tenant_id}/activate  re-activate a suspended tenant
  POST   /tenants/{tenant_id}/suspend   suspend a tenant

Platform-admin OR the brand's own admin (BR-FRAN-1, RFC-008):
  GET    /tenants/{tenant_id}/outlets   list child outlets (franchise)
  POST   /tenants/{tenant_id}/outlets   create a franchise outlet under a brand
"""
import json
import os
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    get_current_user,
    get_tenant_context,
    require_role,
    TenantContext,
)
from app.core.redis import get_redis
from app.core.tier_limits import check_tier_limit
from app.models.menu import MenuItem
from app.models.models import Order
from app.models.table import TablesMap
from app.core.segments import SEGMENT_MAP
from app.models.tenant import SubscriptionTier, Tenant, TenantType
from app.models.user import User, UserRole
from app.schemas.tenant import (
    SELF_SERVE_TENANT_TYPES,
    OutletCreate,
    TenantCreate,
    TenantExportResponse,
    TenantListResponse,
    TenantPublicDetailResponse,
    TenantPublicListResponse,
    TenantPublicResponse,
    TenantRegister,
    TenantResponse,
    TenantSettingsUpdate,
    TenantUpdate,
)
from app.schemas.user import Token
from app.services.audit_service import AuditAction, record_audit
from app.services.auth_service import AuthService

router = APIRouter(prefix="/tenants", tags=["tenants"])
_auth_service = AuthService()


def _validate_org_password(password: str) -> None:
    """BR-ORG-6 — same complexity rule as password reset."""
    import re

    pattern = re.compile(
        r'^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;\':",./<>?]).{8,}$'
    )
    if not pattern.match(password):
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least 8 characters and include an uppercase "
                "letter, a digit, and a special character."
            ),
        )

_admin_only = Depends(require_role(UserRole.platform_admin))

_PUBLIC_LIST_VER_KEY = "tenants:public:ver"
_PUBLIC_LIST_KEY = "tenants:public:v{ver}:{skip}:{limit}:{segment}"
_PUBLIC_DETAIL_KEY = "tenants:public:{slug}"
_PUBLIC_TTL = 300  # 5 minutes


async def _public_list_cache_key(redis, skip: int, limit: int, segment: str | None) -> str:
    """Versioned per-page cache key — invalidation bumps the version counter instead of
    wildcard-deleting page keys (SCAN isn't supported by the test suite's FakeAsyncRedis);
    stale versions simply expire via TTL. See modules/tenants.md."""
    ver = await redis.get(_PUBLIC_LIST_VER_KEY) or "0"
    if isinstance(ver, bytes):
        ver = ver.decode()
    return _PUBLIC_LIST_KEY.format(ver=ver, skip=skip, limit=limit, segment=segment or "all")


async def _bump_public_list_cache(redis) -> None:
    await redis.incr(_PUBLIC_LIST_VER_KEY)


@router.get("/public", response_model=TenantPublicListResponse)
async def list_public_tenants(
    q: str | None = Query(default=None, description="Filter by name or city"),
    segment: str | None = Query(default=None, pattern="^(cafeteria|restaurant)$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Paginated list of active tenants. `total` counts post-filter, pre-slice.
    Results are cached 5 min when there's no search query."""
    redis = await get_redis()

    cache_key = None
    if not q:
        cache_key = await _public_list_cache_key(redis, skip, limit, segment)
        cached = await redis.get(cache_key)
        if cached:
            data = json.loads(cached)
            return TenantPublicListResponse(**data)

    filters = [Tenant.is_active.is_(True)]
    if q:
        term = f"%{q}%"
        filters.append(or_(Tenant.name.ilike(term), Tenant.city.ilike(term)))
    if segment:
        segment_types = [t for t, s in SEGMENT_MAP.items() if s == segment]
        filters.append(Tenant.tenant_type.in_(segment_types))

    total_result = await db.execute(
        select(func.count()).select_from(Tenant).where(*filters)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(Tenant).where(*filters).order_by(Tenant.name).offset(skip).limit(limit)
    )
    tenants = result.scalars().all()
    items = [TenantPublicResponse.model_validate(t) for t in tenants]
    response = TenantPublicListResponse(items=items, total=total)

    if cache_key:
        await redis.setex(cache_key, _PUBLIC_TTL, response.model_dump_json())

    return response


@router.get("/public/{slug}", response_model=TenantPublicDetailResponse)
async def get_public_tenant(slug: str, db: AsyncSession = Depends(get_db)):
    """Return a single active tenant's public profile by slug."""
    redis = await get_redis()
    cache_key = _PUBLIC_DETAIL_KEY.format(slug=slug)

    cached = await redis.get(cache_key)
    if cached:
        return TenantPublicDetailResponse(**json.loads(cached))

    result = await db.execute(
        select(Tenant).where(Tenant.slug == slug, Tenant.is_active.is_(True))
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    response = TenantPublicDetailResponse.model_validate(tenant)
    await redis.setex(cache_key, _PUBLIC_TTL, response.model_dump_json())
    return response


@router.post("/register", response_model=Token, status_code=201)
async def register_organization(
    data: TenantRegister,
    db: AsyncSession = Depends(get_db),
):
    """Public self-serve organization onboarding (RFC-006).

    Creates a new tenant and its first admin user atomically, then returns a JWT
    so the owner is logged straight into their new dashboard. See BR-ORG-1..7.
    """
    org = data.organization
    admin = data.admin

    # BR-ORG-1: only self-serve tenant types
    if org.tenant_type not in SELF_SERVE_TENANT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{org.tenant_type.value}' cannot be self-registered. Outlets and food-court "
                "vendors must be created under an existing parent organization."
            ),
        )

    # BR-ORG-2: slug must be unique
    existing = await db.execute(select(Tenant).where(Tenant.slug == org.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Slug '{org.slug}' is already taken")

    # BR-ORG-6: password complexity
    _validate_org_password(admin.password)

    # BR-ORG-5: role depends on tenant type
    admin_role = (
        UserRole.food_court_admin
        if org.tenant_type == TenantType.food_court
        else UserRole.tenant_admin
    )

    # BR-ORG-7: atomic — tenant + admin in one transaction
    tenant = Tenant(
        tenant_type=org.tenant_type,
        name=org.name,
        slug=org.slug,
        brand_color=org.brand_color,
        subscription_tier=SubscriptionTier.free,  # BR-ORG-4
        is_active=True,
        parent_tenant_id=None,
        allowed_email_domain=org.allowed_email_domain,
        city=org.city,
        contact_email=str(org.contact_email) if org.contact_email else None,
    )
    db.add(tenant)
    await db.flush()  # assign tenant_id without committing

    admin_user = User(
        tenant_id=tenant.tenant_id,
        full_name=admin.full_name,
        email=str(admin.email),
        password_hash=_auth_service.hash_password(admin.password),
        role=admin_role,
        is_active=True,
        email_verified=True,
    )
    db.add(admin_user)
    await db.commit()
    await db.refresh(tenant)
    await db.refresh(admin_user)

    # Invalidate the cached public tenant list so the new org shows up immediately
    redis = await get_redis()
    await _bump_public_list_cache(redis)

    access_token = _auth_service.create_access_token(admin_user, tenant)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=admin_user.user_id,
        tenant_id=tenant.tenant_id,
        tenant_type=tenant.tenant_type,
        tenant_slug=tenant.slug,
        outlet_id=None,
        role=admin_user.role,
    )


_SETTINGS_ROLES = (UserRole.tenant_admin, UserRole.outlet_admin, UserRole.food_court_admin)
_LOGO_ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}
_LOGO_MAX_BYTES = 2 * 1024 * 1024  # 2 MB


async def _invalidate_tenant_caches(redis, slug: str) -> None:
    await _bump_public_list_cache(redis)
    await redis.delete(_PUBLIC_DETAIL_KEY.format(slug=slug))


@router.get("/me", response_model=TenantResponse)
async def get_my_tenant(
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(*_SETTINGS_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Return the full tenant record for the calling admin user's own organisation."""
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.patch("/me/settings", response_model=TenantResponse)
async def update_my_tenant_settings(
    data: TenantSettingsUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(*_SETTINGS_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Self-service settings update for tenant admins."""
    # RFC-007 Phase D: cafeteria-segment tenants may now enable public_menu_enabled too, but only
    # for read-only browsing — guest ORDERING (POST /public/*/orders) stays restaurant-segment only
    # (see is_restaurant_segment() gate in routers/public.py::create_public_order).

    if data.public_slug is not None:
        existing = await db.execute(
            select(Tenant).where(
                Tenant.public_slug == data.public_slug,
                Tenant.tenant_id != ctx.tenant_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="public_slug is already taken")

    result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(tenant, field, value)

    await db.commit()
    await db.refresh(tenant)

    redis = await get_redis()
    await _invalidate_tenant_caches(redis, tenant.slug)

    return tenant


@router.post("/me/logo")
async def upload_my_tenant_logo(
    logo: UploadFile = File(...),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(*_SETTINGS_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Upload a new logo for the calling admin's tenant."""
    if logo.content_type not in _LOGO_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: PNG, JPEG, WebP.")

    contents = await logo.read()
    if len(contents) > _LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 2 MB.")

    ext_map = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
    ext = ext_map[logo.content_type]
    logos_dir = Path(settings.MEDIA_ROOT) / "logos"
    logos_dir.mkdir(parents=True, exist_ok=True)
    file_path = logos_dir / f"{ctx.tenant_id}.{ext}"
    file_path.write_bytes(contents)

    logo_url = f"/media/logos/{ctx.tenant_id}.{ext}"

    result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.logo_url = logo_url
    await db.commit()

    redis = await get_redis()
    await _invalidate_tenant_caches(redis, tenant.slug)

    return {"logo_url": logo_url}


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


@router.post("", response_model=TenantResponse, status_code=201)
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    existing = await db.execute(select(Tenant).where(Tenant.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Slug '{data.slug}' already taken")

    tenant = Tenant(**data.model_dump())
    db.add(tenant)
    await db.flush()  # populate tenant.tenant_id (Python-side default) before audit logging
    await record_audit(db, current_user, AuditAction.tenant_created, target_tenant=tenant)
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


@router.patch("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    updates = data.model_dump(exclude_none=True)
    old_tier = tenant.subscription_tier
    for field, value in updates.items():
        setattr(tenant, field, value)

    if "subscription_tier" in updates and updates["subscription_tier"] != old_tier.value:
        await record_audit(
            db, current_user, AuditAction.tenant_tier_changed, target_tenant=tenant,
            details={"from": old_tier.value, "to": updates["subscription_tier"]},
        )

    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.post("/{tenant_id}/activate", response_model=TenantResponse)
async def activate_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = True
    await record_audit(db, current_user, AuditAction.tenant_activated, target_tenant=tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.post("/{tenant_id}/suspend", response_model=TenantResponse)
async def suspend_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.is_active = False
    await record_audit(db, current_user, AuditAction.tenant_suspended, target_tenant=tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant


_BRAND_ADMIN_ROLES = (UserRole.super_admin, UserRole.tenant_admin)


async def _require_own_brand_or_platform(
    tenant_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(get_current_user),
) -> None:
    """BR-FRAN-1 (RFC-008): platform_admin may manage any brand's outlets; a franchise brand's
    own super_admin/tenant_admin ("Franchise Admin" in the product spec) may manage only their
    own brand's outlets."""
    if current_user.role == UserRole.platform_admin:
        return
    if (
        current_user.role in _BRAND_ADMIN_ROLES
        and ctx.tenant_id == tenant_id
        and ctx.tenant_type == TenantType.franchise_brand
    ):
        return
    raise HTTPException(
        status_code=403,
        detail="Insufficient permissions to manage this brand's outlets",
    )


@router.get(
    "/{tenant_id}/outlets",
    response_model=TenantListResponse,
    dependencies=[Depends(_require_own_brand_or_platform)],
)
async def list_outlets(tenant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tenant).where(Tenant.parent_tenant_id == tenant_id)
    )
    outlets = result.scalars().all()
    return TenantListResponse(items=list(outlets), total=len(outlets))


@router.post(
    "/{tenant_id}/outlets",
    response_model=TenantResponse,
    status_code=201,
    dependencies=[Depends(_require_own_brand_or_platform)],
)
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

    outlet_count = await db.scalar(
        select(func.count(Tenant.tenant_id)).where(Tenant.parent_tenant_id == tenant_id)
    )
    check_tier_limit(brand.subscription_tier, "max_outlets", outlet_count)

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


@router.delete("/{tenant_id}", status_code=204)
async def delete_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    """Hard delete — BR-PLAT-1 (RFC-009). Requires the tenant already suspended and, for
    franchise_brand/food_court tenants, zero remaining child tenants."""
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if tenant.is_active:
        raise HTTPException(
            status_code=400, detail="Tenant must be suspended before it can be deleted"
        )

    if tenant.tenant_type in (TenantType.franchise_brand, TenantType.food_court):
        child_count = await db.scalar(
            select(func.count(Tenant.tenant_id)).where(Tenant.parent_tenant_id == tenant_id)
        )
        if child_count > 0:
            raise HTTPException(
                status_code=409,
                detail="Tenant has active child outlets/vendors — delete or reassign them first",
            )

    await record_audit(
        db, current_user, AuditAction.tenant_deleted, target_tenant=tenant,
        details={"tenant_type": tenant.tenant_type.value},
    )
    # Core DELETE (not db.delete(tenant)) so the DB's own ON DELETE CASCADE FKs cascade to
    # child rows directly — the ORM unit-of-work would otherwise try to null out children's
    # NOT NULL tenant_id first, since Tenant.users has no passive_deletes=True.
    await db.execute(delete(Tenant).where(Tenant.tenant_id == tenant_id))
    await db.commit()


@router.get("/{tenant_id}/export", response_model=TenantExportResponse)
async def export_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    """JSON data snapshot — offboarding record, not a full data-portability export."""
    from datetime import datetime, timezone

    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    users_result = await db.execute(select(User).where(User.tenant_id == tenant_id))
    users = users_result.scalars().all()

    menu_item_count = await db.scalar(
        select(func.count(MenuItem.item_id)).where(MenuItem.tenant_id == tenant_id)
    )
    table_count = await db.scalar(
        select(func.count(TablesMap.table_id)).where(TablesMap.tenant_id == tenant_id)
    )
    order_result = await db.execute(
        select(func.count(Order.order_id), func.coalesce(func.sum(Order.total_amount), 0)).where(
            Order.tenant_id == tenant_id
        )
    )
    total_orders, total_revenue = order_result.one()

    return TenantExportResponse(
        tenant=tenant,
        users=users,
        menu_item_count=menu_item_count,
        table_count=table_count,
        order_summary={"total_orders": total_orders, "total_revenue": str(total_revenue)},
        exported_at=datetime.now(timezone.utc),
    )

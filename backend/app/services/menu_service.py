"""Menu cache service — Redis-backed cache for GET /menu/items — plus the
shared cost-stripped public menu builder (RFC-010 Phase 25 refactor).

Cache key: cache:menu:{tenant_id}:{cat}:{avail}:{homemade}
  where each filter component is the value or the literal string 'all'.

Invalidation: scan + delete all cache:menu:{tenant_id}:* keys.
TTL: 5 minutes (configurable via MENU_CACHE_TTL).
"""
import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.menu import Category, MenuItem
from app.models.tenant import Tenant, TenantType
from app.schemas.public import PublicFoodCourtVendor, PublicMenuItem, PublicMenuResponse

logger = logging.getLogger(__name__)

MENU_CACHE_TTL = 300  # seconds


# ── Shared public menu builder (PUB-7 / DEV-6) ────────────────────────────────
# One implementation feeding both GET /public/{slug}/menu and GET /device/menu
# (specs/modules/public-surface.md "Shared Menu Builder"). Cost/inventory fields
# never leave here — the PublicMenuItem schema is the projection boundary.

async def build_public_menu(tenant: Tenant, db: AsyncSession) -> PublicMenuResponse:
    """Cost-stripped menu for unauthenticated/device surfaces. Food-court
    parents get the vendor-aggregated shape (no unified categories)."""
    if tenant.tenant_type == TenantType.food_court:
        return await _build_food_court_menu(tenant, db)

    cat_result = await db.execute(
        select(Category).where(Category.tenant_id == tenant.tenant_id, Category.is_active.is_(True))
        .order_by(Category.display_order)
    )
    categories = cat_result.scalars().all()

    item_result = await db.execute(
        select(MenuItem).where(MenuItem.tenant_id == tenant.tenant_id, MenuItem.is_available.is_(True))
    )
    items = item_result.scalars().all()

    return PublicMenuResponse(
        categories=[c for c in categories],
        items=[PublicMenuItem.model_validate(i) for i in items],
    )


async def _build_food_court_menu(food_court_tenant: Tenant, db: AsyncSession) -> PublicMenuResponse:
    """Unified menu across all active vendors — food-court parents have no menu
    items of their own. No unified categories across vendors; the frontend
    groups by vendor instead (mirrors the authenticated food_court.unified_menu)."""
    vendor_result = await db.execute(
        select(Tenant).where(
            Tenant.parent_tenant_id == food_court_tenant.tenant_id,
            Tenant.tenant_type == TenantType.food_court_vendor,
            Tenant.is_active.is_(True),
        )
    )
    vendors = {t.tenant_id: t for t in vendor_result.scalars().all()}
    if not vendors:
        return PublicMenuResponse(categories=[], items=[], vendors=[])

    item_result = await db.execute(
        select(MenuItem).where(
            MenuItem.tenant_id.in_(vendors.keys()),
            MenuItem.is_available.is_(True),
        )
    )
    items = []
    for item in item_result.scalars().all():
        vendor = vendors[item.tenant_id]
        public_item = PublicMenuItem.model_validate(item)
        public_item.vendor_id = str(vendor.tenant_id)
        public_item.vendor_name = vendor.name
        items.append(public_item)

    return PublicMenuResponse(
        categories=[],
        items=items,
        vendors=[PublicFoodCourtVendor(vendor_id=str(t.tenant_id), vendor_name=t.name) for t in vendors.values()],
    )


def _cache_key(
    tenant_id: UUID,
    category_id: int | None,
    is_available: bool | None,
    is_homemade: bool | None,
) -> str:
    cat = str(category_id) if category_id is not None else "all"
    avail = str(is_available).lower() if is_available is not None else "all"
    homemade = str(is_homemade).lower() if is_homemade is not None else "all"
    return f"cache:menu:{tenant_id}:{cat}:{avail}:{homemade}"


async def get_menu_cached(
    tenant_id: UUID,
    category_id: int | None,
    is_available: bool | None,
    is_homemade: bool | None,
) -> list[dict] | None:
    """Return the cached item list, or None on a cache miss."""
    redis = await get_redis()
    key = _cache_key(tenant_id, category_id, is_available, is_homemade)
    raw = await redis.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Corrupt menu cache entry for key %s — evicting", key)
        await redis.delete(key)
        return None


async def set_menu_cache(
    tenant_id: UUID,
    category_id: int | None,
    is_available: bool | None,
    is_homemade: bool | None,
    data: list[dict[str, Any]],
) -> None:
    """Store a serialised item list in Redis."""
    redis = await get_redis()
    key = _cache_key(tenant_id, category_id, is_available, is_homemade)
    await redis.setex(key, MENU_CACHE_TTL, json.dumps(data, default=str))


async def invalidate_menu_cache(tenant_id: UUID) -> None:
    """Delete every cache key for the given tenant (all filter combinations)."""
    redis = await get_redis()
    pattern = f"cache:menu:{tenant_id}:*"
    cursor = 0
    deleted = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
            deleted += len(keys)
        if cursor == 0:
            break
    if deleted:
        logger.debug("Invalidated %d menu cache entries for tenant %s", deleted, tenant_id)

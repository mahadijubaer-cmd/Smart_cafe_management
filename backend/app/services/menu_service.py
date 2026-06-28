"""Menu cache service — Redis-backed cache for GET /menu/items.

Cache key: cache:menu:{tenant_id}:{cat}:{avail}:{homemade}
  where each filter component is the value or the literal string 'all'.

Invalidation: scan + delete all cache:menu:{tenant_id}:* keys.
TTL: 5 minutes (configurable via MENU_CACHE_TTL).
"""
import json
import logging
from typing import Any
from uuid import UUID

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

MENU_CACHE_TTL = 300  # seconds


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

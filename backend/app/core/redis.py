import logging
from typing import Optional

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = await aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


async def cache_get(redis: aioredis.Redis, key: str) -> Optional[str]:
    """Best-effort cache read for purely-optional caches — a Redis outage degrades to a
    cache miss (caller falls through to the DB) instead of a 500. Not for callers where
    Redis is load-bearing (rate limits, OTP, JWT blacklist, sessions)."""
    try:
        return await redis.get(key)
    except RedisError:
        logger.warning("Redis unavailable on GET %s, treating as cache miss", key, exc_info=True)
        return None


async def cache_set(redis: aioredis.Redis, key: str, value: str, ex: int) -> None:
    """Best-effort cache write — see cache_get."""
    try:
        await redis.set(key, value, ex=ex)
    except RedisError:
        logger.warning("Redis unavailable on SET %s, skipping cache write", key, exc_info=True)

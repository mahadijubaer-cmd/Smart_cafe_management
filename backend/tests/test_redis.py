"""Redis integration tests.

Covers three areas:
  1. Menu cache (hit / miss / invalidation)
  2. JWT blacklist via /auth/logout endpoint
  3. Inventory distributed lock (SET NX EX semantics)
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.menu_service import (
    get_menu_cached,
    invalidate_menu_cache,
    set_menu_cache,
    _cache_key,
)
from app.services import inventory_service
from tests.conftest import FakeAsyncRedis, SLUG_ALPHA, get_token


# ─────────────────────────────────────────────────────────────────────────────
# Menu cache
# ─────────────────────────────────────────────────────────────────────────────

async def test_menu_cache_miss_returns_none(fake_redis: FakeAsyncRedis):
    tenant_id = uuid.uuid4()
    result = await get_menu_cached(tenant_id, None, None, None)
    assert result is None


async def test_menu_cache_hit_after_set(fake_redis: FakeAsyncRedis):
    tenant_id = uuid.uuid4()
    data = [{"item_id": str(uuid.uuid4()), "name": "Fried Rice", "price": "120.00"}]

    await set_menu_cache(tenant_id, None, None, None, data)

    result = await get_menu_cached(tenant_id, None, None, None)
    assert result is not None
    assert result[0]["name"] == "Fried Rice"


async def test_menu_cache_miss_for_different_tenant(fake_redis: FakeAsyncRedis):
    """Cache for tenant A should not be visible to tenant B."""
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()
    data = [{"name": "Biryani"}]

    await set_menu_cache(tenant_a, None, None, None, data)

    result = await get_menu_cached(tenant_b, None, None, None)
    assert result is None


async def test_menu_cache_invalidation_removes_all_filters(fake_redis: FakeAsyncRedis):
    """invalidate_menu_cache should clear every cache variant for the tenant."""
    tenant_id = uuid.uuid4()

    # Populate multiple filter combinations
    await set_menu_cache(tenant_id, None, None, None, [{"name": "A"}])
    await set_menu_cache(tenant_id, 1, True, None, [{"name": "B"}])
    await set_menu_cache(tenant_id, None, True, False, [{"name": "C"}])

    await invalidate_menu_cache(tenant_id)

    assert await get_menu_cached(tenant_id, None, None, None) is None
    assert await get_menu_cached(tenant_id, 1, True, None) is None
    assert await get_menu_cached(tenant_id, None, True, False) is None


async def test_invalidation_does_not_affect_other_tenant_cache(fake_redis: FakeAsyncRedis):
    """Invalidating tenant A's cache must not remove tenant B's cache."""
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()
    data = [{"name": "Kebab"}]

    await set_menu_cache(tenant_a, None, None, None, data)
    await set_menu_cache(tenant_b, None, None, None, data)

    await invalidate_menu_cache(tenant_a)

    assert await get_menu_cached(tenant_a, None, None, None) is None
    assert await get_menu_cached(tenant_b, None, None, None) is not None


async def test_cache_key_format(fake_redis: FakeAsyncRedis):
    """Verify the cache key format so future key schema changes break this test first."""
    tid = uuid.UUID("12345678-1234-5678-1234-567812345678")
    key = _cache_key(tid, category_id=3, is_available=True, is_homemade=False)
    assert key == f"cache:menu:{tid}:3:true:false"

    key_all = _cache_key(tid, category_id=None, is_available=None, is_homemade=None)
    assert key_all == f"cache:menu:{tid}:all:all:all"


# ─────────────────────────────────────────────────────────────────────────────
# JWT blacklist — via HTTP logout endpoint
# ─────────────────────────────────────────────────────────────────────────────

async def test_logout_blacklists_jwt(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis: FakeAsyncRedis,
):
    """After /logout, the same token must be rejected by /auth/me with 401."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    auth_header = {"Authorization": f"Bearer {token}"}

    # Confirm token is valid before logout
    me_resp = await async_client.get("/api/v1/auth/me", headers=auth_header)
    assert me_resp.status_code == 200

    # Logout — should blacklist the JWT's jti in Redis
    logout_resp = await async_client.post("/api/v1/auth/logout", headers=auth_header)
    assert logout_resp.status_code == 204

    # Same token must now be rejected
    me_after = await async_client.get("/api/v1/auth/me", headers=auth_header)
    assert me_after.status_code == 401


async def test_blacklist_key_stored_in_redis(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis: FakeAsyncRedis,
):
    """After logout, a blacklist:jti:* key must exist in Redis."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    await async_client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )

    blacklist_keys = [k for k in fake_redis._data if k.startswith("blacklist:jti:")]
    assert len(blacklist_keys) >= 1


# ─────────────────────────────────────────────────────────────────────────────
# Inventory distributed lock (Redis SET NX EX)
# ─────────────────────────────────────────────────────────────────────────────

async def test_lock_nx_semantics(fake_redis: FakeAsyncRedis):
    """Acquiring a lock on the same key twice: first succeeds, second fails."""
    item_id = uuid.uuid4()

    first = await inventory_service._acquire_lock(item_id)
    second = await inventory_service._acquire_lock(item_id)

    assert first is True
    assert second is False

    await inventory_service._release_lock(item_id)


async def test_lock_key_format(fake_redis: FakeAsyncRedis):
    """The Redis key used for an inventory lock must include the item_id."""
    item_id = uuid.uuid4()
    await inventory_service._acquire_lock(item_id)

    expected_key = f"lock:inventory:{item_id}"
    assert expected_key in fake_redis._data

    await inventory_service._release_lock(item_id)


async def test_lock_release_clears_key(fake_redis: FakeAsyncRedis):
    item_id = uuid.uuid4()
    await inventory_service._acquire_lock(item_id)
    await inventory_service._release_lock(item_id)

    expected_key = f"lock:inventory:{item_id}"
    assert expected_key not in fake_redis._data


async def test_two_different_items_lock_independently(fake_redis: FakeAsyncRedis):
    id_a = uuid.uuid4()
    id_b = uuid.uuid4()

    a = await inventory_service._acquire_lock(id_a)
    b = await inventory_service._acquire_lock(id_b)

    assert a is True
    assert b is True

    await inventory_service._release_lock(id_a)
    await inventory_service._release_lock(id_b)

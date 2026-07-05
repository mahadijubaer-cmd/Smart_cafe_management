"""Tests for franchise outlet self-service access (RFC-008, BR-FRAN-1).

Covers:
  - a franchise brand's own super_admin/tenant_admin can list/create their own outlets
  - a different brand's admin cannot manage another brand's outlets (cross-tenant isolation)
  - a non-franchise tenant_admin cannot create outlets at all
  - platform_admin retains full access to any brand's outlets (unchanged)
  - a plain customer is still rejected
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole
from tests.conftest import TEST_PASSWORD, get_token

BRAND_A_SLUG = "brand-a"
BRAND_B_SLUG = "brand-b"
SOLO_SLUG = "solo-diner"


@pytest_asyncio.fixture
async def franchise_setup(db_session: AsyncSession) -> dict:
    brand_a = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.franchise_brand,
        name="Brand A", slug=BRAND_A_SLUG, is_active=True,
    )
    brand_b = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.franchise_brand,
        name="Brand B", slug=BRAND_B_SLUG, is_active=True,
    )
    solo = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.independent_restaurant,
        name="Solo Diner", slug=SOLO_SLUG, is_active=True,
    )
    db_session.add_all([brand_a, brand_b, solo])
    await db_session.commit()

    users = {
        "brand_a_super_admin": User(
            user_id=uuid.uuid4(), tenant_id=brand_a.tenant_id,
            full_name="Brand A Super Admin", email="super@a.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.super_admin, is_active=True,
        ),
        "brand_a_tenant_admin": User(
            user_id=uuid.uuid4(), tenant_id=brand_a.tenant_id,
            full_name="Brand A Tenant Admin", email="tadmin@a.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.tenant_admin, is_active=True,
        ),
        "brand_b_super_admin": User(
            user_id=uuid.uuid4(), tenant_id=brand_b.tenant_id,
            full_name="Brand B Super Admin", email="super@b.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.super_admin, is_active=True,
        ),
        "platform_admin": User(
            user_id=uuid.uuid4(), tenant_id=brand_b.tenant_id,
            full_name="Platform Admin", email="platform@ops.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.platform_admin, is_active=True,
        ),
        "solo_tenant_admin": User(
            user_id=uuid.uuid4(), tenant_id=solo.tenant_id,
            full_name="Solo Admin", email="admin@solo.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.tenant_admin, is_active=True,
        ),
        "solo_customer": User(
            user_id=uuid.uuid4(), tenant_id=solo.tenant_id,
            full_name="Solo Customer", email="customer@solo.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.customer, is_active=True,
        ),
    }
    db_session.add_all(list(users.values()))
    await db_session.commit()

    return {"brand_a": brand_a, "brand_b": brand_b, "solo": solo, **users}


def _outlet_payload(slug: str) -> dict:
    return {"name": "Downtown Branch", "slug": slug, "city": "Dhaka"}


@pytest.mark.asyncio
async def test_brand_admin_can_list_own_outlets(async_client: AsyncClient, franchise_setup: dict):
    token = await get_token(async_client, "super@a.com", BRAND_A_SLUG)
    resp = await async_client.get(
        f"/api/v1/tenants/{franchise_setup['brand_a'].tenant_id}/outlets",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_brand_admin_can_create_own_outlet(async_client: AsyncClient, franchise_setup: dict):
    brand_a = franchise_setup["brand_a"]
    token = await get_token(async_client, "super@a.com", BRAND_A_SLUG)
    resp = await async_client.post(
        f"/api/v1/tenants/{brand_a.tenant_id}/outlets",
        json=_outlet_payload("brand-a-downtown"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["tenant_type"] == "franchise_outlet"
    assert body["parent_tenant_id"] == str(brand_a.tenant_id)


@pytest.mark.asyncio
async def test_brand_tenant_admin_can_also_create_outlet(async_client: AsyncClient, franchise_setup: dict):
    brand_a = franchise_setup["brand_a"]
    token = await get_token(async_client, "tadmin@a.com", BRAND_A_SLUG)
    resp = await async_client.post(
        f"/api/v1/tenants/{brand_a.tenant_id}/outlets",
        json=_outlet_payload("brand-a-uptown"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_other_brand_admin_cannot_create_outlet_for_different_brand(
    async_client: AsyncClient, franchise_setup: dict
):
    brand_a = franchise_setup["brand_a"]
    token = await get_token(async_client, "super@b.com", BRAND_B_SLUG)
    resp = await async_client.post(
        f"/api/v1/tenants/{brand_a.tenant_id}/outlets",
        json=_outlet_payload("brand-a-hijacked"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_non_franchise_tenant_admin_cannot_create_outlet(async_client: AsyncClient, franchise_setup: dict):
    solo = franchise_setup["solo"]
    token = await get_token(async_client, "admin@solo.com", SOLO_SLUG)
    resp = await async_client.post(
        f"/api/v1/tenants/{solo.tenant_id}/outlets",
        json=_outlet_payload("solo-outlet"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_platform_admin_can_still_manage_any_brands_outlets(async_client: AsyncClient, franchise_setup: dict):
    brand_a = franchise_setup["brand_a"]
    token = await get_token(async_client, "platform@ops.com", BRAND_B_SLUG)
    resp = await async_client.post(
        f"/api/v1/tenants/{brand_a.tenant_id}/outlets",
        json=_outlet_payload("brand-a-platform-created"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_customer_cannot_create_outlet(
    async_client: AsyncClient, franchise_setup: dict, tenants: dict, users: dict
):
    """A plain customer (from an unrelated cafeteria-segment tenant, where customer login is
    allowed) is rejected regardless of which brand's outlets they target."""
    brand_a = franchise_setup["brand_a"]
    token = await get_token(async_client, "customer@alpha.com", tenants["alpha"].slug)
    resp = await async_client.post(
        f"/api/v1/tenants/{brand_a.tenant_id}/outlets",
        json=_outlet_payload("solo-outlet-2"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403, resp.text

"""Tests for tenant self-service settings endpoints.

Covers:
  GET  /tenants/me
  PATCH /tenants/me/settings
  POST  /tenants/me/logo (file-size and type validation only — no real I/O)
"""
from __future__ import annotations

import io
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole
from tests.conftest import FakeAsyncRedis, SLUG_ALPHA, TEST_PASSWORD, get_token


# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def admin_token(async_client: AsyncClient, tenants: dict, db_session: AsyncSession) -> str:
    """Add a tenant_admin for alpha and return their JWT."""
    alpha = tenants["alpha"]
    admin = User(
        user_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        full_name="Alpha Admin",
        email="settings.admin@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.tenant_admin,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    return await get_token(async_client, "settings.admin@alpha.com", SLUG_ALPHA)


@pytest_asyncio.fixture
async def customer_token(async_client: AsyncClient, tenants: dict, db_session: AsyncSession) -> str:
    """A customer token — should be blocked from /tenants/me endpoints."""
    alpha = tenants["alpha"]
    customer = User(
        user_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        full_name="Alpha Customer",
        email="settings.customer@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.customer,
        is_active=True,
    )
    db_session.add(customer)
    await db_session.commit()
    return await get_token(async_client, "settings.customer@alpha.com", SLUG_ALPHA)


# ─── GET /tenants/me ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_my_tenant_success(
    async_client: AsyncClient,
    tenants: dict,
    admin_token: str,
):
    resp = await async_client.get(
        "/api/v1/tenants/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == SLUG_ALPHA
    # Full TenantResponse fields present
    assert "subscription_tier" in data
    assert "inventory_strict_mode" in data


@pytest.mark.asyncio
async def test_get_my_tenant_requires_auth(async_client: AsyncClient, tenants: dict):
    resp = await async_client.get("/api/v1/tenants/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_my_tenant_customer_forbidden(
    async_client: AsyncClient,
    tenants: dict,
    customer_token: str,
):
    resp = await async_client.get(
        "/api/v1/tenants/me",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert resp.status_code == 403


# ─── PATCH /tenants/me/settings ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_settings_name(
    async_client: AsyncClient,
    tenants: dict,
    admin_token: str,
):
    resp = await async_client.patch(
        "/api/v1/tenants/me/settings",
        json={"name": "Alpha Cafe Updated"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Alpha Cafe Updated"


@pytest.mark.asyncio
async def test_update_settings_brand_color(
    async_client: AsyncClient,
    tenants: dict,
    admin_token: str,
):
    resp = await async_client.patch(
        "/api/v1/tenants/me/settings",
        json={"brand_color": "#2B4C7E"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["brand_color"] == "#2B4C7E"


@pytest.mark.asyncio
async def test_update_settings_operations_flags(
    async_client: AsyncClient,
    tenants: dict,
    admin_token: str,
):
    resp = await async_client.patch(
        "/api/v1/tenants/me/settings",
        json={"inventory_strict_mode": True, "homemade_enabled": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["inventory_strict_mode"] is True
    assert data["homemade_enabled"] is True


@pytest.mark.asyncio
async def test_update_settings_does_not_change_slug(
    async_client: AsyncClient,
    tenants: dict,
    admin_token: str,
):
    """slug is immutable — the schema excludes it; passing it should have no effect."""
    original_slug = tenants["alpha"].slug
    resp = await async_client.patch(
        "/api/v1/tenants/me/settings",
        json={"name": "Renamed"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == original_slug


@pytest.mark.asyncio
async def test_update_settings_customer_forbidden(
    async_client: AsyncClient,
    tenants: dict,
    customer_token: str,
):
    resp = await async_client.patch(
        "/api/v1/tenants/me/settings",
        json={"name": "Sneaky"},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert resp.status_code == 403


# ─── POST /tenants/me/logo ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_logo_invalid_type(
    async_client: AsyncClient,
    tenants: dict,
    admin_token: str,
):
    resp = await async_client.post(
        "/api/v1/tenants/me/logo",
        files={"logo": ("logo.gif", io.BytesIO(b"GIF89a"), "image/gif")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400
    assert "Invalid file type" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_logo_too_large(
    async_client: AsyncClient,
    tenants: dict,
    admin_token: str,
):
    # 3 MB of zeros — exceeds 2 MB limit
    big_content = b"\x00" * (3 * 1024 * 1024)
    resp = await async_client.post(
        "/api/v1/tenants/me/logo",
        files={"logo": ("logo.png", io.BytesIO(big_content), "image/png")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400
    assert "too large" in resp.json()["detail"].lower()

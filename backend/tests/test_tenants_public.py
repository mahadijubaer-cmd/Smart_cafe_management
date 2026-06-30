"""Tests for GET /tenants/public and GET /tenants/public/{slug}.

Public endpoints require no authentication. They return only active tenants
and expose a safe subset of fields (no billing, subscription, or contact info).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant, TenantType
from tests.conftest import SLUG_ALPHA, SLUG_BETA


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _set_active(db: AsyncSession, slug: str, value: bool) -> None:
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one()
    tenant.is_active = value
    await db.commit()


# ─── Tests ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_public_tenants_no_auth_required(async_client: AsyncClient):
    """GET /tenants/public succeeds without an Authorization header."""
    resp = await async_client.get("/api/v1/tenants/public")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_public_tenants_returns_active_only(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
):
    """Inactive tenants are excluded from the public list."""
    await _set_active(db_session, SLUG_BETA, False)

    resp = await async_client.get("/api/v1/tenants/public")
    assert resp.status_code == 200
    data = resp.json()

    slugs = [item["slug"] for item in data["items"]]
    assert SLUG_ALPHA in slugs
    assert SLUG_BETA not in slugs


@pytest.mark.asyncio
async def test_list_public_tenants_returns_correct_fields(
    async_client: AsyncClient,
    tenants: dict,
):
    """Public list includes only safe public fields; no subscription or billing fields."""
    resp = await async_client.get("/api/v1/tenants/public")
    assert resp.status_code == 200
    item = resp.json()["items"][0]

    # Required public fields
    assert "name" in item
    assert "slug" in item
    assert "tenant_type" in item
    assert "brand_color" in item
    assert "is_active" in item

    # Internal fields must NOT be present
    assert "subscription_tier" not in item
    assert "contact_email" not in item
    assert "inventory_strict_mode" not in item
    assert "tenant_id" not in item


@pytest.mark.asyncio
async def test_list_public_tenants_search_by_name(
    async_client: AsyncClient,
    tenants: dict,
):
    """Query ?q filters results by name (case-insensitive)."""
    resp = await async_client.get("/api/v1/tenants/public", params={"q": "alpha"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == SLUG_ALPHA


@pytest.mark.asyncio
async def test_list_public_tenants_search_no_match(
    async_client: AsyncClient,
    tenants: dict,
):
    """A query that matches nothing returns an empty list, not 404."""
    resp = await async_client.get("/api/v1/tenants/public", params={"q": "xyznonexistent"})
    assert resp.status_code == 200
    assert resp.json()["total"] == 0
    assert resp.json()["items"] == []


@pytest.mark.asyncio
async def test_get_public_tenant_by_slug_success(
    async_client: AsyncClient,
    tenants: dict,
):
    """GET /tenants/public/{slug} returns the tenant detail response."""
    resp = await async_client.get(f"/api/v1/tenants/public/{SLUG_ALPHA}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == SLUG_ALPHA
    # TenantPublicDetailResponse includes allowed_email_domain
    assert "allowed_email_domain" in data


@pytest.mark.asyncio
async def test_get_public_tenant_not_found(
    async_client: AsyncClient,
    tenants: dict,
):
    """GET /tenants/public/{slug} returns 404 for an unknown slug."""
    resp = await async_client.get("/api/v1/tenants/public/does-not-exist")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_public_tenant_inactive_returns_404(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
):
    """An inactive tenant is not reachable via the public detail endpoint."""
    await _set_active(db_session, SLUG_ALPHA, False)

    resp = await async_client.get(f"/api/v1/tenants/public/{SLUG_ALPHA}")
    assert resp.status_code == 404

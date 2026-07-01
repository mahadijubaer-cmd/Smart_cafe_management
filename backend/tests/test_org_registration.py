"""Tests for POST /tenants/register — public organization onboarding (RFC-006).

Covers business rules BR-ORG-1..7:
  - creates a tenant + first admin, returns a working JWT
  - duplicate slug rejected (BR-ORG-2)
  - non-self-serve tenant type rejected (BR-ORG-1)
  - weak password rejected (BR-ORG-6)
  - food_court -> first admin role is food_court_admin (BR-ORG-5)
  - the created admin can log in via /auth/login (end-to-end)
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient


def _payload(slug: str, tenant_type: str = "independent_restaurant", password: str = "Owner@1234"):
    return {
        "organization": {
            "name": "Green Fork Bistro",
            "slug": slug,
            "tenant_type": tenant_type,
            "city": "Dhaka",
            "contact_email": "owner@greenfork.com",
            "brand_color": "#2D6A4F",
        },
        "admin": {
            "full_name": "Owner Person",
            "email": "owner@greenfork.com",
            "password": password,
        },
    }


@pytest.mark.asyncio
async def test_register_org_creates_tenant_and_admin(async_client: AsyncClient):
    """Happy path: returns 201 + a JWT with tenant_admin role and the new slug."""
    resp = await async_client.post("/api/v1/tenants/register", json=_payload("green-fork"))
    assert resp.status_code == 201, resp.text

    data = resp.json()
    assert data["access_token"]
    assert data["role"] == "tenant_admin"
    assert data["tenant_slug"] == "green-fork"
    assert data["tenant_type"] == "independent_restaurant"
    assert data["outlet_id"] is None


@pytest.mark.asyncio
async def test_register_org_token_works_on_tenants_me(async_client: AsyncClient):
    """The returned JWT authenticates against a protected admin endpoint."""
    resp = await async_client.post("/api/v1/tenants/register", json=_payload("token-org"))
    token = resp.json()["access_token"]

    me = await async_client.get(
        "/api/v1/tenants/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    body = me.json()
    assert body["slug"] == "token-org"
    assert body["subscription_tier"] == "free"   # BR-ORG-4
    assert body["is_active"] is True


@pytest.mark.asyncio
async def test_register_org_duplicate_slug_rejected(async_client: AsyncClient):
    """BR-ORG-2: a taken slug returns 400."""
    await async_client.post("/api/v1/tenants/register", json=_payload("dup-org"))
    resp = await async_client.post(
        "/api/v1/tenants/register", json=_payload("dup-org")
    )
    assert resp.status_code == 400
    assert "taken" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_org_non_self_serve_type_rejected(async_client: AsyncClient):
    """BR-ORG-1: food_court_vendor cannot self-register."""
    resp = await async_client.post(
        "/api/v1/tenants/register",
        json=_payload("bad-vendor", tenant_type="food_court_vendor"),
    )
    assert resp.status_code == 400
    assert "self-registered" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_org_outlet_type_rejected(async_client: AsyncClient):
    """BR-ORG-1: franchise_outlet cannot self-register."""
    resp = await async_client.post(
        "/api/v1/tenants/register",
        json=_payload("bad-outlet", tenant_type="franchise_outlet"),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_register_org_weak_password_rejected(async_client: AsyncClient):
    """BR-ORG-6: an 8+ char password lacking complexity returns 400."""
    resp = await async_client.post(
        "/api/v1/tenants/register",
        json=_payload("weak-org", password="password1"),  # no uppercase/special
    )
    assert resp.status_code == 400
    assert "password" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_food_court_admin_role(async_client: AsyncClient):
    """BR-ORG-5: a food_court tenant's first admin is food_court_admin."""
    resp = await async_client.post(
        "/api/v1/tenants/register",
        json=_payload("food-hall", tenant_type="food_court"),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["role"] == "food_court_admin"
    assert resp.json()["tenant_type"] == "food_court"


@pytest.mark.asyncio
async def test_register_org_admin_can_login(async_client: AsyncClient):
    """End-to-end: the created admin can log in via /auth/login under the new slug."""
    await async_client.post("/api/v1/tenants/register", json=_payload("login-org"))

    login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "owner@greenfork.com", "password": "Owner@1234", "tenant_slug": "login-org"},
    )
    assert login.status_code == 200
    assert login.json()["role"] == "tenant_admin"

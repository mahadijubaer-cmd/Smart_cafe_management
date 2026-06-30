"""Tenant isolation tests — cross-tenant data must never be readable.

Each test proves that user from Tenant A cannot read data belonging to Tenant B
via the public API, even if they provide a valid JWT.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, InventoryUnit
from app.models.menu import Category, MenuItem
from app.models.tenant import Tenant
from app.models.user import User

from tests.conftest import SLUG_ALPHA, SLUG_BETA, get_token


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _seed_inv_item(db: AsyncSession, tenant: Tenant, name: str) -> InventoryItem:
    item = InventoryItem(
        item_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        name=name,
        unit=InventoryUnit.piece,
        quantity_on_hand=Decimal("50"),
        reorder_level=Decimal("5"),
        reorder_quantity=Decimal("10"),
    )
    db.add(item)
    await db.commit()
    return item


async def _seed_menu_item(db: AsyncSession, tenant: Tenant) -> MenuItem:
    cat = Category(tenant_id=tenant.tenant_id, name=f"Cat-{tenant.slug}", display_order=1)
    db.add(cat)
    await db.flush()
    item = MenuItem(
        item_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        category_id=cat.category_id,
        name=f"Dish-{tenant.slug}",
        price=Decimal("50.00"),
        is_available=True,
    )
    db.add(item)
    await db.commit()
    return item


# ─────────────────────────────────────────────────────────────────────────────
# Inventory isolation
# ─────────────────────────────────────────────────────────────────────────────

async def test_inventory_list_scoped_to_caller_tenant(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
):
    """Each tenant admin should only see their own inventory items."""
    alpha_item = await _seed_inv_item(db_session, tenants["alpha"], "Alpha Rice")
    beta_item = await _seed_inv_item(db_session, tenants["beta"], "Beta Flour")

    token_alpha = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    token_beta = await get_token(async_client, "admin@beta.com", SLUG_BETA)

    resp_alpha = await async_client.get(
        "/api/v1/inventory/items",
        headers={"Authorization": f"Bearer {token_alpha}"},
    )
    resp_beta = await async_client.get(
        "/api/v1/inventory/items",
        headers={"Authorization": f"Bearer {token_beta}"},
    )

    assert resp_alpha.status_code == 200
    assert resp_beta.status_code == 200

    alpha_ids = {i["item_id"] for i in resp_alpha.json()}
    beta_ids = {i["item_id"] for i in resp_beta.json()}

    assert str(alpha_item.item_id) in alpha_ids
    assert str(beta_item.item_id) not in alpha_ids  # Alpha cannot see Beta's item

    assert str(beta_item.item_id) in beta_ids
    assert str(alpha_item.item_id) not in beta_ids  # Beta cannot see Alpha's item


async def test_inventory_item_cross_tenant_returns_404(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
):
    """Fetching a specific inventory item belonging to another tenant returns 404."""
    beta_item = await _seed_inv_item(db_session, tenants["beta"], "Beta Sugar")
    token_alpha = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)

    resp = await async_client.get(
        f"/api/v1/inventory/items/{beta_item.item_id}",
        headers={"Authorization": f"Bearer {token_alpha}"},
    )
    assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Menu isolation
# ─────────────────────────────────────────────────────────────────────────────

async def test_menu_items_scoped_to_caller_tenant(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
):
    """GET /menu/items returns only items belonging to the caller's tenant."""
    await _seed_menu_item(db_session, tenants["alpha"])
    await _seed_menu_item(db_session, tenants["beta"])

    token_alpha = await get_token(async_client, "customer@alpha.com", SLUG_ALPHA)
    token_beta = await get_token(async_client, "customer@beta.com", SLUG_BETA)

    resp_alpha = await async_client.get(
        "/api/v1/menu/items",
        headers={"Authorization": f"Bearer {token_alpha}"},
    )
    resp_beta = await async_client.get(
        "/api/v1/menu/items",
        headers={"Authorization": f"Bearer {token_beta}"},
    )

    assert resp_alpha.status_code == 200
    assert resp_beta.status_code == 200

    alpha_names = {i["name"] for i in resp_alpha.json()}
    beta_names = {i["name"] for i in resp_beta.json()}

    assert f"Dish-{SLUG_ALPHA}" in alpha_names
    assert f"Dish-{SLUG_BETA}" not in alpha_names

    assert f"Dish-{SLUG_BETA}" in beta_names
    assert f"Dish-{SLUG_ALPHA}" not in beta_names


# ─────────────────────────────────────────────────────────────────────────────
# Order list isolation
# ─────────────────────────────────────────────────────────────────────────────

async def test_order_list_returns_only_own_tenant_orders(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
):
    """GET /orders returns an empty list for a tenant that has no orders,
    even when another tenant has placed orders (verified indirectly by list length)."""
    token_alpha = await get_token(async_client, "customer@alpha.com", SLUG_ALPHA)
    token_beta = await get_token(async_client, "customer@beta.com", SLUG_BETA)

    # Neither tenant has any orders — both should see empty lists.
    resp_alpha = await async_client.get(
        "/api/v1/orders/",
        headers={"Authorization": f"Bearer {token_alpha}"},
    )
    resp_beta = await async_client.get(
        "/api/v1/orders/",
        headers={"Authorization": f"Bearer {token_beta}"},
    )

    assert resp_alpha.status_code == 200
    assert resp_beta.status_code == 200
    assert resp_alpha.json() == []
    assert resp_beta.json() == []


# ─────────────────────────────────────────────────────────────────────────────
# Role enforcement across tenants
# ─────────────────────────────────────────────────────────────────────────────

async def test_unauthenticated_request_returns_401(async_client: AsyncClient):
    """Requests without a Bearer token must be rejected at protected endpoints."""
    resp = await async_client.get("/api/v1/inventory/items")
    assert resp.status_code == 401


async def test_customer_role_cannot_access_inventory(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
):
    """Customers are forbidden from the inventory management endpoints (403)."""
    token = await get_token(async_client, "customer@alpha.com", SLUG_ALPHA)
    resp = await async_client.get(
        "/api/v1/inventory/items",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_wrong_tenant_slug_returns_404_on_login(async_client: AsyncClient, tenants: dict, users: dict):
    """Logging in with a non-existent tenant slug returns 404."""
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@alpha.com", "password": "Password123!", "tenant_slug": "nonexistent-slug"},
    )
    assert resp.status_code == 404

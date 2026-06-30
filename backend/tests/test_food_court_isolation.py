"""Food court isolation tests — Sprint 8.5 / Phase 13.

Verifies:
  1. vendor tenant_admin gets 403 on /food-court/ endpoints
  2. food_court_admin sees active orders from ALL vendors (family scope)
  3. server can deliver any vendor's order
  4. vendor A cannot read vendor B's orders via regular /orders/ API
  5. vendor A's menu is not visible to vendor B via /menu/items
  6. food_court_admin cannot read vendor-specific inventory

Must all pass before the demo (doc Section 6.4 critical isolation note).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.menu import Category, MenuItem
from app.models.order import Order, OrderStatus
from app.models.table import TablesMap
from app.models.tenant import SubscriptionTier, Tenant, TenantType
from app.models.user import User, UserRole
from tests.conftest import TEST_PASSWORD, get_token


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures — food court world
# ─────────────────────────────────────────────────────────────────────────────

FC_SLUG    = "unimart-hall"
VA_SLUG    = "unimart-burger"
VB_SLUG    = "unimart-sushi"

FC_ADMIN_EMAIL = "fc_admin@unimart.test"
SERVER_EMAIL   = "server1@unimart.test"
VA_ADMIN_EMAIL = "burger_admin@unimart.test"
VB_ADMIN_EMAIL = "sushi_admin@unimart.test"


@pytest.fixture
async def fc_tenants(db_session: AsyncSession) -> dict:
    """Seed a food court parent + two vendor tenants."""
    fc = Tenant(
        tenant_id=uuid.uuid4(),
        tenant_type=TenantType.food_court,
        name="Unimart Food Hall",
        slug=FC_SLUG,
        subscription_tier=SubscriptionTier.professional,
        is_active=True,
    )
    db_session.add(fc)
    await db_session.flush()

    va = Tenant(
        tenant_id=uuid.uuid4(),
        tenant_type=TenantType.food_court_vendor,
        name="Burger Joint",
        slug=VA_SLUG,
        parent_tenant_id=fc.tenant_id,
        subscription_tier=SubscriptionTier.starter,
        is_active=True,
    )
    vb = Tenant(
        tenant_id=uuid.uuid4(),
        tenant_type=TenantType.food_court_vendor,
        name="Sushi Bar",
        slug=VB_SLUG,
        parent_tenant_id=fc.tenant_id,
        subscription_tier=SubscriptionTier.starter,
        is_active=True,
    )
    db_session.add_all([va, vb])
    await db_session.commit()
    return {"fc": fc, "va": va, "vb": vb}


@pytest.fixture
async def fc_users(db_session: AsyncSession, fc_tenants: dict) -> dict:
    """Seed food court admin, shared server, and both vendor admins."""
    pw = hash_password(TEST_PASSWORD)
    fc = fc_tenants["fc"]
    va = fc_tenants["va"]
    vb = fc_tenants["vb"]

    fc_admin = User(
        user_id=uuid.uuid4(), tenant_id=fc.tenant_id,
        full_name="FC Admin", email=FC_ADMIN_EMAIL,
        password_hash=pw, role=UserRole.food_court_admin, is_active=True,
    )
    server = User(
        user_id=uuid.uuid4(), tenant_id=fc.tenant_id,
        full_name="Floor Server", email=SERVER_EMAIL,
        password_hash=pw, role=UserRole.server, is_active=True,
    )
    va_admin = User(
        user_id=uuid.uuid4(), tenant_id=va.tenant_id,
        full_name="Burger Admin", email=VA_ADMIN_EMAIL,
        password_hash=pw, role=UserRole.tenant_admin, is_active=True,
    )
    vb_admin = User(
        user_id=uuid.uuid4(), tenant_id=vb.tenant_id,
        full_name="Sushi Admin", email=VB_ADMIN_EMAIL,
        password_hash=pw, role=UserRole.tenant_admin, is_active=True,
    )
    db_session.add_all([fc_admin, server, va_admin, vb_admin])
    await db_session.commit()
    return {
        "fc_admin": fc_admin,
        "server": server,
        "va_admin": va_admin,
        "vb_admin": vb_admin,
    }


async def _seed_menu_item(db: AsyncSession, tenant: Tenant, name: str) -> MenuItem:
    cat = Category(tenant_id=tenant.tenant_id, name=f"Cat-{name[:4]}", display_order=1)
    db.add(cat)
    await db.flush()
    item = MenuItem(
        item_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        category_id=cat.category_id,
        name=name,
        price=Decimal("100.00"),
        is_available=True,
    )
    db.add(item)
    await db.commit()
    return item


async def _seed_order(
    db: AsyncSession, tenant: Tenant, user: User, status: OrderStatus
) -> Order:
    order = Order(
        order_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        user_id=user.user_id,
        time_slot=datetime.now(timezone.utc),
        status=status,
        total_amount=Decimal("200.00"),
    )
    db.add(order)
    await db.commit()
    return order


# ─────────────────────────────────────────────────────────────────────────────
# Test 1 — Vendor admin blocked from food court endpoints
# ─────────────────────────────────────────────────────────────────────────────

async def test_vendor_admin_cannot_access_food_court_vendors_endpoint(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """A vendor tenant_admin's JWT carries tenant_type=food_court_vendor.
    The _require_food_court guard must reject it with 403."""
    token = await get_token(async_client, VA_ADMIN_EMAIL, VA_SLUG)
    resp = await async_client.get(
        "/api/v1/food-court/vendors",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_vendor_admin_cannot_access_food_court_analytics(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """Vendor admin blocked from analytics endpoint as well."""
    token = await get_token(async_client, VB_ADMIN_EMAIL, VB_SLUG)
    resp = await async_client.get(
        "/api/v1/food-court/analytics",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# Test 2 — food_court_admin sees all vendor orders (family scope)
# ─────────────────────────────────────────────────────────────────────────────

async def test_food_court_admin_sees_all_vendor_active_orders(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """GET /food-court/orders/active must include orders from both vendors."""
    va = fc_tenants["va"]
    vb = fc_tenants["vb"]
    va_admin = fc_users["va_admin"]
    vb_admin = fc_users["vb_admin"]

    order_a = await _seed_order(db_session, va, va_admin, OrderStatus.pending)
    order_b = await _seed_order(db_session, vb, vb_admin, OrderStatus.ready)

    token = await get_token(async_client, FC_ADMIN_EMAIL, FC_SLUG)
    resp = await async_client.get(
        "/api/v1/food-court/orders/active",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    order_ids = {o["order_id"] for o in resp.json()}
    assert str(order_a.order_id) in order_ids
    assert str(order_b.order_id) in order_ids


# ─────────────────────────────────────────────────────────────────────────────
# Test 3 — server can deliver any vendor's order
# ─────────────────────────────────────────────────────────────────────────────

async def test_server_can_deliver_vendor_order(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """A server (food court tenant) must be able to mark a vendor's order delivered."""
    va = fc_tenants["va"]
    va_admin = fc_users["va_admin"]

    order = await _seed_order(db_session, va, va_admin, OrderStatus.ready)

    token = await get_token(async_client, SERVER_EMAIL, FC_SLUG)
    resp = await async_client.patch(
        f"/api/v1/food-court/orders/{order.order_id}/deliver",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == OrderStatus.delivered


async def test_server_cannot_deliver_non_ready_order(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """Delivering an order that is still 'pending' must return 400."""
    va = fc_tenants["va"]
    va_admin = fc_users["va_admin"]

    order = await _seed_order(db_session, va, va_admin, OrderStatus.pending)

    token = await get_token(async_client, SERVER_EMAIL, FC_SLUG)
    resp = await async_client.patch(
        f"/api/v1/food-court/orders/{order.order_id}/deliver",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# Test 4 — vendor A cannot read vendor B's orders via /orders/ API
# ─────────────────────────────────────────────────────────────────────────────

async def test_vendor_a_cannot_see_vendor_b_orders(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """The regular /orders/ endpoint must still be fully tenant-scoped.
    Vendor A's token must NOT return vendor B's orders."""
    vb = fc_tenants["vb"]
    vb_admin = fc_users["vb_admin"]

    order_b = await _seed_order(db_session, vb, vb_admin, OrderStatus.confirmed)

    token_a = await get_token(async_client, VA_ADMIN_EMAIL, VA_SLUG)
    resp = await async_client.get(
        "/api/v1/orders/",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 200
    order_ids = {o["order_id"] for o in resp.json()}
    assert str(order_b.order_id) not in order_ids


async def test_vendor_a_gets_404_for_vendor_b_order_by_id(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """Fetching a specific order that belongs to vendor B returns 404 for vendor A's token."""
    vb = fc_tenants["vb"]
    vb_admin = fc_users["vb_admin"]

    order_b = await _seed_order(db_session, vb, vb_admin, OrderStatus.confirmed)

    token_a = await get_token(async_client, VA_ADMIN_EMAIL, VA_SLUG)
    resp = await async_client.get(
        f"/api/v1/orders/{order_b.order_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code in (403, 404)


# ─────────────────────────────────────────────────────────────────────────────
# Test 5 — vendor A's menu not visible to vendor B
# ─────────────────────────────────────────────────────────────────────────────

async def test_vendor_menu_scoped_to_own_tenant(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """GET /menu/items for vendor A must not return vendor B's dishes."""
    va = fc_tenants["va"]
    vb = fc_tenants["vb"]

    await _seed_menu_item(db_session, va, "Cheeseburger")
    await _seed_menu_item(db_session, vb, "Salmon Roll")

    token_a = await get_token(async_client, VA_ADMIN_EMAIL, VA_SLUG)
    resp = await async_client.get(
        "/api/v1/menu/items",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 200
    names = {i["name"] for i in resp.json()}
    assert "Cheeseburger" in names
    assert "Salmon Roll" not in names


# ─────────────────────────────────────────────────────────────────────────────
# Test 6 — food_court_admin cannot read vendor inventory
# ─────────────────────────────────────────────────────────────────────────────

async def test_food_court_admin_cannot_read_vendor_inventory(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """food_court_admin belongs to the food_court parent tenant.
    That tenant has no inventory items, and the admin role is not in the
    allowed-role list for /inventory/items (which requires outlet_admin/
    tenant_admin/super_admin scoped to the vendor's own tenant).
    Result: 403 or empty list depending on role check ordering."""
    token = await get_token(async_client, FC_ADMIN_EMAIL, FC_SLUG)
    resp = await async_client.get(
        "/api/v1/inventory/items",
        headers={"Authorization": f"Bearer {token}"},
    )
    # food_court_admin is not in the inventory router's allowed roles
    assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# Test 7 — unified menu lists both vendors
# ─────────────────────────────────────────────────────────────────────────────

async def test_unified_menu_shows_both_vendors(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fc_tenants: dict,
    fc_users: dict,
    fake_redis,
):
    """GET /food-court/menu for fc_admin must return items from both vendors."""
    va = fc_tenants["va"]
    vb = fc_tenants["vb"]

    await _seed_menu_item(db_session, va, "Burger")
    await _seed_menu_item(db_session, vb, "Sushi")

    token = await get_token(async_client, FC_ADMIN_EMAIL, FC_SLUG)
    resp = await async_client.get(
        "/api/v1/food-court/menu",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    vendor_names = {v["vendor_name"] for v in resp.json()}
    assert "Burger Joint" in vendor_names
    assert "Sushi Bar" in vendor_names

    all_items = [item for v in resp.json() for item in v["items"]]
    item_names = {i["name"] for i in all_items}
    assert "Burger" in item_names
    assert "Sushi" in item_names

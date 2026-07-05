"""RFC-007 (Phase 22): public/guest ordering surface + BR-SEG-1 segment gate.

Uses the `beta` tenant from conftest (tenant_type=independent_restaurant, i.e.
restaurant segment) as the guest-ordering venue, and `alpha` (academic, i.e.
cafeteria segment) to prove the segment gate blocks non-restaurant tenants.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.menu import Category, MenuItem
from app.models.table import TablesMap
from app.models.tenant import SubscriptionTier, Tenant, TenantType
from app.models.user import User, UserRole

from tests.conftest import SLUG_ALPHA, SLUG_BETA, TEST_PASSWORD, get_token


async def _enable_public_menu(db: AsyncSession, tenant: Tenant, slug: str) -> None:
    tenant.public_menu_enabled = True
    tenant.public_slug = slug
    await db.commit()


async def _seed_menu(db: AsyncSession, tenant: Tenant) -> MenuItem:
    category = Category(tenant_id=tenant.tenant_id, name="Mains", display_order=0)
    db.add(category)
    await db.flush()
    item = MenuItem(
        item_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        category_id=category.category_id,
        name="Burger",
        price=250,
        is_available=True,
    )
    db.add(item)
    await db.commit()
    return item


async def _seed_table(db: AsyncSession, tenant: Tenant, table_number: str = "T-01") -> TablesMap:
    table = TablesMap(tenant_id=tenant.tenant_id, table_number=table_number)
    db.add(table)
    await db.commit()
    return table


def _first_order(group_json: dict) -> dict:
    """A guest checkout always returns a GuestOrderGroupResponse — for a
    single-vendor restaurant that group has exactly one order."""
    return group_json["orders"][0]


async def test_public_menu_strips_to_price_and_availability(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)

    resp = await async_client.get("/api/v1/public/beta-diner/menu")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["item_id"] == str(item.item_id)
    assert "cost_price" not in body["items"][0]
    assert "quantity_on_hand" not in body["items"][0]


async def test_public_menu_unknown_slug_404(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/public/does-not-exist/menu")
    assert resp.status_code == 404


async def test_public_menu_disabled_tenant_404(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    beta.public_slug = "beta-diner"
    beta.public_menu_enabled = False
    await db_session.commit()

    resp = await async_client.get("/api/v1/public/beta-diner/menu")
    assert resp.status_code == 404


async def test_cafeteria_segment_public_menu_is_browsable_but_read_only(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    """RFC-007 Phase D: cafeteria-segment tenants may publish a read-only public
    menu, but guest checkout stays restaurant-segment only."""
    alpha = tenants["alpha"]  # academic == cafeteria segment
    await _enable_public_menu(db_session, alpha, "alpha-cafe-menu")
    item = await _seed_menu(db_session, alpha)
    await _seed_table(db_session, alpha, "T-01")

    menu_resp = await async_client.get("/api/v1/public/alpha-cafe-menu/menu")
    assert menu_resp.status_code == 200
    assert len(menu_resp.json()["items"]) == 1

    info_resp = await async_client.get("/api/v1/public/alpha-cafe-menu/info")
    assert info_resp.status_code == 200
    assert info_resp.json()["tenant_type"] == "academic"

    order_resp = await async_client.post(
        "/api/v1/public/alpha-cafe-menu/orders",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "table_number": "T-01",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    assert order_resp.status_code == 400


async def test_guest_order_create_success(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")

    resp = await async_client.post(
        "/api/v1/public/beta-diner/orders",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 2}],
            "table_number": "T-01",
            "guest_name": "Walk-in Guest",
            "guest_phone": "01700000000",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    order = _first_order(body)
    assert order["status"] == "pending_confirmation"
    assert order["order_source"] == "guest_qr"
    assert body["total_amount"] == "500.00"
    assert body["guest_token"]

    # Guest can track their own order
    track = await async_client.get(f"/api/v1/public/orders/{body['guest_token']}")
    assert track.status_code == 200
    assert _first_order(track.json())["order_id"] == order["order_id"]
    assert track.headers["cache-control"] == "no-store"

    # Guest can fetch a QR of their own tracking link (success-screen QR)
    qr_resp = await async_client.get(f"/api/v1/public/orders/{body['guest_token']}/qr")
    assert qr_resp.status_code == 200
    assert qr_resp.json()["data"]  # non-empty base64 payload


async def test_public_order_qr_404_for_unknown_token(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/public/orders/00000000-0000-0000-0000-000000000000/qr")
    assert resp.status_code == 404


async def test_guest_order_online_payment_when_enabled(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    """RFC-007 Phase 2: simulated online payment, opt-in via guest_checkout_mode='online'."""
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    beta.guest_checkout_mode = "online"
    await db_session.commit()
    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")

    create_resp = await async_client.post(
        "/api/v1/public/beta-diner/orders",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "table_number": "T-01",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    guest_token = create_resp.json()["guest_token"]
    assert _first_order(create_resp.json())["payment_status"] == "pending"

    pay_resp = await async_client.post(f"/api/v1/public/orders/{guest_token}/pay")
    assert pay_resp.status_code == 200, pay_resp.text
    assert _first_order(pay_resp.json())["payment_status"] == "paid"

    # Paying twice is rejected
    again = await async_client.post(f"/api/v1/public/orders/{guest_token}/pay")
    assert again.status_code == 400


async def test_guest_order_online_payment_rejected_when_counter_only(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    """Default guest_checkout_mode is 'counter' — online payment endpoint is a 400."""
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")

    create_resp = await async_client.post(
        "/api/v1/public/beta-diner/orders",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "table_number": "T-01",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    guest_token = create_resp.json()["guest_token"]

    pay_resp = await async_client.post(f"/api/v1/public/orders/{guest_token}/pay")
    assert pay_resp.status_code == 400


async def test_tenant_can_enable_online_guest_checkout_mode(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    beta = tenants["beta"]
    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    resp = await async_client.patch(
        "/api/v1/tenants/me/settings",
        json={"guest_checkout_mode": "online"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["guest_checkout_mode"] == "online"


async def test_cafeteria_tenant_can_enable_public_menu(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    """RFC-007 Phase D: cafeteria-segment tenants may enable public_menu_enabled
    too (read-only browsing) — no longer restaurant-segment only."""
    admin_token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        "/api/v1/tenants/me/settings",
        json={"public_slug": "alpha-cafe-menu", "public_menu_enabled": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["public_menu_enabled"] is True


async def test_guest_order_unknown_table_409(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)

    resp = await async_client.post(
        "/api/v1/public/beta-diner/orders",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "table_number": "T-99",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    assert resp.status_code == 409


async def test_guest_order_rate_limited_after_five_per_minute(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")

    payload = {
        "items": [{"item_id": str(item.item_id), "quantity": 1}],
        "table_number": "T-01",
        "guest_name": "Guest",
        "guest_phone": "01700000000",
    }

    statuses = []
    for _ in range(6):
        resp = await async_client.post("/api/v1/public/beta-diner/orders", json=payload)
        statuses.append(resp.status_code)

    assert statuses.count(429) >= 1
    assert statuses[-1] == 429


async def test_guest_order_appears_in_staff_queue_and_confirmation_gate(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")

    create_resp = await async_client.post(
        "/api/v1/public/beta-diner/orders",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "table_number": "T-01",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    order_id = _first_order(create_resp.json())["order_id"]

    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Staff sees it in the tenant-wide queue with pending_confirmation status.
    list_resp = await async_client.get("/api/v1/orders/", headers=headers)
    assert list_resp.status_code == 200
    matching = [o for o in list_resp.json() if o["order_id"] == order_id]
    assert len(matching) == 1
    assert matching[0]["status"] == "pending_confirmation"
    assert matching[0]["user_id"] is None

    # A guest order cannot skip straight to preparing.
    bad = await async_client.patch(
        f"/api/v1/orders/{order_id}/status", json={"status": "preparing"}, headers=headers
    )
    assert bad.status_code == 400

    # Staff confirms — PUB-3 gate.
    confirm = await async_client.patch(
        f"/api/v1/orders/{order_id}/status", json={"status": "confirmed"}, headers=headers
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "confirmed"

    # Staff marks it paid at the counter (WAL-4 — no wallet involved).
    paid = await async_client.patch(f"/api/v1/orders/{order_id}/mark-paid", headers=headers)
    assert paid.status_code == 200
    assert paid.json()["payment_status"] == "paid"


async def test_guest_order_per_table_pending_cap(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")

    payload = {
        "items": [{"item_id": str(item.item_id), "quantity": 1}],
        "table_number": "T-01",
        "guest_name": "Guest",
        "guest_phone": "01700000000",
    }

    statuses = []
    for _ in range(4):
        resp = await async_client.post(
            "/api/v1/public/beta-diner/orders",
            json={**payload, "guest_phone": f"0170000000{len(statuses)}"},
        )
        statuses.append(resp.status_code)

    # 4th request exceeds the per-table cap of 3 active guest orders (before the
    # rate limit — which allows 5/min — would otherwise kick in).
    assert 409 in statuses


async def test_cross_tenant_public_slug_isolation(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    """A guest order placed against tenant beta's slug must never touch alpha's data."""
    alpha, beta = tenants["alpha"], tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    alpha_item = await _seed_menu(db_session, alpha)
    await _seed_table(db_session, beta, "T-01")

    resp = await async_client.post(
        "/api/v1/public/beta-diner/orders",
        json={
            "items": [{"item_id": str(alpha_item.item_id), "quantity": 1}],
            "table_number": "T-01",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    # alpha's item does not exist under beta's tenant_id scope
    assert resp.status_code == 404


async def test_register_blocked_for_restaurant_segment_tenant(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    """BR-SEG-1: independent_restaurant (restaurant segment) blocks consumer self-registration."""
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "tenant_slug": SLUG_BETA,
            "full_name": "New Guest",
            "email": "newguest@beta.com",
            "password": TEST_PASSWORD,
            "role": "customer",
        },
    )
    assert resp.status_code == 400
    assert "not available" in resp.json()["detail"].lower()


async def test_login_blocked_for_restaurant_segment_customer(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    """BR-SEG-1: closes the login-side gap — a pre-existing customer account on a
    restaurant-segment tenant still cannot log in as a consumer."""
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "customer@beta.com", "password": TEST_PASSWORD, "tenant_slug": SLUG_BETA},
    )
    assert resp.status_code == 403


async def test_login_allowed_for_restaurant_segment_admin(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    """Control case: staff/admin login is unaffected by BR-SEG-1."""
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@beta.com", "password": TEST_PASSWORD, "tenant_slug": SLUG_BETA},
    )
    assert resp.status_code == 200


async def test_register_allowed_for_cafeteria_segment_tenant(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    """Control case: academic (cafeteria segment) is unaffected by BR-SEG-1."""
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "tenant_slug": SLUG_ALPHA,
            "full_name": "New Student",
            "email": "newstudent@alpha.com",
            "password": TEST_PASSWORD,
            "role": "customer",
        },
    )
    assert resp.status_code == 201


async def test_table_qr_encodes_public_menu_url_when_enabled(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    table = await _seed_table(db_session, beta, "T-01")

    resp = await async_client.get(f"/api/v1/qr/table/{table.table_id}/png")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"


async def test_table_qr_sheet_pdf_for_admin(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    await _seed_table(db_session, beta, "T-01")
    await _seed_table(db_session, beta, "T-02")

    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    resp = await async_client.get(
        "/api/v1/qr/table-sheet/pdf", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


async def test_staff_pos_order_confirmed_immediately_and_payable_at_counter(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    """RFC-007 (Phase 22): staff POS entry skips the guest confirmation gate."""
    beta = tenants["beta"]
    item = await _seed_menu(db_session, beta)
    table = await _seed_table(db_session, beta, "T-05")

    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = await async_client.post(
        "/api/v1/orders/staff-pos",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "table_id": table.table_id,
            "guest_name": "Walk-in",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "confirmed"
    assert body["order_source"] == "staff_pos"
    assert body["user_id"] is not None  # attributed to the staff account, not a guest_token

    paid = await async_client.patch(f"/api/v1/orders/{body['order_id']}/mark-paid", headers=headers)
    assert paid.status_code == 200
    assert paid.json()["payment_status"] == "paid"


async def test_mark_paid_rejected_for_customer_app_orders(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    """WAL-4 guard: customer_app orders go through the wallet, not mark-paid."""
    alpha = tenants["alpha"]
    item = await _seed_menu(db_session, alpha)

    users["alpha_customer"].wallet_balance = 1000
    await db_session.commit()

    admin_token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    customer_token = await get_token(async_client, "customer@alpha.com", SLUG_ALPHA)

    order_resp = await async_client.post(
        "/api/v1/orders/",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "time_slot": "2099-01-01T12:00:00Z",
        },
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert order_resp.status_code == 201, order_resp.text

    resp = await async_client.patch(
        f"/api/v1/orders/{order_resp.json()['order_id']}/mark-paid",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


async def test_table_qr_sheet_pdf_404_when_no_tables(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    beta = tenants["beta"]
    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    resp = await async_client.get(
        "/api/v1/qr/table-sheet/pdf", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Food-court multi-vendor guest ordering (RFC-007, Phase D)
# ─────────────────────────────────────────────────────────────────────────────

FC_SLUG = "campus-food-hall"
FC_PUBLIC_SLUG = "campus-eats"
VA_SLUG = "campus-burger"
VB_SLUG = "campus-sushi"
VA_ADMIN_EMAIL = "burger_admin@campus.com"
VB_ADMIN_EMAIL = "sushi_admin@campus.com"


@pytest.fixture
async def fc_tenants(db_session: AsyncSession) -> dict:
    fc = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.food_court, name="Campus Food Hall",
        slug=FC_SLUG, subscription_tier=SubscriptionTier.professional, is_active=True,
        public_menu_enabled=True, public_slug=FC_PUBLIC_SLUG,
    )
    db_session.add(fc)
    await db_session.flush()

    va = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.food_court_vendor, name="Campus Burger",
        slug=VA_SLUG, parent_tenant_id=fc.tenant_id, subscription_tier=SubscriptionTier.starter,
        is_active=True,
    )
    vb = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.food_court_vendor, name="Campus Sushi",
        slug=VB_SLUG, parent_tenant_id=fc.tenant_id, subscription_tier=SubscriptionTier.starter,
        is_active=True,
    )
    db_session.add_all([va, vb])
    await db_session.commit()
    return {"fc": fc, "va": va, "vb": vb}


@pytest.fixture
async def fc_users(db_session: AsyncSession, fc_tenants: dict) -> dict:
    pw = hash_password(TEST_PASSWORD)
    va_admin = User(
        user_id=uuid.uuid4(), tenant_id=fc_tenants["va"].tenant_id, full_name="Burger Admin",
        email=VA_ADMIN_EMAIL, password_hash=pw, role=UserRole.tenant_admin, is_active=True,
    )
    vb_admin = User(
        user_id=uuid.uuid4(), tenant_id=fc_tenants["vb"].tenant_id, full_name="Sushi Admin",
        email=VB_ADMIN_EMAIL, password_hash=pw, role=UserRole.tenant_admin, is_active=True,
    )
    db_session.add_all([va_admin, vb_admin])
    await db_session.commit()
    return {"va_admin": va_admin, "vb_admin": vb_admin}


async def _seed_vendor_item(db: AsyncSession, vendor: Tenant, name: str, price: int) -> MenuItem:
    category = Category(tenant_id=vendor.tenant_id, name=f"{name}-cat", display_order=0)
    db.add(category)
    await db.flush()
    item = MenuItem(
        item_id=uuid.uuid4(), tenant_id=vendor.tenant_id, category_id=category.category_id,
        name=name, price=price, is_available=True,
    )
    db.add(item)
    await db.commit()
    return item


async def test_food_court_public_menu_groups_by_vendor(
    async_client: AsyncClient, db_session: AsyncSession, fc_tenants: dict
):
    burger = await _seed_vendor_item(db_session, fc_tenants["va"], "Cheeseburger", 200)
    sushi = await _seed_vendor_item(db_session, fc_tenants["vb"], "Salmon Roll", 350)

    resp = await async_client.get(f"/api/v1/public/{FC_PUBLIC_SLUG}/menu")
    assert resp.status_code == 200
    body = resp.json()

    assert {v["vendor_name"] for v in body["vendors"]} == {"Campus Burger", "Campus Sushi"}
    item_ids = {i["item_id"] for i in body["items"]}
    assert {str(burger.item_id), str(sushi.item_id)} == item_ids
    vendor_names = {i["item_id"]: i["vendor_name"] for i in body["items"]}
    assert vendor_names[str(burger.item_id)] == "Campus Burger"
    assert vendor_names[str(sushi.item_id)] == "Campus Sushi"


async def test_food_court_guest_cart_splits_into_per_vendor_orders(
    async_client: AsyncClient, db_session: AsyncSession, fc_tenants: dict, fc_users: dict
):
    """A cart spanning two vendors becomes two sibling orders sharing one guest_token."""
    burger = await _seed_vendor_item(db_session, fc_tenants["va"], "Cheeseburger", 200)
    sushi = await _seed_vendor_item(db_session, fc_tenants["vb"], "Salmon Roll", 350)
    await _seed_table(db_session, fc_tenants["fc"], "T-10")

    resp = await async_client.post(
        f"/api/v1/public/{FC_PUBLIC_SLUG}/orders",
        json={
            "items": [
                {"item_id": str(burger.item_id), "quantity": 2},
                {"item_id": str(sushi.item_id), "quantity": 1},
            ],
            "table_number": "T-10",
            "guest_name": "Multi Vendor Guest",
            "guest_phone": "01700000000",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    assert len(body["orders"]) == 2
    assert body["total_amount"] == "750.00"  # 2*200 + 1*350
    vendor_totals = {o["vendor_name"]: o["total_amount"] for o in body["orders"]}
    assert vendor_totals == {"Campus Burger": "400.00", "Campus Sushi": "350.00"}
    # Both orders share one guest_token (one guest session).
    assert all(o["guest_token"] == body["guest_token"] for o in body["orders"])

    guest_token = body["guest_token"]

    # Each vendor's own staff only sees their own order — not the sibling's.
    va_token = await get_token(async_client, VA_ADMIN_EMAIL, VA_SLUG)
    va_orders = await async_client.get(
        "/api/v1/orders/", headers={"Authorization": f"Bearer {va_token}"}
    )
    assert len(va_orders.json()) == 1
    assert va_orders.json()[0]["order_source"] == "guest_qr"

    # Guest tracking returns the whole session (both tickets).
    track = await async_client.get(f"/api/v1/public/orders/{guest_token}")
    assert track.status_code == 200
    assert len(track.json()["orders"]) == 2
    # Regression: vendor attribution must survive a *separate* request, not just
    # the create response (a transient Python attribute wouldn't survive a fresh
    # DB fetch — caught by live-testing in Docker, see CHANGELOG 2026-07-05).
    tracked_vendor_totals = {o["vendor_name"]: o["total_amount"] for o in track.json()["orders"]}
    assert tracked_vendor_totals == {"Campus Burger": "400.00", "Campus Sushi": "350.00"}


async def test_food_court_guest_online_payment_pays_both_vendor_orders(
    async_client: AsyncClient, db_session: AsyncSession, fc_tenants: dict, fc_users: dict
):
    fc_tenants["fc"].guest_checkout_mode = "online"
    await db_session.commit()

    burger = await _seed_vendor_item(db_session, fc_tenants["va"], "Cheeseburger", 200)
    sushi = await _seed_vendor_item(db_session, fc_tenants["vb"], "Salmon Roll", 350)
    await _seed_table(db_session, fc_tenants["fc"], "T-11")

    create_resp = await async_client.post(
        f"/api/v1/public/{FC_PUBLIC_SLUG}/orders",
        json={
            "items": [
                {"item_id": str(burger.item_id), "quantity": 1},
                {"item_id": str(sushi.item_id), "quantity": 1},
            ],
            "table_number": "T-11",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    guest_token = create_resp.json()["guest_token"]

    pay_resp = await async_client.post(f"/api/v1/public/orders/{guest_token}/pay")
    assert pay_resp.status_code == 200, pay_resp.text
    assert all(o["payment_status"] == "paid" for o in pay_resp.json()["orders"])


async def test_food_court_guest_order_cross_food_court_item_404(
    async_client: AsyncClient, db_session: AsyncSession, fc_tenants: dict, tenants: dict[str, Tenant]
):
    """An item belonging to a different tenant (not one of this food court's own
    active vendors) must never be orderable through this food court's slug."""
    await _seed_table(db_session, fc_tenants["fc"], "T-12")
    foreign_item = await _seed_menu(db_session, tenants["beta"])

    resp = await async_client.post(
        f"/api/v1/public/{FC_PUBLIC_SLUG}/orders",
        json={
            "items": [{"item_id": str(foreign_item.item_id), "quantity": 1}],
            "table_number": "T-12",
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    assert resp.status_code == 404

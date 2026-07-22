"""Tests for guest/QR gateway checkout (RFC-011 Stage 3).

Covers:
  GET  /public/{public_slug}/payment-methods
  POST /public/orders/{guest_token}/pay/gateway/initiate
  Settlement via the shared callback endpoint — marks every sibling guest order
  paid directly with no `payments` row (PAY-13).

httpx calls to SSLCommerz are mocked, mirroring test_payment_gateways_sslcommerz.py —
the real sandbox was exercised manually during development, not in this suite.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.menu import Category, MenuItem
from app.models.models import Payment
from app.models.payment_gateway import GatewayTransaction, GatewayTransactionStatus
from app.models.table import TablesMap
from app.models.tenant import Tenant
from app.services.gateways.base import GatewaySession, GatewayValidationResult
from tests.conftest import SLUG_BETA, get_token


@pytest.fixture(autouse=True)
def _encryption_key():
    original = settings.ENCRYPTION_KEY
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    yield
    settings.ENCRYPTION_KEY = original


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


async def _enable_sslcommerz(async_client: AsyncClient, admin_token: str) -> None:
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200


async def _place_guest_order(async_client: AsyncClient, item: MenuItem, table_number: str = "T-01") -> str:
    resp = await async_client.post(
        "/api/v1/public/beta-diner/orders",
        json={
            "items": [{"item_id": str(item.item_id), "quantity": 1}],
            "table_number": table_number,
            "guest_name": "Guest",
            "guest_phone": "01700000000",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["guest_token"]


# ─── GET /public/{public_slug}/payment-methods ────────────────────────────────


@pytest.mark.asyncio
async def test_payment_methods_all_false_when_counter_only(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")

    resp = await async_client.get("/api/v1/public/beta-diner/payment-methods")
    assert resp.status_code == 200
    assert resp.json() == {"wallet": False, "simulation": False, "sslcommerz": False, "bkash": False}


@pytest.mark.asyncio
async def test_payment_methods_reflects_enabled_gateway(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    beta.guest_checkout_mode = "online"
    await db_session.commit()
    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    await _enable_sslcommerz(async_client, admin_token)

    resp = await async_client.get("/api/v1/public/beta-diner/payment-methods")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"wallet": False, "simulation": True, "sslcommerz": True, "bkash": False}


# ─── POST /public/orders/{guest_token}/pay/gateway/initiate ───────────────────


@pytest.mark.asyncio
async def test_guest_gateway_initiate_rejected_when_counter_only(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")
    guest_token = await _place_guest_order(async_client, item)

    resp = await async_client.post(
        f"/api/v1/public/orders/{guest_token}/pay/gateway/initiate",
        json={"gateway_type": "sslcommerz"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_guest_gateway_initiate_success_and_settlement(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    beta.guest_checkout_mode = "online"
    await db_session.commit()
    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    await _enable_sslcommerz(async_client, admin_token)

    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")
    guest_token = await _place_guest_order(async_client, item)

    with patch(
        "app.services.gateways.sslcommerz_gateway.SSLCommerzGateway.initiate",
        new=AsyncMock(return_value=GatewaySession(redirect_url="https://sandbox.sslcommerz.com/fake-guest")),
    ):
        resp = await async_client.post(
            f"/api/v1/public/orders/{guest_token}/pay/gateway/initiate",
            json={"gateway_type": "sslcommerz"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["redirect_url"] == "https://sandbox.sslcommerz.com/fake-guest"

    gtx_result = await db_session.execute(select(GatewayTransaction))
    gtx = gtx_result.scalar_one()
    assert gtx.guest_token is not None
    assert gtx.order_id is None
    assert gtx.status == GatewayTransactionStatus.initiated
    assert Decimal(str(gtx.amount)) == Decimal("250.00")

    with patch(
        "app.services.gateways.sslcommerz_gateway.SSLCommerzGateway.validate",
        new=AsyncMock(return_value=GatewayValidationResult(
            success=True, verified_amount=Decimal("250.00"), external_ref="bank_ref_guest"
        )),
    ):
        callback_resp = await async_client.post(
            f"/api/v1/payments/gateway/{gtx.gateway_transaction_id}/callback/success",
            data={"val_id": "val-guest", "status": "VALID"},
        )
    assert callback_resp.status_code in (302, 303, 307)
    assert "payment=success" in callback_resp.headers["location"]
    assert f"/m/beta-diner/track/{guest_token}" in callback_resp.headers["location"]

    track_resp = await async_client.get(f"/api/v1/public/orders/{guest_token}")
    assert track_resp.json()["orders"][0]["payment_status"] == "paid"

    # PAY-13: guest-session settlement never creates a `payments` row.
    payment_result = await db_session.execute(select(Payment))
    assert payment_result.scalars().all() == []


@pytest.mark.asyncio
async def test_guest_gateway_initiate_rejected_when_already_paid(
    async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant], users: dict
):
    beta = tenants["beta"]
    await _enable_public_menu(db_session, beta, "beta-diner")
    beta.guest_checkout_mode = "online"
    await db_session.commit()
    admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    await _enable_sslcommerz(async_client, admin_token)

    item = await _seed_menu(db_session, beta)
    await _seed_table(db_session, beta, "T-01")
    guest_token = await _place_guest_order(async_client, item)

    pay_resp = await async_client.post(f"/api/v1/public/orders/{guest_token}/pay")
    assert pay_resp.status_code == 200, pay_resp.text

    resp = await async_client.post(
        f"/api/v1/public/orders/{guest_token}/pay/gateway/initiate",
        json={"gateway_type": "sslcommerz"},
    )
    assert resp.status_code == 400

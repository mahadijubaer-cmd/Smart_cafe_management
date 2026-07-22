"""Tests for SSLCommerz gateway checkout (RFC-011 Stage 2).

Covers:
  POST /payments/gateway/initiate
  POST /payments/gateway/{id}/callback/{outcome}
  POST /payments/gateway/ipn
  Idempotency (PAY-8) and amount-verification (PAY-7)

httpx calls to SSLCommerz's own API are mocked here so the committed suite runs
offline/deterministically — the real sandbox was exercised manually during
development (see CHANGELOG), not as part of this automated suite.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.models import Order, Payment
from app.models.order import OrderSource, PaymentStatus
from app.models.payment_gateway import GatewayTransaction, GatewayTransactionStatus
from app.models.user import User, UserRole
from app.services.gateways.base import GatewaySession, GatewayValidationResult
from tests.conftest import SLUG_ALPHA, TEST_PASSWORD, get_token


@pytest.fixture(autouse=True)
def _encryption_key():
    original = settings.ENCRYPTION_KEY
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    yield
    settings.ENCRYPTION_KEY = original


@pytest_asyncio.fixture
async def admin_token(async_client: AsyncClient, tenants: dict, db_session: AsyncSession) -> str:
    alpha = tenants["alpha"]
    admin = User(
        user_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        full_name="Alpha Admin",
        email="ssl.admin@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.tenant_admin,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    return await get_token(async_client, "ssl.admin@alpha.com", SLUG_ALPHA)


@pytest_asyncio.fixture
async def customer(db_session: AsyncSession, tenants: dict) -> User:
    alpha = tenants["alpha"]
    customer = User(
        user_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        full_name="Ssl Customer",
        email="ssl.customer@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.customer,
        is_active=True,
        phone="01711111111",
    )
    db_session.add(customer)
    await db_session.commit()
    await db_session.refresh(customer)
    return customer


@pytest_asyncio.fixture
async def customer_token(async_client: AsyncClient, customer: User) -> str:
    return await get_token(async_client, customer.email, SLUG_ALPHA)


@pytest_asyncio.fixture
async def pending_order(db_session: AsyncSession, tenants: dict, customer: User) -> Order:
    alpha = tenants["alpha"]
    order = Order(
        order_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        user_id=customer.user_id,
        order_source=OrderSource.customer_app,
        time_slot=datetime.now(timezone.utc) + timedelta(hours=1),
        total_amount=Decimal("250.00"),
        discount_amount=Decimal("0.00"),
        payment_status=PaymentStatus.pending,
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)
    return order


async def _enable_sslcommerz(async_client: AsyncClient, admin_token: str) -> None:
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200


# ─── POST /payments/gateway/initiate ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_initiate_requires_configured_gateway(
    async_client: AsyncClient, tenants: dict, customer_token: str, pending_order: Order
):
    resp = await async_client.post(
        "/api/v1/payments/gateway/initiate",
        json={"order_id": str(pending_order.order_id), "gateway_type": "sslcommerz"},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_initiate_success_creates_transaction_and_redirect(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    await _enable_sslcommerz(async_client, admin_token)

    with patch(
        "app.services.gateways.sslcommerz_gateway.SSLCommerzGateway.initiate",
        new=AsyncMock(return_value=GatewaySession(redirect_url="https://sandbox.sslcommerz.com/fake-session")),
    ):
        resp = await async_client.post(
            "/api/v1/payments/gateway/initiate",
            json={"order_id": str(pending_order.order_id), "gateway_type": "sslcommerz"},
            headers={"Authorization": f"Bearer {customer_token}"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["redirect_url"] == "https://sandbox.sslcommerz.com/fake-session"

    result = await db_session.execute(select(GatewayTransaction))
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].order_id == pending_order.order_id
    assert rows[0].status == GatewayTransactionStatus.initiated
    assert Decimal(str(rows[0].amount)) == Decimal("250.00")


@pytest.mark.asyncio
async def test_initiate_already_paid_order_rejected(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    await _enable_sslcommerz(async_client, admin_token)
    pending_order.payment_status = PaymentStatus.paid
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/payments/gateway/initiate",
        json={"order_id": str(pending_order.order_id), "gateway_type": "sslcommerz"},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert resp.status_code == 400


# ─── Settlement (callback + IPN) ──────────────────────────────────────────────


async def _initiate(async_client, admin_token, customer_token, pending_order) -> str:
    await _enable_sslcommerz(async_client, admin_token)
    with patch(
        "app.services.gateways.sslcommerz_gateway.SSLCommerzGateway.initiate",
        new=AsyncMock(return_value=GatewaySession(redirect_url="https://sandbox.sslcommerz.com/fake")),
    ):
        resp = await async_client.post(
            "/api/v1/payments/gateway/initiate",
            json={"order_id": str(pending_order.order_id), "gateway_type": "sslcommerz"},
            headers={"Authorization": f"Bearer {customer_token}"},
        )
    return resp.json()["gateway_transaction_id"]


@pytest.mark.asyncio
async def test_callback_success_marks_paid(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    with patch(
        "app.services.gateways.sslcommerz_gateway.SSLCommerzGateway.validate",
        new=AsyncMock(return_value=GatewayValidationResult(
            success=True, verified_amount=Decimal("250.00"), external_ref="bank_ref_123"
        )),
    ):
        resp = await async_client.post(
            f"/api/v1/payments/gateway/{gtx_id}/callback/success",
            data={"val_id": "val-123", "status": "VALID"},
        )

    assert resp.status_code in (302, 303, 307)
    assert "payment=success" in resp.headers["location"]

    await db_session.refresh(pending_order)
    assert pending_order.payment_status == PaymentStatus.paid

    gtx_result = await db_session.execute(select(GatewayTransaction))
    gtx = gtx_result.scalar_one()
    assert gtx.status == GatewayTransactionStatus.success
    assert gtx.gateway_external_ref == "bank_ref_123"

    payment_result = await db_session.execute(select(Payment).where(Payment.order_id == pending_order.order_id))
    payment = payment_result.scalar_one()
    assert payment.transaction_ref == "bank_ref_123"
    assert Decimal(str(payment.amount)) == Decimal("250.00")


@pytest.mark.asyncio
async def test_callback_amount_mismatch_rejected(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    """PAY-7: a validated amount that doesn't match must never mark the order paid."""
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    with patch(
        "app.services.gateways.sslcommerz_gateway.SSLCommerzGateway.validate",
        new=AsyncMock(return_value=GatewayValidationResult(
            success=True, verified_amount=Decimal("1.00"), external_ref="bank_ref_tampered"
        )),
    ):
        resp = await async_client.post(
            f"/api/v1/payments/gateway/{gtx_id}/callback/success",
            data={"val_id": "val-123", "status": "VALID"},
        )

    assert "payment=failed" in resp.headers["location"]
    await db_session.refresh(pending_order)
    assert pending_order.payment_status == PaymentStatus.pending

    payment_result = await db_session.execute(select(Payment).where(Payment.order_id == pending_order.order_id))
    assert payment_result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_callback_cancel_marks_cancelled_no_payment(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    resp = await async_client.post(f"/api/v1/payments/gateway/{gtx_id}/callback/cancel", data={})
    assert "payment=cancelled" in resp.headers["location"]

    gtx_result = await db_session.execute(select(GatewayTransaction))
    gtx = gtx_result.scalar_one()
    assert gtx.status == GatewayTransactionStatus.cancelled

    await db_session.refresh(pending_order)
    assert pending_order.payment_status == PaymentStatus.pending


@pytest.mark.asyncio
async def test_duplicate_settlement_is_idempotent(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    """PAY-8: a callback followed by an IPN for the same transaction must not double-settle."""
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    validate_mock = AsyncMock(return_value=GatewayValidationResult(
        success=True, verified_amount=Decimal("250.00"), external_ref="bank_ref_dup"
    ))
    with patch("app.services.gateways.sslcommerz_gateway.SSLCommerzGateway.validate", new=validate_mock):
        first = await async_client.post(
            f"/api/v1/payments/gateway/{gtx_id}/callback/success",
            data={"val_id": "val-123", "status": "VALID"},
        )
        assert "payment=success" in first.headers["location"]

        # Simulate the IPN arriving after the callback already settled it.
        ipn_resp = await async_client.post(
            "/api/v1/payments/gateway/ipn",
            data={"tran_id": uuid.UUID(gtx_id).hex, "val_id": "val-123", "status": "VALID"},
        )
        assert ipn_resp.status_code == 200

    # validate() must only have been called once — the second settlement attempt short-circuits
    # on the terminal-status check before ever calling the gateway again.
    assert validate_mock.await_count == 1

    payment_result = await db_session.execute(select(Payment).where(Payment.order_id == pending_order.order_id))
    assert len(payment_result.scalars().all()) == 1

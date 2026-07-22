"""Tests for native bKash gateway checkout (RFC-011 Stage 4).

Covers:
  POST /payments/gateway/initiate (gateway_type=bkash)
  GET  /payments/gateway/{id}/bkash-callback
  Idempotency (PAY-8) and amount-verification via Execute Payment (PAY-7/PAY-14)

httpx calls to bKash's own API are mocked here — bKash has no universally-published
public sandbox credential pair the way SSLCommerz's testbox/qwerty is, so this suite
is unit-tested against the documented API contract only, not smoke-tested live.
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
        email="bkash.admin@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.tenant_admin,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    return await get_token(async_client, "bkash.admin@alpha.com", SLUG_ALPHA)


@pytest_asyncio.fixture
async def customer(db_session: AsyncSession, tenants: dict) -> User:
    alpha = tenants["alpha"]
    customer = User(
        user_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        full_name="Bkash Customer",
        email="bkash.customer@alpha.com",
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
        total_amount=Decimal("400.00"),
        discount_amount=Decimal("0.00"),
        payment_status=PaymentStatus.pending,
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)
    return order


async def _enable_bkash(async_client: AsyncClient, admin_token: str) -> None:
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/bkash",
        json={
            "is_enabled": True,
            "is_sandbox": True,
            "username": "sandboxTokenizedUser02",
            "app_key": "test-app-key",
            "app_secret": "test-app-secret",
            "password": "test-password",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200


_GRANT_RESPONSE = {"statusCode": "0000", "id_token": "fake-id-token", "expires_in": "3600"}


# ─── POST /payments/gateway/initiate (bkash) ─────────────────────────────────


@pytest.mark.asyncio
async def test_bkash_initiate_success_creates_transaction_and_redirect(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    await _enable_bkash(async_client, admin_token)

    with patch(
        "app.services.gateways.bkash_gateway.BkashGateway.initiate",
        new=AsyncMock(return_value=GatewaySession(redirect_url="https://tokenized.sandbox.bka.sh/fake-session")),
    ):
        resp = await async_client.post(
            "/api/v1/payments/gateway/initiate",
            json={"order_id": str(pending_order.order_id), "gateway_type": "bkash"},
            headers={"Authorization": f"Bearer {customer_token}"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["redirect_url"] == "https://tokenized.sandbox.bka.sh/fake-session"

    result = await db_session.execute(select(GatewayTransaction))
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].gateway_type.value == "bkash"
    assert rows[0].order_id == pending_order.order_id
    assert rows[0].status == GatewayTransactionStatus.initiated
    assert Decimal(str(rows[0].amount)) == Decimal("400.00")


@pytest.mark.asyncio
async def test_bkash_initiate_rejected_when_not_configured(
    async_client: AsyncClient, tenants: dict, customer_token: str, pending_order: Order
):
    resp = await async_client.post(
        "/api/v1/payments/gateway/initiate",
        json={"order_id": str(pending_order.order_id), "gateway_type": "bkash"},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert resp.status_code == 400


# ─── GET /payments/gateway/{id}/bkash-callback ───────────────────────────────


async def _initiate(async_client, admin_token, customer_token, pending_order) -> str:
    await _enable_bkash(async_client, admin_token)
    with patch(
        "app.services.gateways.bkash_gateway.BkashGateway.initiate",
        new=AsyncMock(return_value=GatewaySession(redirect_url="https://tokenized.sandbox.bka.sh/fake")),
    ):
        resp = await async_client.post(
            "/api/v1/payments/gateway/initiate",
            json={"order_id": str(pending_order.order_id), "gateway_type": "bkash"},
            headers={"Authorization": f"Bearer {customer_token}"},
        )
    return resp.json()["gateway_transaction_id"]


@pytest.mark.asyncio
async def test_bkash_callback_success_marks_paid(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    with patch(
        "app.services.gateways.bkash_gateway.BkashGateway.validate",
        new=AsyncMock(return_value=GatewayValidationResult(
            success=True, verified_amount=Decimal("400.00"), external_ref="TRX123ABC"
        )),
    ):
        resp = await async_client.get(
            f"/api/v1/payments/gateway/{gtx_id}/bkash-callback",
            params={"paymentID": "TR0011abc123", "status": "success"},
        )

    assert resp.status_code in (302, 303, 307)
    assert "payment=success" in resp.headers["location"]

    await db_session.refresh(pending_order)
    assert pending_order.payment_status == PaymentStatus.paid

    gtx_result = await db_session.execute(select(GatewayTransaction))
    gtx = gtx_result.scalar_one()
    assert gtx.status == GatewayTransactionStatus.success
    assert gtx.gateway_external_ref == "TRX123ABC"

    payment_result = await db_session.execute(select(Payment).where(Payment.order_id == pending_order.order_id))
    payment = payment_result.scalar_one()
    assert payment.transaction_ref == "TRX123ABC"
    assert Decimal(str(payment.amount)) == Decimal("400.00")


@pytest.mark.asyncio
async def test_bkash_callback_amount_mismatch_rejected(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    """PAY-7/PAY-14: Execute Payment's own verified amount must match — a mismatch is rejected."""
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    with patch(
        "app.services.gateways.bkash_gateway.BkashGateway.validate",
        new=AsyncMock(return_value=GatewayValidationResult(
            success=True, verified_amount=Decimal("1.00"), external_ref="TRX_TAMPERED"
        )),
    ):
        resp = await async_client.get(
            f"/api/v1/payments/gateway/{gtx_id}/bkash-callback",
            params={"paymentID": "TR0011abc123", "status": "success"},
        )

    assert "payment=failed" in resp.headers["location"]
    await db_session.refresh(pending_order)
    assert pending_order.payment_status == PaymentStatus.pending

    payment_result = await db_session.execute(select(Payment).where(Payment.order_id == pending_order.order_id))
    assert payment_result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_bkash_callback_cancel_marks_cancelled_no_payment(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    resp = await async_client.get(
        f"/api/v1/payments/gateway/{gtx_id}/bkash-callback",
        params={"paymentID": "TR0011abc123", "status": "cancel"},
    )
    assert "payment=cancelled" in resp.headers["location"]

    gtx_result = await db_session.execute(select(GatewayTransaction))
    gtx = gtx_result.scalar_one()
    assert gtx.status == GatewayTransactionStatus.cancelled

    await db_session.refresh(pending_order)
    assert pending_order.payment_status == PaymentStatus.pending


@pytest.mark.asyncio
async def test_bkash_duplicate_settlement_is_idempotent(
    async_client: AsyncClient,
    tenants: dict,
    db_session: AsyncSession,
    admin_token: str,
    customer_token: str,
    pending_order: Order,
):
    """PAY-8: a second callback delivery for the same transaction must not double-execute/settle."""
    gtx_id = await _initiate(async_client, admin_token, customer_token, pending_order)

    validate_mock = AsyncMock(return_value=GatewayValidationResult(
        success=True, verified_amount=Decimal("400.00"), external_ref="TRX_DUP"
    ))
    with patch("app.services.gateways.bkash_gateway.BkashGateway.validate", new=validate_mock):
        first = await async_client.get(
            f"/api/v1/payments/gateway/{gtx_id}/bkash-callback",
            params={"paymentID": "TR0011abc123", "status": "success"},
        )
        assert "payment=success" in first.headers["location"]

        second = await async_client.get(
            f"/api/v1/payments/gateway/{gtx_id}/bkash-callback",
            params={"paymentID": "TR0011abc123", "status": "success"},
        )
        assert "payment=success" in second.headers["location"]

    # validate() (which internally calls Execute) must only have been invoked once.
    assert validate_mock.await_count == 1

    payment_result = await db_session.execute(select(Payment).where(Payment.order_id == pending_order.order_id))
    assert len(payment_result.scalars().all()) == 1


# ─── POST /payment-gateways/me/{gateway_type}/test ───────────────────────────


@pytest.mark.asyncio
async def test_test_connection_requires_saved_credentials(
    async_client: AsyncClient, tenants: dict, admin_token: str
):
    resp = await async_client.post(
        "/api/v1/payment-gateways/me/bkash/test",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_test_connection_bkash_success(
    async_client: AsyncClient, tenants: dict, admin_token: str
):
    await _enable_bkash(async_client, admin_token)

    with patch(
        "app.services.gateways.bkash_gateway.BkashGateway._grant_token",
        new=AsyncMock(return_value="fake-id-token"),
    ):
        resp = await async_client.post(
            "/api/v1/payment-gateways/me/bkash/test",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_test_connection_bkash_bad_credentials(
    async_client: AsyncClient, tenants: dict, admin_token: str
):
    await _enable_bkash(async_client, admin_token)

    with patch(
        "app.services.gateways.bkash_gateway.BkashGateway._grant_token",
        new=AsyncMock(return_value=None),
    ):
        resp = await async_client.post(
            "/api/v1/payment-gateways/me/bkash/test",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["success"] is False


@pytest.mark.asyncio
async def test_grant_token_survives_non_json_gateway_response():
    """Regression: bKash's real sandbox returned a non-JSON response for invalid credentials,
    which `response.json()` raised on (a bare ValueError, not httpx.HTTPError) — reproduced live
    against production 2026-07-22, surfaced as an unhandled 500 (misreported by the browser as a
    CORS error, since a 500 never gets CORS headers attached). `_grant_token` must degrade to
    `None`, not crash — tested directly (not through the API) so this doesn't need to patch
    `httpx.AsyncClient.post` globally, which would also intercept the test client's own requests.
    """
    from app.services.gateways.bkash_gateway import BkashGateway

    class _NonJsonResponse:
        def json(self):
            raise ValueError("Expecting value: line 1 column 1 (char 0)")

    gateway = BkashGateway(app_key="k", app_secret="s", username="u", password="p", is_sandbox=True)
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=_NonJsonResponse())):
        result = await gateway.test_connection()

    assert result.success is False


@pytest.mark.asyncio
async def test_test_connection_works_even_when_disabled(
    async_client: AsyncClient, tenants: dict, admin_token: str
):
    """PAY-15: an admin can test credentials before switching a gateway live."""
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/bkash",
        json={
            "is_enabled": False,
            "is_sandbox": True,
            "username": "sandboxTokenizedUser02",
            "app_key": "test-app-key",
            "app_secret": "test-app-secret",
            "password": "test-password",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    with patch(
        "app.services.gateways.bkash_gateway.BkashGateway._grant_token",
        new=AsyncMock(return_value="fake-id-token"),
    ):
        test_resp = await async_client.post(
            "/api/v1/payment-gateways/me/bkash/test",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert test_resp.status_code == 200
    assert test_resp.json()["success"] is True

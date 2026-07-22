"""Tests for the wallet_transactions ledger retrofit (RFC-011 Stage 1, PAY-9 / WAL-3).

This table was documented in specs/system/data-model.md since before RFC-011 as the
wallet system's "authoritative audit trail," but no migration/model ever created it and
PaymentService.topup() never wrote to it. This file confirms it's real now.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.wallet_transaction import WalletTransaction
from tests.conftest import SLUG_ALPHA, TEST_PASSWORD, get_token


@pytest_asyncio.fixture
async def customer_token(async_client: AsyncClient, tenants: dict, db_session: AsyncSession) -> str:
    alpha = tenants["alpha"]
    customer = User(
        user_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        full_name="Ledger Customer",
        email="ledger.customer@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.customer,
        is_active=True,
        wallet_balance=Decimal("0.00"),
    )
    db_session.add(customer)
    await db_session.commit()
    return await get_token(async_client, "ledger.customer@alpha.com", SLUG_ALPHA)


@pytest.mark.asyncio
async def test_topup_writes_wallet_transaction(
    async_client: AsyncClient, tenants: dict, db_session: AsyncSession, customer_token: str
):
    resp = await async_client.post(
        "/api/v1/payments/topup",
        json={"amount": 500},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["wallet_balance"] == 500.0

    result = await db_session.execute(select(WalletTransaction))
    rows = result.scalars().all()
    assert len(rows) == 1
    assert Decimal(str(rows[0].amount)) == Decimal("500.00")
    assert rows[0].description == "Wallet top-up (simulation)"

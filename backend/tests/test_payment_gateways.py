"""Tests for payment gateway config CRUD (RFC-011 Stage 1, ADR-015).

Covers:
  GET    /payment-gateways/me
  PUT    /payment-gateways/me/{gateway_type}
  DELETE /payment-gateways/me/{gateway_type}
  GET    /payment-gateways/available
  Encryption round-trip + fail-loud behavior (app.core.crypto)
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import crypto
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole
from tests.conftest import SLUG_ALPHA, TEST_PASSWORD, get_token


@pytest.fixture(autouse=True)
def _encryption_key():
    """Every test in this file gets a real Fernet key unless it explicitly clears it."""
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
        email="gateway.admin@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.tenant_admin,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    return await get_token(async_client, "gateway.admin@alpha.com", SLUG_ALPHA)


@pytest_asyncio.fixture
async def customer_token(async_client: AsyncClient, tenants: dict, db_session: AsyncSession) -> str:
    alpha = tenants["alpha"]
    customer = User(
        user_id=uuid.uuid4(),
        tenant_id=alpha.tenant_id,
        full_name="Alpha Customer",
        email="gateway.customer@alpha.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.customer,
        is_active=True,
    )
    db_session.add(customer)
    await db_session.commit()
    return await get_token(async_client, "gateway.customer@alpha.com", SLUG_ALPHA)


# ─── crypto.py — encryption round-trip + fail-loud ───────────────────────────


def test_encrypt_decrypt_round_trip():
    secrets = {"store_password": "qwerty"}
    blob = crypto.encrypt_json(secrets)
    assert blob != "qwerty"  # never plaintext
    assert crypto.decrypt_json(blob) == secrets


def test_encrypt_fails_loud_without_key():
    settings.ENCRYPTION_KEY = ""
    with pytest.raises(crypto.EncryptionNotConfigured):
        crypto.encrypt_json({"store_password": "qwerty"})


# ─── PUT /payment-gateways/me/{gateway_type} ─────────────────────────────────


@pytest.mark.asyncio
async def test_upsert_gateway_requires_auth(async_client: AsyncClient, tenants: dict):
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upsert_gateway_customer_forbidden(async_client: AsyncClient, tenants: dict, customer_token: str):
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_upsert_and_get_gateway_never_leaks_secret(async_client: AsyncClient, tenants: dict, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    put_resp = await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers=headers,
    )
    assert put_resp.status_code == 200
    body = put_resp.json()
    assert body["gateway_type"] == "sslcommerz"
    assert body["is_enabled"] is True
    assert body["public_identifier"] == "testbox"
    assert body["has_credentials"] is True
    assert "store_password" not in body
    assert "qwerty" not in put_resp.text

    get_resp = await async_client.get("/api/v1/payment-gateways/me", headers=headers)
    assert get_resp.status_code == 200
    assert "qwerty" not in get_resp.text
    configs = get_resp.json()
    assert len(configs) == 1
    assert configs[0]["gateway_type"] == "sslcommerz"


@pytest.mark.asyncio
async def test_upsert_without_encryption_key_fails_loud(async_client: AsyncClient, tenants: dict, admin_token: str):
    settings.ENCRYPTION_KEY = ""
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 500


@pytest.mark.asyncio
async def test_partial_update_keeps_existing_secret(async_client: AsyncClient, tenants: dict, admin_token: str):
    """Omitting store_password on a later PUT must not wipe the previously saved one."""
    headers = {"Authorization": f"Bearer {admin_token}"}

    await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers=headers,
    )

    # Second save only flips is_enabled, omits store_password entirely.
    resp = await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": False, "is_sandbox": True, "store_id": "testbox"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["has_credentials"] is True  # secret preserved, not wiped


@pytest.mark.asyncio
async def test_delete_gateway(async_client: AsyncClient, tenants: dict, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}
    await async_client.put(
        "/api/v1/payment-gateways/me/bkash",
        json={"is_enabled": True, "is_sandbox": True, "username": "sandboxTokenizedUser02",
              "app_key": "key", "app_secret": "secret", "password": "pass"},
        headers=headers,
    )

    delete_resp = await async_client.delete("/api/v1/payment-gateways/me/bkash", headers=headers)
    assert delete_resp.status_code == 204

    get_resp = await async_client.get("/api/v1/payment-gateways/me", headers=headers)
    assert get_resp.json() == []


@pytest.mark.asyncio
async def test_delete_nonexistent_gateway_404s(async_client: AsyncClient, tenants: dict, admin_token: str):
    resp = await async_client.delete(
        "/api/v1/payment-gateways/me/bkash", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 404


# ─── GET /payment-gateways/available ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_available_defaults_to_wallet_and_simulation_only(
    async_client: AsyncClient, tenants: dict, customer_token: str
):
    resp = await async_client.get(
        "/api/v1/payment-gateways/available", headers={"Authorization": f"Bearer {customer_token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"wallet": True, "simulation": True, "sslcommerz": False, "bkash": False}


@pytest.mark.asyncio
async def test_available_reflects_enabled_gateway(
    async_client: AsyncClient, tenants: dict, admin_token: str, customer_token: str
):
    await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": True, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    resp = await async_client.get(
        "/api/v1/payment-gateways/available", headers={"Authorization": f"Bearer {customer_token}"}
    )
    assert resp.json() == {"wallet": True, "simulation": True, "sslcommerz": True, "bkash": False}


@pytest.mark.asyncio
async def test_available_ignores_disabled_gateway(
    async_client: AsyncClient, tenants: dict, admin_token: str, customer_token: str
):
    await async_client.put(
        "/api/v1/payment-gateways/me/sslcommerz",
        json={"is_enabled": False, "is_sandbox": True, "store_id": "testbox", "store_password": "qwerty"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    resp = await async_client.get(
        "/api/v1/payment-gateways/available", headers={"Authorization": f"Bearer {customer_token}"}
    )
    assert resp.json()["sslcommerz"] is False

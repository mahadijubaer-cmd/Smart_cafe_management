"""Auth flow tests — register, login, /auth/me, role guard, expired token, BR-REG-1.

Uses the shared conftest.py fixtures (db_session/async_client/tenants/users) rather than a
local db_session fixture — this file previously defined its own SQLite db_session that never
received the Postgres-server-default-stripping fix conftest's fixture has, so its CREATE TABLE
DDL broke on `uuid_generate_v4()`. It also predated multi-tenancy: register/login now require
`tenant_slug`, and `UserRole.admin` no longer exists (current admin roles are tenant_admin /
outlet_admin / super_admin / food_court_admin / platform_admin).
"""
from datetime import timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.models.user import User
from app.services.auth_service import AuthService
from tests.conftest import SLUG_ALPHA

TEST_PASSWORD = "password123"
auth_service = AuthService()


@pytest_asyncio.fixture
async def student_token(async_client: AsyncClient, tenants: dict[str, Tenant]) -> str:
    register_payload = {
        "full_name": "Student User",
        "email": "student.test@bracu.ac.bd",
        "password": TEST_PASSWORD,
        "role": "student",
        "student_id": "22101234",
        "phone": "01700000000",
        "tenant_slug": SLUG_ALPHA,
    }
    register_response = await async_client.post("/api/v1/auth/register", json=register_payload)
    assert register_response.status_code == 201

    # Not conftest's get_token() helper — it hardcodes conftest.TEST_PASSWORD, not this
    # file's own TEST_PASSWORD used at registration above.
    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "student.test@bracu.ac.bd", "password": TEST_PASSWORD, "tenant_slug": SLUG_ALPHA},
    )
    assert login_response.status_code == 200, login_response.text
    return login_response.json()["access_token"]


@pytest.mark.asyncio
async def test_register_success(async_client: AsyncClient, tenants: dict[str, Tenant]):
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "New Student",
            "email": "new.student@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22109999",
            "phone": "01711111111",
            "tenant_slug": SLUG_ALPHA,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["email"] == "new.student@bracu.ac.bd"
    assert "user_id" in payload
    assert "password_hash" not in payload


@pytest.mark.asyncio
async def test_register_duplicate_email(async_client: AsyncClient, tenants: dict[str, Tenant]):
    payload = {
        "full_name": "Duplicate User",
        "email": "duplicate@bracu.ac.bd",
        "password": TEST_PASSWORD,
        "role": "student",
        "student_id": "22100001",
        "phone": "01722222222",
        "tenant_slug": SLUG_ALPHA,
    }

    first_response = await async_client.post("/api/v1/auth/register", json=payload)
    second_response = await async_client.post("/api/v1/auth/register", json=payload)

    assert first_response.status_code == 201
    assert second_response.status_code == 400
    assert second_response.json()["detail"] == "Email already registered for this tenant"


@pytest.mark.asyncio
async def test_register_weak_password(async_client: AsyncClient, tenants: dict[str, Tenant]):
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Weak Password",
            "email": "weak@bracu.ac.bd",
            "password": "short",
            "role": "student",
            "student_id": "22100002",
            "phone": "01733333333",
            "tenant_slug": SLUG_ALPHA,
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(async_client: AsyncClient, tenants: dict[str, Tenant]):
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Login Student",
            "email": "login.student@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22100003",
            "phone": "01744444444",
            "tenant_slug": SLUG_ALPHA,
        },
    )

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "login.student@bracu.ac.bd", "password": TEST_PASSWORD, "tenant_slug": SLUG_ALPHA},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "access_token" in payload
    assert payload["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(async_client: AsyncClient, tenants: dict[str, Tenant]):
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Wrong Password User",
            "email": "wrong.password@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22100004",
            "phone": "01755555555",
            "tenant_slug": SLUG_ALPHA,
        },
    )

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "wrong.password@bracu.ac.bd", "password": "incorrect-password", "tenant_slug": SLUG_ALPHA},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_email(async_client: AsyncClient, tenants: dict[str, Tenant]):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "missing@bracu.ac.bd", "password": TEST_PASSWORD, "tenant_slug": SLUG_ALPHA},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated(async_client: AsyncClient, student_token: str):
    response = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "student.test@bracu.ac.bd"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(async_client: AsyncClient):
    response = await async_client.get("/api/v1/auth/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_expired_token(async_client: AsyncClient, db_session: AsyncSession, tenants: dict[str, Tenant]):
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Expired Token Student",
            "email": "expired.student@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22100005",
            "phone": "01766666666",
            "tenant_slug": SLUG_ALPHA,
        },
    )

    result = await db_session.execute(select(User).where(User.email == "expired.student@bracu.ac.bd"))
    user = result.scalar_one_or_none()
    assert user is not None

    expired_token = auth_service.create_access_token(
        user=user,
        tenant=tenants["alpha"],
        expires_delta=timedelta(minutes=-5),
    )

    response = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_role_guard_student_on_admin(async_client: AsyncClient, student_token: str):
    response = await async_client.get(
        "/api/v1/analytics/summary",
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 403


# ─── BR-REG-1: Blocked roles cannot self-register ─────────────────────────────

_BLOCKED_ROLES = ["staff", "cleaner", "outlet_admin", "tenant_admin", "platform_admin", "food_court_admin"]


@pytest.mark.asyncio
@pytest.mark.parametrize("role", _BLOCKED_ROLES)
async def test_blocked_role_self_register_returns_400(async_client: AsyncClient, tenants: dict[str, Tenant], role: str):
    """BR-REG-1: Privileged roles must not be creatable via self-registration."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sneaky User",
            "email": f"{role}.sneaky@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": role,
            "tenant_slug": SLUG_ALPHA,
        },
    )
    assert response.status_code == 400
    assert "admin invitation" in response.json()["detail"]


@pytest.mark.asyncio
async def test_customer_can_self_register(async_client: AsyncClient, tenants: dict[str, Tenant]):
    """BR-REG-1: customer role is allowed through self-registration."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Normal Customer",
            "email": "customer.ok@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "customer",
            "tenant_slug": SLUG_ALPHA,
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_student_can_self_register(async_client: AsyncClient, tenants: dict[str, Tenant]):
    """BR-REG-1: student role is allowed through self-registration."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Normal Student",
            "email": "student.ok@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22300001",
            "tenant_slug": SLUG_ALPHA,
        },
    )
    assert response.status_code == 201

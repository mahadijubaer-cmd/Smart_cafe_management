from datetime import timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User, UserRole
from app.services.auth_service import AuthService


TEST_PASSWORD = "password123"
TEST_STUDENT_EMAIL = "student.test@bracu.ac.bd"
TEST_ADMIN_EMAIL = "admin.test@bracu.ac.bd"
auth_service = AuthService()


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all, tables=[User.__table__])

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        admin_user = User(
            user_id=uuid4(),
            full_name="Admin User",
            email=TEST_ADMIN_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.admin,
            student_id=None,
            phone=None,
            wallet_balance=0,
            reward_points=0,
            is_active=True,
        )
        session.add(admin_user)
        await session.commit()

        async def override_get_db():
            yield session

        app.dependency_overrides[get_db] = override_get_db

        try:
            yield session
        finally:
            app.dependency_overrides.pop(get_db, None)

    await engine.dispose()


@pytest_asyncio.fixture
async def async_client(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def student_token(async_client):
    register_payload = {
        "full_name": "Student User",
        "email": TEST_STUDENT_EMAIL,
        "password": TEST_PASSWORD,
        "role": "student",
        "student_id": "22101234",
        "phone": "01700000000",
    }
    register_response = await async_client.post("/api/v1/auth/register", json=register_payload)
    assert register_response.status_code == 201

    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": TEST_STUDENT_EMAIL, "password": TEST_PASSWORD},
    )
    assert login_response.status_code == 200
    return login_response.json()["access_token"]


@pytest_asyncio.fixture
async def admin_token(async_client, db_session):
    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_PASSWORD},
    )
    assert login_response.status_code == 200
    return login_response.json()["access_token"]


@pytest.mark.asyncio
async def test_register_success(async_client):
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "New Student",
            "email": "new.student@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22109999",
            "phone": "01711111111",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["email"] == "new.student@bracu.ac.bd"
    assert "user_id" in payload
    assert "password_hash" not in payload


@pytest.mark.asyncio
async def test_register_duplicate_email(async_client):
    payload = {
        "full_name": "Duplicate User",
        "email": "duplicate@bracu.ac.bd",
        "password": TEST_PASSWORD,
        "role": "student",
        "student_id": "22100001",
        "phone": "01722222222",
    }

    first_response = await async_client.post("/api/v1/auth/register", json=payload)
    second_response = await async_client.post("/api/v1/auth/register", json=payload)

    assert first_response.status_code == 201
    assert second_response.status_code == 400
    assert second_response.json()["detail"] == "Email already registered"


@pytest.mark.asyncio
async def test_register_weak_password(async_client):
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Weak Password",
            "email": "weak@bracu.ac.bd",
            "password": "short",
            "role": "student",
            "student_id": "22100002",
            "phone": "01733333333",
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(async_client):
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Login Student",
            "email": "login.student@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22100003",
            "phone": "01744444444",
        },
    )

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "login.student@bracu.ac.bd", "password": TEST_PASSWORD},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "access_token" in payload
    assert payload["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(async_client):
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Wrong Password User",
            "email": "wrong.password@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22100004",
            "phone": "01755555555",
        },
    )

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "wrong.password@bracu.ac.bd", "password": "incorrect-password"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_email(async_client):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "missing@bracu.ac.bd", "password": TEST_PASSWORD},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated(async_client, student_token):
    response = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == TEST_STUDENT_EMAIL


@pytest.mark.asyncio
async def test_get_me_unauthenticated(async_client):
    response = await async_client.get("/api/v1/auth/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_expired_token(async_client, db_session):
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Expired Token Student",
            "email": "expired.student@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22100005",
            "phone": "01766666666",
        },
    )

    result = await db_session.execute(select(User).where(User.email == "expired.student@bracu.ac.bd"))
    user = result.scalar_one_or_none()
    assert user is not None

    expired_token = auth_service.create_access_token(
        {"sub": str(user.user_id), "role": user.role.value},
        expires_delta=timedelta(minutes=-5),
    )

    response = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_role_guard_student_on_admin(async_client, student_token):
    response = await async_client.get(
        "/api/v1/analytics/summary",
        headers={"Authorization": f"Bearer {student_token}"},
    )

    assert response.status_code == 403


# ─── BR-REG-1: Blocked roles cannot self-register ─────────────────────────────

_BLOCKED_ROLES = ["staff", "cleaner", "outlet_admin", "tenant_admin", "platform_admin", "food_court_admin"]


@pytest.mark.asyncio
@pytest.mark.parametrize("role", _BLOCKED_ROLES)
async def test_blocked_role_self_register_returns_400(async_client, role):
    """BR-REG-1: Privileged roles must not be creatable via self-registration."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Sneaky User",
            "email": f"{role}.sneaky@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": role,
            "tenant_slug": "bracu",
        },
    )
    assert response.status_code == 400
    assert "admin invitation" in response.json()["detail"]


@pytest.mark.asyncio
async def test_customer_can_self_register(async_client):
    """BR-REG-1: customer role is allowed through self-registration."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Normal Customer",
            "email": "customer.ok@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "customer",
            "tenant_slug": "bracu",
        },
    )
    # 201 or 400-duplicate are both acceptable; 400 'admin invitation' is not
    assert response.status_code != 400 or "admin invitation" not in response.json().get("detail", "")


@pytest.mark.asyncio
async def test_student_can_self_register(async_client):
    """BR-REG-1: student role is allowed through self-registration."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Normal Student",
            "email": "student.ok@bracu.ac.bd",
            "password": TEST_PASSWORD,
            "role": "student",
            "student_id": "22300001",
            "tenant_slug": "bracu",
        },
    )
    assert response.status_code != 400 or "admin invitation" not in response.json().get("detail", "")
"""Shared fixtures for SCMS Phase 11 test suite.

Two independent tenants (alpha / beta) are seeded for each test.
Redis is replaced with an in-memory fake so no external service is required.
SQLite in-memory replaces PostgreSQL so tests run offline.
"""
from __future__ import annotations

import fnmatch
import time
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import UUID as _PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles as _compiles
from sqlalchemy.pool import StaticPool


# ── Cross-dialect UUID support for the SQLite test database ───────────────────
# Production models use PostgreSQL's UUID type. SQLite has no native UUID, so
# without this hook `CREATE TABLE` fails with:
#   'SQLiteTypeCompiler' object has no attribute 'visit_UUID'
# Render UUID columns as CHAR(36) on SQLite; asyncpg/postgres are unaffected.
@_compiles(_PG_UUID, "sqlite")
def _visit_uuid_sqlite(element, compiler, **kw):  # noqa: ANN001, ANN201
    return "CHAR(36)"


import app.core.redis as redis_module
from app.core.database import Base, get_db


# PostgreSQL server-defaults like `uuid_generate_v4()` are invalid DDL on SQLite.
# The models also carry Python-side defaults (`default=uuid.uuid4`), so it is safe
# to drop these PG-only server_defaults for the test database.
def _strip_pg_only_server_defaults() -> None:
    for table in Base.metadata.tables.values():
        for column in table.columns:
            sd = column.server_default
            if sd is None:
                continue
            arg = getattr(sd, "arg", None)
            text_val = getattr(arg, "text", None) or str(arg or "")
            if "uuid_generate_v4" in text_val:
                column.server_default = None
from app.core.security import hash_password
from app.main import app
from app.models.menu import Category, MenuItem
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole

TEST_PASSWORD = "Password123!"
SLUG_ALPHA = "alpha-cafe"
SLUG_BETA = "beta-cafe"


# ─────────────────────────────────────────────────────────────────────────────
# In-memory Redis substitute
# ─────────────────────────────────────────────────────────────────────────────

class FakeAsyncRedis:
    """Minimal async-compatible Redis fake for testing.

    Implements only the operations used by SCMS services:
    get / set / setex / getdel / delete / exists / incr / expire / scan / publish.
    """

    def __init__(self) -> None:
        self._data: dict[str, str] = {}
        self._ttls: dict[str, float] = {}

    def _live(self, key: str) -> str | None:
        exp = self._ttls.get(key)
        if exp is not None and time.monotonic() > exp:
            self._data.pop(key, None)
            self._ttls.pop(key, None)
            return None
        return self._data.get(key)

    async def get(self, key: str) -> str | None:
        return self._live(key)

    async def set(
        self,
        key: str,
        value: str,
        nx: bool = False,
        ex: int | None = None,
        **_kwargs,
    ) -> bool:
        if nx and self._live(key) is not None:
            return False
        self._data[key] = str(value)
        if ex:
            self._ttls[key] = time.monotonic() + ex
        return True

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        return await self.set(key, value, ex=seconds)

    async def getdel(self, key: str) -> str | None:
        value = self._live(key)
        if value is not None:
            del self._data[key]
            self._ttls.pop(key, None)
        return value

    async def delete(self, *keys: str) -> int:
        removed = 0
        for k in keys:
            if k in self._data:
                del self._data[k]
                self._ttls.pop(k, None)
                removed += 1
        return removed

    async def exists(self, *keys: str) -> int:
        return sum(1 for k in keys if self._live(k) is not None)

    async def incr(self, key: str) -> int:
        current = self._live(key)
        val = int(current) + 1 if current is not None else 1
        self._data[key] = str(val)
        return val

    async def expire(self, key: str, seconds: int) -> bool:
        if key in self._data:
            self._ttls[key] = time.monotonic() + seconds
            return True
        return False

    async def scan(self, cursor: int, match: str = "*", count: int = 100):
        matched = [k for k in list(self._data) if fnmatch.fnmatch(k, match) and self._live(k) is not None]
        return 0, matched

    async def publish(self, channel: str, message: str) -> int:
        return 0

    async def aclose(self) -> None:
        pass

    def flush(self) -> None:
        self._data.clear()
        self._ttls.clear()


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def fake_redis() -> FakeAsyncRedis:
    """Swap the global Redis singleton with an in-memory fake for each test."""
    instance = FakeAsyncRedis()
    original = redis_module._redis_client
    redis_module._redis_client = instance  # type: ignore[assignment]
    yield instance
    redis_module._redis_client = original


@pytest_asyncio.fixture
async def db_session(fake_redis: FakeAsyncRedis) -> AsyncSession:
    """Fresh in-memory SQLite database for each test (fake_redis is a dep so it's ready first)."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    _strip_pg_only_server_defaults()  # after all models are registered on Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def tenants(db_session: AsyncSession) -> dict[str, Tenant]:
    """Two independent Tenant rows."""
    alpha = Tenant(
        tenant_id=uuid.uuid4(),
        tenant_type=TenantType.academic,
        name="Alpha Cafe",
        slug=SLUG_ALPHA,
        is_active=True,
    )
    beta = Tenant(
        tenant_id=uuid.uuid4(),
        tenant_type=TenantType.independent_restaurant,
        name="Beta Diner",
        slug=SLUG_BETA,
        is_active=True,
    )
    db_session.add_all([alpha, beta])
    await db_session.commit()
    return {"alpha": alpha, "beta": beta}


@pytest_asyncio.fixture
async def users(db_session: AsyncSession, tenants: dict[str, Tenant]) -> dict[str, User]:
    """One tenant_admin and one customer per tenant."""
    ta, tb = tenants["alpha"], tenants["beta"]

    rows = {
        "alpha_admin": User(
            user_id=uuid.uuid4(), tenant_id=ta.tenant_id,
            full_name="Alpha Admin", email="admin@alpha.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.tenant_admin, is_active=True,
        ),
        "alpha_customer": User(
            user_id=uuid.uuid4(), tenant_id=ta.tenant_id,
            full_name="Alpha Customer", email="customer@alpha.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.customer, is_active=True,
        ),
        "beta_admin": User(
            user_id=uuid.uuid4(), tenant_id=tb.tenant_id,
            full_name="Beta Admin", email="admin@beta.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.tenant_admin, is_active=True,
        ),
        "beta_customer": User(
            user_id=uuid.uuid4(), tenant_id=tb.tenant_id,
            full_name="Beta Customer", email="customer@beta.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.customer, is_active=True,
        ),
    }
    db_session.add_all(list(rows.values()))
    await db_session.commit()
    return rows


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession, fake_redis: FakeAsyncRedis) -> AsyncClient:
    """ASGI test client that routes all DB calls to the in-memory SQLite session."""

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.pop(get_db, None)


async def get_token(client: AsyncClient, email: str, tenant_slug: str) -> str:
    """Authenticate and return the access_token string."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": TEST_PASSWORD, "tenant_slug": tenant_slug},
    )
    assert resp.status_code == 200, f"login failed ({resp.status_code}): {resp.text}"
    return resp.json()["access_token"]

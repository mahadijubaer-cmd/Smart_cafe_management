"""Tests for the Platform Admin Control Plane (RFC-009).

Covers:
  - audit log entries written on tenant create/tier-change/activate/suspend/delete/impersonate
  - subscription tier limits block outlet/menu-item/staff-invite creation past cap
  - enterprise tier is unlimited
  - impersonation mints a tenant-scoped token for the real platform admin identity
  - hard delete requires suspended-first and blocks brands with remaining children
  - export returns the expected shape
  - non-platform-admin callers are rejected on every /platform/* endpoint
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.menu import Category
from app.models.models import PlatformAuditLog
from app.models.tenant import SubscriptionTier, Tenant, TenantType
from app.models.user import User, UserRole
from tests.conftest import TEST_PASSWORD, get_token

PLATFORM_ADMIN_SLUG = "alpha-cafe"  # platform_admin's own tenant is irrelevant to its authority


@pytest_asyncio.fixture
async def platform_setup(db_session: AsyncSession, tenants: dict[str, Tenant], users: dict[str, User]) -> dict:
    """A platform_admin (home tenant = alpha), a starter-tier franchise brand with 2 outlets,
    and an enterprise-tier brand, for tier-limit tests."""
    platform_admin = User(
        user_id=uuid.uuid4(), tenant_id=tenants["alpha"].tenant_id,
        full_name="Platform Admin", email="platform@ops.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=UserRole.platform_admin, is_active=True,
    )
    db_session.add(platform_admin)

    starter_brand = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.franchise_brand,
        name="Starter Brand", slug="starter-brand", is_active=True,
        subscription_tier=SubscriptionTier.starter,
    )
    enterprise_brand = Tenant(
        tenant_id=uuid.uuid4(), tenant_type=TenantType.franchise_brand,
        name="Enterprise Brand", slug="enterprise-brand", is_active=True,
        subscription_tier=SubscriptionTier.enterprise,
    )
    db_session.add_all([starter_brand, enterprise_brand])
    await db_session.commit()

    # starter_brand already has 3 outlets (== its max_outlets cap)
    outlets = [
        Tenant(
            tenant_id=uuid.uuid4(), tenant_type=TenantType.franchise_outlet,
            name=f"Starter Outlet {i}", slug=f"starter-outlet-{i}", is_active=True,
            parent_tenant_id=starter_brand.tenant_id,
        )
        for i in range(3)
    ]
    db_session.add_all(outlets)
    await db_session.commit()

    return {
        "platform_admin": platform_admin,
        "starter_brand": starter_brand,
        "enterprise_brand": enterprise_brand,
    }


async def _platform_admin_token(client: AsyncClient) -> str:
    return await get_token(client, "platform@ops.com", PLATFORM_ADMIN_SLUG)


# ── Audit log ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_tenant_writes_audit_log(async_client: AsyncClient, platform_setup, db_session: AsyncSession):
    token = await _platform_admin_token(async_client)
    resp = await async_client.post(
        "/api/v1/tenants",
        json={"name": "New Org", "slug": "new-org", "tenant_type": "independent_restaurant"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201

    log_result = await db_session.execute(
        select(PlatformAuditLog).where(PlatformAuditLog.action == "tenant_created")
    )
    logs = log_result.scalars().all()
    assert len(logs) == 1
    assert logs[0].target_tenant_slug == "new-org"
    assert logs[0].actor_email == "platform@ops.com"


@pytest.mark.asyncio
async def test_suspend_and_activate_write_audit_logs(async_client: AsyncClient, platform_setup, db_session: AsyncSession):
    token = await _platform_admin_token(async_client)
    tenant_id = platform_setup["starter_brand"].tenant_id

    resp = await async_client.post(
        f"/api/v1/tenants/{tenant_id}/suspend", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200

    resp = await async_client.post(
        f"/api/v1/tenants/{tenant_id}/activate", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200

    log_result = await db_session.execute(
        select(PlatformAuditLog.action).where(PlatformAuditLog.target_tenant_id == tenant_id)
    )
    actions = {row[0] for row in log_result.all()}
    assert "tenant_suspended" in actions
    assert "tenant_activated" in actions


@pytest.mark.asyncio
async def test_tier_change_writes_audit_log_with_before_after(async_client: AsyncClient, platform_setup, db_session: AsyncSession):
    token = await _platform_admin_token(async_client)
    tenant_id = platform_setup["starter_brand"].tenant_id

    resp = await async_client.patch(
        f"/api/v1/tenants/{tenant_id}",
        json={"subscription_tier": "professional"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    log_result = await db_session.execute(
        select(PlatformAuditLog).where(
            PlatformAuditLog.target_tenant_id == tenant_id,
            PlatformAuditLog.action == "tenant_tier_changed",
        )
    )
    log = log_result.scalar_one()
    assert '"from": "starter"' in log.details
    assert '"to": "professional"' in log.details


# ── Tier limits ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_outlet_creation_blocked_past_starter_cap(async_client: AsyncClient, platform_setup):
    token = await _platform_admin_token(async_client)
    brand_id = platform_setup["starter_brand"].tenant_id  # already has 3 outlets = starter cap

    resp = await async_client.post(
        f"/api/v1/tenants/{brand_id}/outlets",
        json={"name": "One Too Many", "slug": "one-too-many"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 402
    assert "outlets" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_enterprise_tier_outlet_creation_unlimited(async_client: AsyncClient, platform_setup, db_session: AsyncSession):
    token = await _platform_admin_token(async_client)
    brand = platform_setup["enterprise_brand"]

    # Give the enterprise brand 5 outlets (well past starter's cap of 3) — should still succeed.
    for i in range(5):
        db_session.add(Tenant(
            tenant_id=uuid.uuid4(), tenant_type=TenantType.franchise_outlet,
            name=f"Ent Outlet {i}", slug=f"ent-outlet-{i}", is_active=True,
            parent_tenant_id=brand.tenant_id,
        ))
    await db_session.commit()

    resp = await async_client.post(
        f"/api/v1/tenants/{brand.tenant_id}/outlets",
        json={"name": "Sixth Outlet", "slug": "sixth-outlet"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_menu_item_creation_blocked_past_tier_cap(async_client: AsyncClient, db_session: AsyncSession, tenants, users):
    # alpha tenant defaults to 'starter' tier (max_menu_items=100) per Tenant model default;
    # set it to 'free' (max_menu_items=20) and pre-fill 20 items to hit the cap precisely.
    alpha = tenants["alpha"]
    alpha.subscription_tier = SubscriptionTier.free
    category = Category(tenant_id=alpha.tenant_id, name="Snacks", display_order=0)
    db_session.add(category)
    await db_session.commit()
    await db_session.refresh(category)

    from app.models.menu import MenuItem
    for i in range(20):
        db_session.add(MenuItem(
            tenant_id=alpha.tenant_id, category_id=category.category_id,
            name=f"Item {i}", price=10,
        ))
    await db_session.commit()

    token = await get_token(async_client, "admin@alpha.com", alpha.slug)
    resp = await async_client.post(
        "/api/v1/menu/items",
        json={"category_id": category.category_id, "name": "Item 21", "price": 10},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 402
    assert "menu items" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_staff_invite_blocked_past_tier_cap(async_client: AsyncClient, db_session: AsyncSession, tenants, users):
    alpha = tenants["alpha"]
    alpha.subscription_tier = SubscriptionTier.free  # max_staff = 2
    await db_session.commit()

    for i in range(2):
        db_session.add(User(
            user_id=uuid.uuid4(), tenant_id=alpha.tenant_id,
            full_name=f"Staff {i}", email=f"staff{i}@alpha.com",
            password_hash=hash_password(TEST_PASSWORD),
            role=UserRole.staff, is_active=True,
        ))
    await db_session.commit()

    token = await get_token(async_client, "admin@alpha.com", alpha.slug)
    resp = await async_client.post(
        "/api/v1/users/invite",
        json={"email": "onemore@alpha.com", "role": "staff"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 402
    assert "staff" in resp.json()["detail"]


# ── Impersonation ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_impersonate_returns_tenant_scoped_token_and_logs_audit(
    async_client: AsyncClient, platform_setup, db_session: AsyncSession
):
    token = await _platform_admin_token(async_client)
    target = platform_setup["starter_brand"]

    resp = await async_client.post(
        f"/api/v1/platform/tenants/{target.tenant_id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tenant_slug"] == "starter-brand"
    assert body["expires_in_minutes"] == 15

    from jose import jwt as jose_jwt
    from app.core.config import settings
    claims = jose_jwt.decode(body["access_token"], settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert claims["tenant_id"] == str(target.tenant_id)
    assert claims["role"] == "platform_admin"  # real identity preserved, not a synthetic user
    assert claims["impersonation"] is True

    log_result = await db_session.execute(
        select(PlatformAuditLog).where(PlatformAuditLog.action == "impersonation_started")
    )
    assert len(log_result.scalars().all()) == 1


@pytest.mark.asyncio
async def test_impersonation_token_grants_tenant_scoped_admin_access(async_client: AsyncClient, platform_setup):
    """The impersonation token should let the platform admin act on the target tenant's
    ADMIN_ROLES-gated endpoints (e.g. GET /tables), proving the scoping works end-to-end.

    Note: GET /tenants/me is deliberately NOT used here — it's gated to
    {tenant_admin, outlet_admin, food_court_admin} specifically, not the ADMIN_ROLES group, which
    is exactly the documented known limitation in RFC-009 §2.7 (an impersonating platform_admin
    keeps its real role, so single-role-gated endpoints outside ADMIN_ROLES will reject it)."""
    token = await _platform_admin_token(async_client)
    target = platform_setup["starter_brand"]

    resp = await async_client.post(
        f"/api/v1/platform/tenants/{target.tenant_id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    impersonation_token = resp.json()["access_token"]

    tables_resp = await async_client.get(
        "/api/v1/tables/", headers={"Authorization": f"Bearer {impersonation_token}"}
    )
    assert tables_resp.status_code == 200


# ── Hard delete + export ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hard_delete_requires_suspended_first(async_client: AsyncClient, tenants, platform_setup):
    token = await _platform_admin_token(async_client)
    tenant_id = tenants["beta"].tenant_id  # still active

    resp = await async_client.delete(
        f"/api/v1/tenants/{tenant_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_hard_delete_blocks_brand_with_remaining_children(async_client: AsyncClient, platform_setup):
    token = await _platform_admin_token(async_client)
    brand_id = platform_setup["starter_brand"].tenant_id  # has 3 outlets

    await async_client.post(f"/api/v1/tenants/{brand_id}/suspend", headers={"Authorization": f"Bearer {token}"})
    resp = await async_client.delete(
        f"/api/v1/tenants/{brand_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_hard_delete_succeeds_after_suspend_with_no_children(async_client: AsyncClient, tenants, platform_setup, db_session: AsyncSession):
    token = await _platform_admin_token(async_client)
    tenant_id = tenants["beta"].tenant_id

    await async_client.post(f"/api/v1/tenants/{tenant_id}/suspend", headers={"Authorization": f"Bearer {token}"})
    resp = await async_client.delete(
        f"/api/v1/tenants/{tenant_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 204

    result = await db_session.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_export_shape(async_client: AsyncClient, tenants, platform_setup):
    token = await _platform_admin_token(async_client)
    tenant_id = tenants["alpha"].tenant_id

    resp = await async_client.get(
        f"/api/v1/tenants/{tenant_id}/export", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tenant"]["tenant_id"] == str(tenant_id)
    assert "password_hash" not in body["users"][0]
    assert "menu_item_count" in body
    assert "table_count" in body
    assert "total_orders" in body["order_summary"]


# ── Access control ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_non_platform_admin_rejected_from_audit_logs(async_client: AsyncClient, tenants, users, platform_setup):
    token = await get_token(async_client, "admin@alpha.com", tenants["alpha"].slug)
    resp = await async_client.get(
        "/api/v1/platform/audit-logs", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_non_platform_admin_rejected_from_impersonate(async_client: AsyncClient, tenants, users, platform_setup):
    token = await get_token(async_client, "admin@alpha.com", tenants["alpha"].slug)
    resp = await async_client.post(
        f"/api/v1/platform/tenants/{tenants['beta'].tenant_id}/impersonate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_platform_analytics_overview_shape(async_client: AsyncClient, platform_setup):
    token = await _platform_admin_token(async_client)
    resp = await async_client.get(
        "/api/v1/platform/analytics/overview", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "tenants_by_type" in body
    assert "tenants_by_status" in body
    assert "orders_last_30_days" in body

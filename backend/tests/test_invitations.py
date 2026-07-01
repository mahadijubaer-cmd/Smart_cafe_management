"""Phase 21 — Staff invitation + notification tests."""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.models import Notification, StaffInvitation
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole
from tests.conftest import SLUG_ALPHA, TEST_PASSWORD, get_token


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ─── helpers ────────────────────────────────────────────────────────────────

async def _make_notification(db: AsyncSession, user: User, tenant: Tenant, msg: str = "test", is_read: bool = False) -> Notification:
    n = Notification(
        notif_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        user_id=user.user_id,
        type="SYSTEM",
        message=msg,
        is_read=is_read,
    )
    db.add(n)
    await db.commit()
    return n


async def _make_invite(
    db: AsyncSession,
    tenant: Tenant,
    invited_by: User,
    role: UserRole = UserRole.staff,
    expires_delta: timedelta = timedelta(hours=48),
    accepted: bool = False,
) -> tuple[str, StaffInvitation]:
    raw = secrets.token_urlsafe(32)
    inv = StaffInvitation(
        tenant_id=tenant.tenant_id,
        email=f"invite_{uuid.uuid4().hex[:6]}@example.com",
        role=role.value,
        token_hash=_hash_token(raw),
        invited_by=invited_by.user_id,
        expires_at=datetime.now(timezone.utc) + expires_delta,
        accepted_at=datetime.now(timezone.utc) if accepted else None,
    )
    db.add(inv)
    await db.commit()
    return raw, inv


# ─── Invitation tests ────────────────────────────────────────────────────────

async def test_send_invite_success(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """POST /users/invite by tenant_admin → 201, invite stored in DB."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/users/invite",
        json={"email": "newstaff@example.com", "role": "staff"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newstaff@example.com"
    assert data["role"] == "staff"
    assert "invite_id" in data
    assert "expires_at" in data


async def test_send_invite_customer_role_blocked(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """Inviting a customer role must return 400."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/users/invite",
        json={"email": "notallowed@example.com", "role": "customer"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


async def test_accept_invite_success(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """POST /users/accept-invite with valid token → 201, Token returned."""
    alpha_admin = users["alpha_admin"]
    alpha = tenants["alpha"]
    raw, inv = await _make_invite(db_session, alpha, alpha_admin)

    resp = await async_client.post(
        "/api/v1/users/accept-invite",
        json={"token": raw, "full_name": "Jane Staff", "password": "Password123!"},
    )
    assert resp.status_code == 201
    assert "access_token" in resp.json()


async def test_accept_invite_expired(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """Expired token → 400."""
    alpha_admin = users["alpha_admin"]
    alpha = tenants["alpha"]
    raw, _ = await _make_invite(db_session, alpha, alpha_admin, expires_delta=timedelta(seconds=-1))

    resp = await async_client.post(
        "/api/v1/users/accept-invite",
        json={"token": raw, "full_name": "Late User", "password": "Password123!"},
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


async def test_accept_invite_already_accepted(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """Reusing an already-accepted token → 400."""
    alpha_admin = users["alpha_admin"]
    alpha = tenants["alpha"]
    raw, _ = await _make_invite(db_session, alpha, alpha_admin, accepted=True)

    resp = await async_client.post(
        "/api/v1/users/accept-invite",
        json={"token": raw, "full_name": "Repeat User", "password": "Password123!"},
    )
    assert resp.status_code == 400
    assert "already" in resp.json()["detail"].lower()


# ─── Notification tests ──────────────────────────────────────────────────────

async def test_notification_mark_read(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """PATCH /notifications/{id}/read marks is_read=True."""
    alpha = tenants["alpha"]
    alpha_admin = users["alpha_admin"]
    notif = await _make_notification(db_session, alpha_admin, alpha, is_read=False)

    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        f"/api/v1/notifications/{notif.notif_id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["read"] is True


async def test_notification_mark_all_read(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """POST /notifications/read-all → marks all unread for current user."""
    alpha = tenants["alpha"]
    alpha_admin = users["alpha_admin"]
    await _make_notification(db_session, alpha_admin, alpha, "msg1", is_read=False)
    await _make_notification(db_session, alpha_admin, alpha, "msg2", is_read=False)

    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/notifications/read-all",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["marked_read"] == 2


async def test_notification_cross_user_forbidden(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """User A cannot mark User B's notification as read (404)."""
    alpha = tenants["alpha"]
    alpha_admin = users["alpha_admin"]
    # Notification belongs to alpha_customer
    alpha_customer = users["alpha_customer"]
    notif = await _make_notification(db_session, alpha_customer, alpha, is_read=False)

    # Log in as alpha_admin and try to mark alpha_customer's notification
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        f"/api/v1/notifications/{notif.notif_id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404

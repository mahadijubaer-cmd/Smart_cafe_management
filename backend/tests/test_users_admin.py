"""Tenant-scoped user directory — GET /users, PATCH /users/{id}/toggle,
and GET /users/invite (pending invitations list).
"""
from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import SLUG_ALPHA, SLUG_BETA, get_token


async def test_list_users_scoped_to_tenant(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """GET /users returns only the caller's own tenant's users."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.get(
        "/api/v1/users", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()}
    assert emails == {"admin@alpha.com", "customer@alpha.com"}


async def test_list_users_customer_forbidden(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """A customer role cannot list users (403)."""
    token = await get_token(async_client, "customer@alpha.com", SLUG_ALPHA)
    resp = await async_client.get(
        "/api/v1/users", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


async def test_toggle_user_active(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """PATCH /users/{id}/toggle flips is_active for a user in the same tenant."""
    admin_token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    customer_id = users["alpha_customer"].user_id

    resp = await async_client.patch(
        f"/api/v1/users/{customer_id}/toggle",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    resp2 = await async_client.patch(
        f"/api/v1/users/{customer_id}/toggle",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["is_active"] is True


async def test_toggle_self_blocked(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """An admin cannot deactivate their own account."""
    admin_token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    admin_id = users["alpha_admin"].user_id

    resp = await async_client.patch(
        f"/api/v1/users/{admin_id}/toggle",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


async def test_toggle_cross_tenant_404(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """Alpha admin cannot toggle a Beta-tenant user (404, not leaked)."""
    admin_token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    beta_customer_id = users["beta_customer"].user_id

    resp = await async_client.patch(
        f"/api/v1/users/{beta_customer_id}/toggle",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


async def test_list_invites_scoped_and_persists(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """GET /users/invite returns invites sent for the caller's tenant, and
    reflects invites sent via POST /users/invite (i.e. the list survives
    a page refresh instead of only living in frontend session state)."""
    admin_token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)

    send_resp = await async_client.post(
        "/api/v1/users/invite",
        json={"email": "future_staff@example.com", "role": "staff"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert send_resp.status_code == 201

    list_resp = await async_client.get(
        "/api/v1/users/invite", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert list_resp.status_code == 200
    emails = {inv["email"] for inv in list_resp.json()}
    assert "future_staff@example.com" in emails


async def test_list_invites_not_visible_cross_tenant(
    async_client: AsyncClient,
    db_session: AsyncSession,
    tenants: dict,
    users: dict,
    fake_redis,
):
    """Beta admin does not see Alpha's invitations."""
    alpha_admin_token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    await async_client.post(
        "/api/v1/users/invite",
        json={"email": "alpha_only@example.com", "role": "staff"},
        headers={"Authorization": f"Bearer {alpha_admin_token}"},
    )

    beta_admin_token = await get_token(async_client, "admin@beta.com", SLUG_BETA)
    resp = await async_client.get(
        "/api/v1/users/invite", headers={"Authorization": f"Bearer {beta_admin_token}"}
    )
    assert resp.status_code == 200
    emails = {inv["email"] for inv in resp.json()}
    assert "alpha_only@example.com" not in emails

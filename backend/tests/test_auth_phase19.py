"""Phase 19 tests — password reset, change-password, refresh, profile update.

Uses shared conftest fixtures (two tenants: alpha / beta).
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.services import otp_service
from tests.conftest import SLUG_ALPHA, TEST_PASSWORD, get_token

_STRONG_PW = "NewStr0ng!"  # satisfies complexity requirements
_WEAK_PW = "abc"


# ─────────────────────────────────────────────────────────────────────────────
# Forgot Password
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_forgot_password_always_200(
    async_client: AsyncClient,
    users,
) -> None:
    """BR-AUTH-1: Returns 200 even for non-existent email."""
    resp = await async_client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "nobody@nowhere.com", "tenant_slug": SLUG_ALPHA},
    )
    assert resp.status_code == 200
    assert "OTP" in resp.json()["message"]


@pytest.mark.asyncio
async def test_forgot_password_sets_redis_key(
    async_client: AsyncClient,
    users,
    fake_redis,
) -> None:
    """Sending forgot-password for a real user stores an OTP in Redis."""
    resp = await async_client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "admin@alpha.com", "tenant_slug": SLUG_ALPHA},
    )
    assert resp.status_code == 200
    stored = await fake_redis.get("otp:password_reset:admin@alpha.com")
    assert stored is not None
    assert len(stored) == 6
    assert stored.isdigit()


# ─────────────────────────────────────────────────────────────────────────────
# Reset Password
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reset_password_correct_otp(
    async_client: AsyncClient,
    users,
) -> None:
    """Valid OTP → password updated, user can login with new password."""
    email = "admin@alpha.com"
    otp = await otp_service.generate_and_store_otp("password_reset", email)

    resp = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp_code": otp, "new_password": _STRONG_PW, "tenant_slug": SLUG_ALPHA},
    )
    assert resp.status_code == 200
    assert "Password updated" in resp.json()["message"]

    # Verify new password works at login
    login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": _STRONG_PW, "tenant_slug": SLUG_ALPHA},
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_wrong_otp(
    async_client: AsyncClient,
    users,
) -> None:
    email = "admin@alpha.com"
    await otp_service.generate_and_store_otp("password_reset", email)

    resp = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp_code": "000000", "new_password": _STRONG_PW, "tenant_slug": SLUG_ALPHA},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_weak_password(
    async_client: AsyncClient,
    users,
) -> None:
    email = "admin@alpha.com"
    otp = await otp_service.generate_and_store_otp("password_reset", email)

    resp = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp_code": otp, "new_password": _WEAK_PW, "tenant_slug": SLUG_ALPHA},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_field_name_is_otp_code(
    async_client: AsyncClient,
    users,
) -> None:
    """Sending `code` instead of `otp_code` must fail validation (422)."""
    resp = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"email": "admin@alpha.com", "code": "123456", "new_password": _STRONG_PW, "tenant_slug": SLUG_ALPHA},
    )
    assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# Change Password (authenticated)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_change_password_success(
    async_client: AsyncClient,
    users,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": TEST_PASSWORD, "new_password": _STRONG_PW},
    )
    assert resp.status_code == 200
    assert "Password changed" in resp.json()["message"]


@pytest.mark.asyncio
async def test_change_password_wrong_current(
    async_client: AsyncClient,
    users,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "WrongPass1!", "new_password": _STRONG_PW},
    )
    assert resp.status_code == 400
    assert "incorrect" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_change_password_same_as_old(
    async_client: AsyncClient,
    users,
) -> None:
    """BR-AUTH-3: new_password cannot be the same as current."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": TEST_PASSWORD, "new_password": TEST_PASSWORD},
    )
    # TEST_PASSWORD = "Password123!" which satisfies complexity, but should fail BR-AUTH-3
    # (if TEST_PASSWORD doesn't satisfy complexity it may 400 on that — both acceptable)
    assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# Token Refresh
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_blacklists_old_jti(
    async_client: AsyncClient,
    users,
    fake_redis,
) -> None:
    """BR-AUTH-4: Old token's jti must appear in Redis blacklist after refresh."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)

    resp = await async_client.post(
        "/api/v1/auth/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    # Decode old token to get its jti
    from jose import jwt
    from app.core.config import settings
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    old_jti = payload["jti"]

    blacklisted = await fake_redis.get(f"blacklist:jti:{old_jti}")
    assert blacklisted is not None


@pytest.mark.asyncio
async def test_refresh_new_token_valid(
    async_client: AsyncClient,
    users,
) -> None:
    """New token returned by /auth/refresh must be accepted on GET /auth/me."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)

    refresh_resp = await async_client.post(
        "/api/v1/auth/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refresh_resp.status_code == 200
    new_token = refresh_resp.json()["access_token"]

    me_resp = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "admin@alpha.com"


# ─────────────────────────────────────────────────────────────────────────────
# Profile Update (PATCH /auth/me)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_patch_me_updates_name(
    async_client: AsyncClient,
    users,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Alpha Administrator"},
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Alpha Administrator"


@pytest.mark.asyncio
async def test_patch_me_cannot_change_role(
    async_client: AsyncClient,
    users,
) -> None:
    """Sending a `role` field in the body must be ignored (not in schema → 422 or role unchanged)."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "platform_admin"},
    )
    # Pydantic will ignore unknown field (or 422 if configured strict)
    # Either way, role must not change
    if resp.status_code == 200:
        assert resp.json()["role"] == "tenant_admin"
    else:
        # 422 is also acceptable — extra field rejected
        assert resp.status_code == 422

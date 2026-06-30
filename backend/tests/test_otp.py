"""OTP service tests.

Tests call the otp_service functions directly against the FakeAsyncRedis instance.
No DB or HTTP layer needed — OTP state lives entirely in Redis.
"""
from __future__ import annotations

import pytest

from app.services import otp_service
from tests.conftest import FakeAsyncRedis


PURPOSE = "verification"
EMAIL = "user@example.com"


# ─────────────────────────────────────────────────────────────────────────────
# generate_and_store_otp
# ─────────────────────────────────────────────────────────────────────────────

async def test_generate_stores_code_in_redis(fake_redis: FakeAsyncRedis):
    code = await otp_service.generate_and_store_otp(PURPOSE, EMAIL)

    assert len(code) == 6
    assert code.isdigit()

    key = otp_service._otp_key(PURPOSE, EMAIL)
    stored = await fake_redis.get(key)
    assert stored == code


async def test_generate_resets_attempt_counter(fake_redis: FakeAsyncRedis):
    """Calling generate again should clear the previous attempt counter."""
    attempts_key = otp_service._attempts_key(PURPOSE, EMAIL)
    await fake_redis.setex(attempts_key, 900, "3")

    await otp_service.generate_and_store_otp(PURPOSE, EMAIL)

    remaining = await fake_redis.get(attempts_key)
    assert remaining is None


# ─────────────────────────────────────────────────────────────────────────────
# verify_otp
# ─────────────────────────────────────────────────────────────────────────────

async def test_verify_correct_code_returns_true(fake_redis: FakeAsyncRedis):
    code = await otp_service.generate_and_store_otp(PURPOSE, EMAIL)
    result = await otp_service.verify_otp(PURPOSE, EMAIL, code)
    assert result is True


async def test_verify_correct_code_deletes_key(fake_redis: FakeAsyncRedis):
    """After a successful verify, the OTP key must be gone (single-use)."""
    code = await otp_service.generate_and_store_otp(PURPOSE, EMAIL)
    await otp_service.verify_otp(PURPOSE, EMAIL, code)

    key = otp_service._otp_key(PURPOSE, EMAIL)
    assert await fake_redis.get(key) is None


async def test_verify_single_use_second_attempt_fails(fake_redis: FakeAsyncRedis):
    """Submitting the same correct code a second time must fail."""
    code = await otp_service.generate_and_store_otp(PURPOSE, EMAIL)
    first = await otp_service.verify_otp(PURPOSE, EMAIL, code)
    second = await otp_service.verify_otp(PURPOSE, EMAIL, code)
    assert first is True
    assert second is False


async def test_verify_wrong_code_returns_false(fake_redis: FakeAsyncRedis):
    await otp_service.generate_and_store_otp(PURPOSE, EMAIL)
    result = await otp_service.verify_otp(PURPOSE, EMAIL, "000000")
    assert result is False


async def test_verify_wrong_code_keeps_otp_key(fake_redis: FakeAsyncRedis):
    """A failed attempt should NOT delete the OTP key (code is still valid until max attempts)."""
    code = await otp_service.generate_and_store_otp(PURPOSE, EMAIL)
    await otp_service.verify_otp(PURPOSE, EMAIL, "000000")

    key = otp_service._otp_key(PURPOSE, EMAIL)
    still_there = await fake_redis.get(key)
    assert still_there == code


async def test_max_attempts_invalidates_code(fake_redis: FakeAsyncRedis):
    """After MAX_ATTEMPTS wrong codes the OTP must be invalidated."""
    await otp_service.generate_and_store_otp(PURPOSE, EMAIL)

    for _ in range(otp_service.MAX_ATTEMPTS):
        await otp_service.verify_otp(PURPOSE, EMAIL, "000000")

    key = otp_service._otp_key(PURPOSE, EMAIL)
    assert await fake_redis.get(key) is None


async def test_max_attempts_additional_call_returns_false(fake_redis: FakeAsyncRedis):
    """One more attempt after max still returns False (code is gone)."""
    code = await otp_service.generate_and_store_otp(PURPOSE, EMAIL)

    for _ in range(otp_service.MAX_ATTEMPTS):
        await otp_service.verify_otp(PURPOSE, EMAIL, "000000")

    result = await otp_service.verify_otp(PURPOSE, EMAIL, code)
    assert result is False


# ─────────────────────────────────────────────────────────────────────────────
# invalidate_otp
# ─────────────────────────────────────────────────────────────────────────────

async def test_invalidate_removes_code_and_attempts(fake_redis: FakeAsyncRedis):
    code = await otp_service.generate_and_store_otp(PURPOSE, EMAIL)
    await otp_service.verify_otp(PURPOSE, EMAIL, "000000")  # creates an attempt key

    await otp_service.invalidate_otp(PURPOSE, EMAIL)

    assert await fake_redis.get(otp_service._otp_key(PURPOSE, EMAIL)) is None
    assert await fake_redis.get(otp_service._attempts_key(PURPOSE, EMAIL)) is None


# ─────────────────────────────────────────────────────────────────────────────
# Cross-purpose isolation
# ─────────────────────────────────────────────────────────────────────────────

async def test_otp_purpose_namespace_isolation(fake_redis: FakeAsyncRedis):
    """A code stored for 'verification' must not be verifiable under 'login'."""
    code = await otp_service.generate_and_store_otp("verification", EMAIL)
    result = await otp_service.verify_otp("login", EMAIL, code)
    assert result is False

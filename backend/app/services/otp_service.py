"""OTP service — all Redis operations for one-time passwords.

Redis key layout:
  otp:{purpose}:{email}          → 6-digit code string   TTL 10 min
  otp:attempts:{purpose}:{email} → attempt counter        TTL 15 min

Atomicity note: incr+expire is not atomic; a crash between them could leave a
permanent counter, so the attempts key gets a conservative 15-min TTL on first
increment so it always self-expires.
"""
import random
import string
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.models import OtpLog

OTP_TTL = 600        # 10 minutes
ATTEMPTS_TTL = 900   # 15 minutes
MAX_ATTEMPTS = 5


def _otp_key(purpose: str, email: str) -> str:
    return f"otp:{purpose}:{email.lower()}"


def _attempts_key(purpose: str, email: str) -> str:
    return f"otp:attempts:{purpose}:{email.lower()}"


async def generate_and_store_otp(purpose: str, email: str) -> str:
    """Generate a fresh 6-digit OTP, store it in Redis, return the code."""
    code = "".join(random.choices(string.digits, k=6))
    redis = await get_redis()
    await redis.setex(_otp_key(purpose, email), OTP_TTL, code)
    # Reset attempt counter whenever a fresh code is issued
    await redis.delete(_attempts_key(purpose, email))
    return code


async def verify_otp(purpose: str, email: str, code: str) -> bool:
    """Verify the submitted code. Returns True on success, False otherwise.

    On success the code and attempt counter are deleted (one-time use).
    After MAX_ATTEMPTS failures the code is invalidated to prevent brute-force.
    """
    redis = await get_redis()
    attempts_key = _attempts_key(purpose, email)

    # Increment attempt counter (creates key on first call)
    attempts = await redis.incr(attempts_key)
    if attempts == 1:
        await redis.expire(attempts_key, ATTEMPTS_TTL)

    if attempts > MAX_ATTEMPTS:
        # Invalidate the code so a fresh one must be requested
        await redis.delete(_otp_key(purpose, email))
        return False

    stored = await redis.get(_otp_key(purpose, email))
    if stored and stored == code:
        await redis.delete(_otp_key(purpose, email))
        await redis.delete(attempts_key)
        return True

    return False


async def invalidate_otp(purpose: str, email: str) -> None:
    """Manually invalidate a pending OTP (e.g. on logout or password change)."""
    redis = await get_redis()
    await redis.delete(_otp_key(purpose, email))
    await redis.delete(_attempts_key(purpose, email))


async def log_otp_request(
    db: AsyncSession,
    email: str,
    purpose: str,
    tenant_id: UUID | None,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    """Write an audit row to otp_logs."""
    db.add(OtpLog(
        tenant_id=tenant_id,
        email=email,
        purpose=purpose,
        ip_address=ip_address,
        user_agent=user_agent,
    ))
    await db.commit()


async def mark_otp_verified(
    db: AsyncSession,
    email: str,
    purpose: str,
    tenant_id: UUID | None,
) -> None:
    """Update the most recent unverified OtpLog row for this email+purpose."""
    from sqlalchemy import select, update
    from datetime import datetime, timezone
    from app.models.models import OtpLog

    # Find the latest unverified log for this email+purpose
    result = await db.execute(
        select(OtpLog)
        .where(
            OtpLog.email == email.lower(),
            OtpLog.purpose == purpose,
            OtpLog.verified_at.is_(None),
        )
        .order_by(OtpLog.requested_at.desc())
        .limit(1)
    )
    log = result.scalar_one_or_none()
    if log:
        log.verified_at = datetime.now(timezone.utc)
        await db.commit()

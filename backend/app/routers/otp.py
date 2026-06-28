"""OTP endpoints — send and verify one-time passwords.

Rate limits (per client IP via slowapi):
  POST /otp/send   → 3 requests / minute
  POST /otp/verify → 5 requests / minute

Both endpoints accept a tenant_slug so the OTP log can be associated with
the correct tenant even before a JWT is issued.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.email import send_otp_email
from app.core.database import get_db
from app.core.limiter import limiter
from app.schemas.otp import OtpSendRequest, OtpSendResponse, OtpVerifyRequest, OtpVerifyResponse
from app.services import otp_service
from app.services.auth_service import AuthService

router = APIRouter(prefix="/otp", tags=["otp"])
_auth = AuthService()


@router.post("/send", response_model=OtpSendResponse)
@limiter.limit("3/minute")
async def send_otp(
    request: Request,
    data: OtpSendRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate and email a 6-digit OTP.

    Always returns 200 with a generic message — does NOT confirm whether the
    email exists to prevent user enumeration.
    """
    # Resolve tenant (raises 404 if unknown/inactive)
    tenant = await _auth.get_tenant_by_slug(data.tenant_slug, db)

    # Generate + store OTP in Redis
    otp_code = await otp_service.generate_and_store_otp(data.purpose, data.email)

    # Fire-and-forget email (errors are logged, not surfaced to caller)
    try:
        await send_otp_email(data.email, otp_code, data.purpose)
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            "OTP email delivery failed for %s (purpose=%s)", data.email, data.purpose
        )

    # Audit log
    await otp_service.log_otp_request(
        db=db,
        email=data.email,
        purpose=data.purpose,
        tenant_id=tenant.tenant_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
    )

    return OtpSendResponse(
        message="If that address is registered, a code has been sent.",
        email=data.email,
        purpose=data.purpose,
    )


@router.post("/verify", response_model=OtpVerifyResponse)
@limiter.limit("5/minute")
async def verify_otp(
    request: Request,
    data: OtpVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify a previously issued OTP.

    Returns `verified: true` on success, `verified: false` on wrong/expired code.
    Raises 429 (handled by slowapi) on rate-limit breach.
    After 5 failed attempts the code is invalidated automatically.
    """
    tenant = await _auth.get_tenant_by_slug(data.tenant_slug, db)

    verified = await otp_service.verify_otp(data.purpose, data.email, data.otp_code)

    if verified:
        await otp_service.mark_otp_verified(
            db=db,
            email=data.email,
            purpose=data.purpose,
            tenant_id=tenant.tenant_id,
        )

        # If purpose is email_verification, mark the user's email as verified
        if data.purpose == "email_verification":
            from sqlalchemy import select
            from app.models.models import User
            from datetime import datetime, timezone
            result = await db.execute(
                select(User).where(
                    User.email == data.email,
                    User.tenant_id == tenant.tenant_id,
                )
            )
            user = result.scalar_one_or_none()
            if user and not user.email_verified:
                user.email_verified = True
                user.email_verified_at = datetime.now(timezone.utc)
                await db.commit()

        return OtpVerifyResponse(verified=True, message="Code verified successfully.")

    return OtpVerifyResponse(verified=False, message="Invalid or expired code.")

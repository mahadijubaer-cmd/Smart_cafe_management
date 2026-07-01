import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.redis import get_redis
from app.models.models import User
from app.models.user import UserRole
from app.schemas.user import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ProfileUpdate,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
)

# BR-REG-1: These roles may not self-register; they require an admin invitation.
_SELF_REGISTER_BLOCKED = {
    UserRole.staff,
    UserRole.cleaner,
    UserRole.outlet_admin,
    UserRole.tenant_admin,
    UserRole.platform_admin,
    UserRole.food_court_admin,
}
from app.services.auth_service import AuthService
from app.services import otp_service
from app.config.email import send_otp_email

_PASSWORD_RE = re.compile(
    r'^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;\':",./<>?]).{8,}$'
)


def _validate_password_complexity(password: str) -> None:
    if not _PASSWORD_RE.match(password):
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least 8 characters and include "
                "an uppercase letter, a digit, and a special character."
            ),
        )

router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user under the given tenant_slug."""
    # BR-REG-1: Block privileged roles from self-registration
    if user_data.role in _SELF_REGISTER_BLOCKED:
        raise HTTPException(status_code=400, detail="This role requires an admin invitation.")

    # Resolve tenant
    tenant = await auth_service.get_tenant_by_slug(user_data.tenant_slug, db)

    # Email must be unique within this tenant
    existing = await db.execute(
        select(User).where(
            User.email == user_data.email,
            User.tenant_id == tenant.tenant_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered for this tenant")

    # Optional: enforce allowed_email_domain for academic tenants
    if tenant.allowed_email_domain:
        domain = "@" + user_data.email.split("@")[-1]
        if domain != tenant.allowed_email_domain:
            raise HTTPException(
                status_code=400,
                detail=f"Registration requires an {tenant.allowed_email_domain} email address",
            )

    new_user = User(
        tenant_id=tenant.tenant_id,
        full_name=user_data.full_name,
        email=user_data.email,
        password_hash=auth_service.hash_password(user_data.password),
        role=user_data.role,
        student_id=user_data.student_id,
        phone=user_data.phone,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate and return a JWT with full tenant context."""
    tenant = await auth_service.get_tenant_by_slug(credentials.tenant_slug, db)

    result = await db.execute(
        select(User).where(
            User.email == credentials.email,
            User.tenant_id == tenant.tenant_id,
        )
    )
    user = result.scalar_one_or_none()

    if not user or not auth_service.verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    access_token = auth_service.create_access_token(user, tenant)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id,
        tenant_id=tenant.tenant_id,
        tenant_type=tenant.tenant_type,
        tenant_slug=tenant.slug,
        outlet_id=user.outlet_id,
        role=user.role,
    )


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Blacklist the current JWT so it cannot be reused before expiry."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return

    token = auth_header[7:]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            ttl = int(exp - datetime.now(tz=timezone.utc).timestamp())
            if ttl > 0:
                redis = await get_redis()
                await redis.setex(f"blacklist:jti:{jti}", ttl, "1")
    except JWTError:
        pass  # Token already invalid — nothing to blacklist


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update own profile fields (full_name, phone, student_id)."""
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.phone is not None:
        current_user.phone = data.phone
    if data.student_id is not None:
        current_user.student_id = data.student_id
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a password-reset OTP. Always returns 200 (BR-AUTH-1)."""
    from app.models.tenant import Tenant

    result = await db.execute(
        select(User)
        .join(Tenant, Tenant.tenant_id == User.tenant_id)
        .where(
            User.email == data.email,
            Tenant.slug == data.tenant_slug,
            User.is_active.is_(True),
        )
    )
    user = result.scalar_one_or_none()

    if user:
        otp_code = await otp_service.generate_and_store_otp("password_reset", data.email)
        try:
            await send_otp_email(data.email, otp_code, "password_reset")
        except Exception:
            pass  # Never fail — email is best-effort

    return {"message": "If that email is registered, an OTP has been sent."}


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Complete password reset using OTP received by email."""
    from app.models.tenant import Tenant

    # Verify OTP (handles attempt counting and deletion on success)
    verified = await otp_service.verify_otp("password_reset", data.email, data.otp_code)
    if not verified:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    _validate_password_complexity(data.new_password)

    result = await db.execute(
        select(User)
        .join(Tenant, Tenant.tenant_id == User.tenant_id)
        .where(
            User.email == data.email,
            Tenant.slug == data.tenant_slug,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = auth_service.hash_password(data.new_password)
    await db.commit()
    return {"message": "Password updated. Please log in."}


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Authenticated user changes own password (BR-AUTH-3)."""
    if not auth_service.verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    _validate_password_complexity(data.new_password)

    if auth_service.verify_password(data.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="New password cannot match current")

    current_user.password_hash = auth_service.hash_password(data.new_password)
    await db.commit()
    return {"message": "Password changed."}


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Issue a new token and blacklist the old one (BR-AUTH-4)."""
    from app.models.tenant import Tenant

    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else ""

    # Blacklist old jti
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            remaining = int(exp - datetime.now(tz=timezone.utc).timestamp())
            if remaining > 0:
                redis = await get_redis()
                await redis.setex(f"blacklist:jti:{jti}", remaining, "1")
    except JWTError:
        pass

    # Load tenant to build full token claims
    result = await db.execute(
        select(Tenant).where(Tenant.tenant_id == current_user.tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    new_token = auth_service.create_access_token(current_user, tenant)
    return Token(
        access_token=new_token,
        token_type="bearer",
        user_id=current_user.user_id,
        tenant_id=tenant.tenant_id,
        tenant_type=tenant.tenant_type,
        tenant_slug=tenant.slug,
        outlet_id=current_user.outlet_id,
        role=current_user.role,
    )

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
from app.schemas.user import Token, UserCreate, UserLogin, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user under the given tenant_slug."""
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

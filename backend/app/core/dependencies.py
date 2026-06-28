from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.models.tenant import TenantType
from app.models.user import User, UserRole
from app.services.auth_service import AuthService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
auth_service = AuthService()


@dataclass
class TenantContext:
    """Lightweight struct derived from JWT claims — no extra DB round-trip."""
    tenant_id: UUID
    tenant_type: TenantType
    tenant_slug: str
    outlet_id: UUID | None = None


# ── Role group constants ────────────────────────────────────────────────────
# Use these in require_role() calls for clarity and DRY routing.

CUSTOMER_ROLES = (UserRole.customer, UserRole.student)   # legacy student kept

CLEANER_ROLES = (UserRole.cleaner,)

FLOOR_STAFF_ROLES = (UserRole.staff, UserRole.server)

ADMIN_ROLES = (
    UserRole.outlet_admin,
    UserRole.tenant_admin,
    UserRole.food_court_admin,
    UserRole.super_admin,
    UserRole.platform_admin,
)

# staff + all admins (can manage operations)
WORK_ROLES = FLOOR_STAFF_ROLES + ADMIN_ROLES

# everyone who can interact with the system as a user
ALL_AUTH_ROLES = CUSTOMER_ROLES + CLEANER_ROLES + WORK_ROLES


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate request: decode JWT, check blacklist, load User from DB."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = auth_service.decode_token(token)
    if token_data.user_id is None:
        raise credentials_exc

    # Check JWT blacklist in Redis
    if token_data.jti:
        redis = await get_redis()
        if await redis.exists(f"blacklist:jti:{token_data.jti}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

    result = await db.execute(select(User).where(User.user_id == token_data.user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exc

    return user


def get_tenant_context(request: Request) -> TenantContext:
    """Return the TenantContext injected by TenantContextMiddleware.

    Raises 401 if no tenant context is present (unauthenticated request).
    """
    ctx = getattr(request.state, "tenant_ctx", None)
    if ctx is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant context unavailable — include a valid Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return ctx


def require_role(*allowed_roles: UserRole):
    """Dependency factory: passes only if the user's role is in allowed_roles.

    Use the role-group constants (ADMIN_ROLES, WORK_ROLES, etc.) to avoid
    long argument lists and keep call sites readable.
    """
    role_set = frozenset(allowed_roles)

    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in role_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _checker

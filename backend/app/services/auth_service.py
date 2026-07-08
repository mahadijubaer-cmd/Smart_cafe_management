from datetime import timedelta
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core import security
from app.core.config import settings
from app.models.user import User, UserRole
from app.models.tenant import Tenant, TenantType
from app.schemas.user import TokenData

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class AuthService:
    def hash_password(self, plain_password: str) -> str:
        return pwd_context.hash(plain_password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(
        self,
        user: User,
        tenant: Tenant,
        expires_delta: Optional[timedelta] = None,
        extra_claims: Optional[dict] = None,
    ) -> str:
        """Build a JWT with full tenant context claims.

        extra_claims (RFC-009) lets a caller stamp additional payload fields — currently only
        used by impersonation tokens (`impersonation: true`).
        """
        data = {
            "sub": str(user.user_id),
            "role": user.role.value,
            "tenant_id": str(tenant.tenant_id),
            "tenant_type": tenant.tenant_type.value,
            "tenant_slug": tenant.slug,
            "outlet_id": str(user.outlet_id) if user.outlet_id else None,
        }
        if extra_claims:
            data.update(extra_claims)
        return security.create_access_token(data, expires_delta)

    def decode_token(self, token: str) -> TokenData:
        """Decode JWT and return typed TokenData."""
        payload = security.decode_token(token)
        try:
            return TokenData(
                user_id=UUID(payload["sub"]) if payload.get("sub") else None,
                role=UserRole(payload["role"]) if payload.get("role") else None,
                tenant_id=UUID(payload["tenant_id"]) if payload.get("tenant_id") else None,
                tenant_type=TenantType(payload["tenant_type"]) if payload.get("tenant_type") else None,
                tenant_slug=payload.get("tenant_slug"),
                outlet_id=UUID(payload["outlet_id"]) if payload.get("outlet_id") else None,
                jti=payload.get("jti"),
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed token claims",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    async def get_current_user(self, token: str, db: AsyncSession) -> User:
        """Load User from DB using decoded JWT. (Used by legacy callers.)"""
        token_data = self.decode_token(token)
        if not token_data.user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Could not validate credentials",
                                headers={"WWW-Authenticate": "Bearer"})
        result = await db.execute(select(User).where(User.user_id == token_data.user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Could not validate credentials",
                                headers={"WWW-Authenticate": "Bearer"})
        return user

    async def get_tenant_by_slug(self, slug: str, db: AsyncSession) -> Tenant:
        result = await db.execute(select(Tenant).where(Tenant.slug == slug, Tenant.is_active == True))
        tenant = result.scalar_one_or_none()
        if tenant is None:
            raise HTTPException(status_code=404, detail=f"Tenant '{slug}' not found or inactive")
        return tenant

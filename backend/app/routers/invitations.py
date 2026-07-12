"""Staff invitation endpoints.

POST /users/invite        — admin sends invite email
POST /users/accept-invite — new user accepts invite, creates account + returns token
"""
from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.email import send_invite_email
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import ADMIN_ROLES, CLEANER_ROLES, FLOOR_STAFF_ROLES, TenantContext, get_current_user, get_tenant_context, require_role
from app.core.security import hash_password as _hash_password
from app.core.tier_limits import check_tier_limit
from app.models.models import StaffInvitation
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.services.auth_service import AuthService

router = APIRouter(prefix="/users", tags=["invitations"])

_auth_service = AuthService()

_INVITABLE_ROLES = {
    UserRole.staff,
    UserRole.cleaner,
    UserRole.server,
    UserRole.outlet_admin,
}

_PASSWORD_RE = re.compile(
    r'^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;\':",./<>?]).{8,}$'
)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class InviteCreate(BaseModel):
    email: EmailStr
    role: UserRole


class AcceptInvite(BaseModel):
    token: str
    full_name: str
    password: str


class InvitationResponse(BaseModel):
    invite_id: str
    email: str
    role: str
    expires_at: str
    accepted_at: str | None = None


@router.get("/invite", response_model=list[InvitationResponse])
async def list_invites(
    ctx: TenantContext = Depends(get_tenant_context),
    _admin: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """List invitations sent for the caller's tenant, most recent first."""
    result = await db.execute(
        select(StaffInvitation)
        .where(StaffInvitation.tenant_id == ctx.tenant_id)
        .order_by(StaffInvitation.created_at.desc())
    )
    invites = result.scalars().all()
    return [
        InvitationResponse(
            invite_id=str(inv.invite_id),
            email=inv.email,
            role=inv.role,
            expires_at=inv.expires_at.isoformat(),
            accepted_at=inv.accepted_at.isoformat() if inv.accepted_at else None,
        )
        for inv in invites
    ]


@router.delete("/invite/{invite_id}", status_code=204)
async def revoke_invite(
    invite_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    _admin: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a still-pending invitation (BR-INVITE-1). Only makes sense pre-acceptance — an
    accepted invite already has a real user account, which should be deactivated via the users
    list instead of "un-invited" here."""
    result = await db.execute(
        select(StaffInvitation).where(
            StaffInvitation.invite_id == invite_id,
            StaffInvitation.tenant_id == ctx.tenant_id,
        )
    )
    invite = result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot revoke an invitation that has already been accepted")

    await db.delete(invite)
    await db.commit()


@router.post("/invite", status_code=201)
async def send_invite(
    body: InviteCreate,
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in _INVITABLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Role '{body.role.value}' cannot be invited. Allowed: {[r.value for r in _INVITABLE_ROLES]}",
        )

    # Load tenant for org name + slug (needed for invite link)
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.tenant_id == current_user.tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    staff_role_values = [r.value for r in (*FLOOR_STAFF_ROLES, *CLEANER_ROLES)]
    staff_count = await db.scalar(
        select(func.count(User.user_id)).where(
            User.tenant_id == current_user.tenant_id,
            User.role.in_(staff_role_values),
        )
    )
    check_tier_limit(tenant.subscription_tier, "max_staff", staff_count)

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=48)

    invite = StaffInvitation(
        tenant_id=current_user.tenant_id,
        email=str(body.email),
        role=body.role.value,
        token_hash=token_hash,
        invited_by=current_user.user_id,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    # Build invite link using SERVER_HOST if set, else relative path
    base = getattr(settings, "SERVER_HOST", "")
    invite_link = f"{base}/{tenant.slug}/register?invite_token={raw_token}"
    await send_invite_email(
        to_email=str(body.email),
        invite_link=invite_link,
        role=body.role.value,
        org_name=tenant.name,
    )

    return {
        "invite_id": str(invite.invite_id),
        "email": str(body.email),
        "role": body.role.value,
        "expires_at": invite.expires_at.isoformat(),
        "invite_link": invite_link,
    }


@router.post("/accept-invite", status_code=201)
async def accept_invite(
    body: AcceptInvite,
    db: AsyncSession = Depends(get_db),
):
    if not _PASSWORD_RE.match(body.password):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters with uppercase, digit, and special character.",
        )

    token_hash = _hash_token(body.token)
    result = await db.execute(
        select(StaffInvitation).where(StaffInvitation.token_hash == token_hash)
    )
    invite = result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")

    now = datetime.now(timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=400, detail="Invitation has expired")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=400, detail="Invitation has already been used")

    user = User(
        tenant_id=invite.tenant_id,
        full_name=body.full_name.strip(),
        email=invite.email,
        password_hash=_hash_password(body.password),
        role=UserRole(invite.role),
        is_active=True,
        email_verified=True,
    )
    db.add(user)

    invite.accepted_at = now
    await db.commit()
    await db.refresh(user)

    # Load tenant for JWT claims
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.tenant_id == invite.tenant_id)
    )
    tenant = tenant_result.scalar_one()

    access_token = _auth_service.create_access_token(user=user, tenant=tenant)
    return {"access_token": access_token, "token_type": "bearer"}

"""Tenant-scoped user directory.

Complements invitations.py — invites create new users; this router lists and
manages users who already exist in the calling admin's tenant.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import ADMIN_ROLES, TenantContext, get_tenant_context, require_role
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    ctx: TenantContext = Depends(get_tenant_context),
    _admin: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """List all users belonging to the caller's tenant."""
    result = await db.execute(
        select(User)
        .where(User.tenant_id == ctx.tenant_id)
        .order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/{user_id}/toggle", response_model=UserResponse)
async def toggle_user_active(
    user_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Flip a user's is_active flag. Scoped to the caller's tenant; an admin
    cannot deactivate their own account."""
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    result = await db.execute(
        select(User).where(User.user_id == user_id, User.tenant_id == ctx.tenant_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = not user.is_active
    await db.commit()
    await db.refresh(user)
    return user

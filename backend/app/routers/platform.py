"""Platform admin control plane (RFC-009).

Owns cross-tenant concerns that belong to platform_admin alone: the audit log, genuinely
platform-wide (all-tenant-type) analytics, and tenant impersonation. Tenant lifecycle CRUD
itself (create/update/activate/suspend/delete/export) stays in routers/tenants.py.

Every endpoint here is platform_admin-only — see PA-0 in specs/modules/platform.md.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.models import Order, PlatformAuditLog
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole
from app.services.audit_service import AuditAction, record_audit
from app.services.auth_service import AuthService

router = APIRouter(prefix="/platform", tags=["platform"])
_auth_service = AuthService()
_platform_admin_only = Depends(require_role(UserRole.platform_admin))


class AuditLogEntry(BaseModel):
    log_id: UUID
    actor_id: UUID | None
    actor_email: str
    action: str
    target_tenant_id: UUID | None
    target_tenant_name: str | None
    target_tenant_slug: str | None
    details: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntry]
    total: int


class ImpersonationResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_slug: str
    expires_in_minutes: int = 15


@router.get("/audit-logs", response_model=AuditLogListResponse, dependencies=[_platform_admin_only])
async def list_audit_logs(
    tenant_id: UUID | None = None,
    action: str | None = None,
    skip: int = 0,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(PlatformAuditLog)
    count_query = select(func.count(PlatformAuditLog.log_id))
    if tenant_id is not None:
        query = query.where(PlatformAuditLog.target_tenant_id == tenant_id)
        count_query = count_query.where(PlatformAuditLog.target_tenant_id == tenant_id)
    if action is not None:
        query = query.where(PlatformAuditLog.action == action)
        count_query = count_query.where(PlatformAuditLog.action == action)

    total = await db.scalar(count_query)
    result = await db.execute(
        query.order_by(PlatformAuditLog.created_at.desc()).offset(skip).limit(limit)
    )
    items = result.scalars().all()
    return AuditLogListResponse(items=list(items), total=total)


@router.get("/analytics/overview", response_model=dict, dependencies=[_platform_admin_only])
async def get_platform_analytics_overview(db: AsyncSession = Depends(get_db)):
    """Genuinely cross-tenant-type overview — distinct from GET /analytics/outlets, which is a
    franchise-outlet-only comparison gated to super_admin."""
    type_counts_result = await db.execute(
        select(Tenant.tenant_type, func.count(Tenant.tenant_id)).group_by(Tenant.tenant_type)
    )
    tenants_by_type = {row[0].value: row[1] for row in type_counts_result.all()}

    status_counts_result = await db.execute(
        select(Tenant.is_active, func.count(Tenant.tenant_id)).group_by(Tenant.is_active)
    )
    tenants_by_status = {"active": 0, "suspended": 0}
    for is_active, count in status_counts_result.all():
        tenants_by_status["active" if is_active else "suspended"] = count

    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    signups_result = await db.execute(
        select(
            func.date(Tenant.created_at).label("day"),
            func.count(Tenant.tenant_id),
        )
        .where(Tenant.created_at >= thirty_days_ago)
        .group_by(text("day"))
        .order_by(text("day"))
    )
    signups_last_30_days = [
        {"date": str(row[0]), "count": row[1]} for row in signups_result.all()
    ]

    orders_result = await db.execute(
        select(
            func.count(Order.order_id),
            func.coalesce(func.sum(Order.total_amount), 0),
        ).where(Order.created_at >= thirty_days_ago)
    )
    total_orders, total_revenue = orders_result.one()

    return {
        "tenants_by_type": tenants_by_type,
        "tenants_by_status": tenants_by_status,
        "signups_last_30_days": signups_last_30_days,
        "orders_last_30_days": {
            "total_orders": total_orders,
            "total_revenue": str(total_revenue),
        },
    }


@router.post("/tenants/{tenant_id}/impersonate", response_model=ImpersonationResponse)
async def impersonate_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    """Mint a 15-minute token scoped to tenant_id, for the calling platform admin's own user
    identity — see RFC-009 §2.7 for why no synthetic user / new auth mechanism is needed."""
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Tenant not found")

    access_token = _auth_service.create_access_token(
        user=current_user,
        tenant=target,
        expires_delta=timedelta(minutes=15),
        extra_claims={"impersonation": True},
    )
    await record_audit(db, current_user, AuditAction.impersonation_started, target_tenant=target)
    await db.commit()

    return ImpersonationResponse(access_token=access_token, tenant_slug=target.slug)

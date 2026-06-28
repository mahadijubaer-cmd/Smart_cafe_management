from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    CLEANER_ROLES,
    TenantContext,
    get_tenant_context,
    require_role,
)
from app.models.models import CleanerLog, CleanerStatus, TablesMap, User
from app.models.table import TableStatus
from app.schemas.cleaner import CleanerAssignmentAdminResponse, CleanerAssignmentResponse
from app.services.ws_pubsub import publish_event

router = APIRouter(prefix="/cleaners", tags=["cleaners"])


@router.get("/assignments", response_model=list[CleanerAssignmentResponse])
async def get_cleaner_assignments(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CLEANER_ROLES)),
):
    result = await db.execute(
        select(CleanerLog)
        .options(selectinload(CleanerLog.table))
        .where(
            CleanerLog.tenant_id == ctx.tenant_id,
            CleanerLog.cleaner_id == current_user.user_id,
            CleanerLog.status != CleanerStatus.done,
        )
        .order_by(CleanerLog.assigned_at.desc())
    )
    return result.scalars().all()


@router.patch("/assignments/{log_id}/start", response_model=CleanerAssignmentResponse)
async def start_cleaning(
    log_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CLEANER_ROLES)),
):
    result = await db.execute(
        select(CleanerLog)
        .options(selectinload(CleanerLog.table))
        .where(CleanerLog.log_id == log_id, CleanerLog.tenant_id == ctx.tenant_id)
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if log.cleaner_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    log.status = CleanerStatus.in_progress
    table = log.table
    table_id = table.table_id if table else log.table_id
    table_number = table.table_number if table else None
    if table:
        table.status = TableStatus.cleaning

    await db.commit()
    result = await db.execute(
        select(CleanerLog)
        .options(selectinload(CleanerLog.table))
        .where(CleanerLog.log_id == log_id)
    )
    log = result.scalar_one_or_none() or log

    await publish_event(
        ctx.tenant_id,
        {"type": "TABLE_UPDATE", "table_id": table_id, "table_number": table_number, "status": "cleaning"},
    )
    return log


@router.patch("/assignments/{log_id}/done", response_model=CleanerAssignmentResponse)
async def complete_cleaning(
    log_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CLEANER_ROLES)),
):
    result = await db.execute(
        select(CleanerLog)
        .options(selectinload(CleanerLog.table))
        .where(CleanerLog.log_id == log_id, CleanerLog.tenant_id == ctx.tenant_id)
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if log.cleaner_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    log.status = CleanerStatus.done
    log.cleaned_at = datetime.utcnow()

    table_result = await db.execute(
        select(TablesMap).where(
            TablesMap.table_id == log.table_id,
            TablesMap.tenant_id == ctx.tenant_id,
        )
    )
    table = table_result.scalar_one_or_none()
    if table:
        table.status = TableStatus.available

    await db.commit()
    result = await db.execute(
        select(CleanerLog)
        .options(selectinload(CleanerLog.table), selectinload(CleanerLog.cleaner))
        .where(CleanerLog.log_id == log_id)
    )
    log = result.scalar_one_or_none() or log

    if table:
        await publish_event(
            ctx.tenant_id,
            {"type": "TABLE_CLEAN", "table_id": table.table_id, "table_number": table.table_number},
        )
    return log


@router.get("/assignments/all", response_model=list[CleanerAssignmentAdminResponse])
async def get_all_assignments(
    status: str = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*ADMIN_ROLES)),
):
    query = (
        select(CleanerLog)
        .options(selectinload(CleanerLog.cleaner), selectinload(CleanerLog.table))
        .where(CleanerLog.tenant_id == ctx.tenant_id)
    )
    if status:
        query = query.where(CleanerLog.status == status)
    result = await db.execute(query.order_by(CleanerLog.assigned_at.desc()))
    return result.scalars().all()

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    CUSTOMER_ROLES,
    TenantContext,
    get_tenant_context,
    require_role,
)
from app.models.models import Reservation, TablesMap, User
from app.schemas.table import TableResponse, TableUpdateStatus

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("/", response_model=list[TableResponse])
async def get_all_tables(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TablesMap)
        .where(TablesMap.tenant_id == ctx.tenant_id)
        .order_by(TablesMap.position_y, TablesMap.position_x)
    )
    return result.scalars().all()


@router.get("/reserved-slots")
async def get_reserved_slots(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Reservation.reserved_for).where(
            Reservation.tenant_id == ctx.tenant_id,
            Reservation.reserved_for >= now,
        )
    )
    return [slot.isoformat() for (slot,) in result.all()]


@router.get("/{table_id}", response_model=TableResponse)
async def get_table(
    table_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TablesMap).where(
            TablesMap.table_id == table_id,
            TablesMap.tenant_id == ctx.tenant_id,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return table


@router.post("/reserve", status_code=201)
async def reserve_table(
    table_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    result = await db.execute(
        select(TablesMap).where(
            TablesMap.table_id == table_id,
            TablesMap.tenant_id == ctx.tenant_id,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    current_status = getattr(table.status, "value", table.status)
    if current_status != "available":
        raise HTTPException(status_code=400, detail="Table not available")

    reservation = Reservation(
        tenant_id=ctx.tenant_id,
        user_id=current_user.user_id,
        table_id=table_id,
        reserved_for=datetime.utcnow() + timedelta(hours=1),
        duration_mins=60,
    )
    db.add(reservation)
    table.status = "reserved"
    await db.commit()
    return {"reservation_id": str(reservation.reservation_id), "table_id": table_id}


@router.patch("/{table_id}/status", response_model=TableResponse)
async def update_table_status(
    table_id: int,
    status_data: TableUpdateStatus,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*ADMIN_ROLES)),
):
    result = await db.execute(
        select(TablesMap).where(
            TablesMap.table_id == table_id,
            TablesMap.tenant_id == ctx.tenant_id,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    table.status = status_data.status
    await db.commit()
    await db.refresh(table)
    return table

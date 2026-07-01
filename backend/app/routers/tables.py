from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
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
from app.models.order import Order, OrderStatus
from app.schemas.table import (
    TableCreate,
    TableLayoutBatch,
    TableResponse,
    TableUpdate,
    TableUpdateStatus,
)

router = APIRouter(prefix="/tables", tags=["tables"])

_ACTIVE_STATUSES = (
    OrderStatus.pending,
    OrderStatus.confirmed,
    OrderStatus.preparing,
    OrderStatus.ready,
)


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


@router.post("/", response_model=TableResponse, status_code=201)
async def create_table(
    table_data: TableCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*ADMIN_ROLES)),
):
    table = TablesMap(
        tenant_id=ctx.tenant_id,
        table_number=table_data.table_number,
        zone=table_data.zone,
        capacity=table_data.capacity,
        position_x=table_data.position_x if table_data.position_x is not None else 0,
        position_y=table_data.position_y if table_data.position_y is not None else 0,
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    return table


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


# PATCH /layout must be declared before /{table_id} routes to avoid routing ambiguity
@router.patch("/layout", response_model=list[TableResponse])
async def batch_update_layout(
    batch: TableLayoutBatch,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*ADMIN_ROLES)),
):
    if not batch.tables:
        return []

    # TR-3: check duplicate (position_x, position_y) within the batch
    positions = [(item.position_x, item.position_y) for item in batch.tables]
    if len(positions) != len(set(positions)):
        raise HTTPException(status_code=400, detail="Duplicate table position in batch")

    table_ids = [item.table_id for item in batch.tables]

    # Load all referenced tables
    result = await db.execute(
        select(TablesMap).where(
            TablesMap.table_id.in_(table_ids),
        )
    )
    db_tables: dict[int, TablesMap] = {t.table_id: t for t in result.scalars().all()}

    # Verify all tables belong to this tenant
    for table_id in table_ids:
        table = db_tables.get(table_id)
        if table is None or table.tenant_id != ctx.tenant_id:
            raise HTTPException(status_code=403, detail=f"Table {table_id} not accessible")

    # Apply updates in a single transaction
    async with db.begin_nested():
        for item in batch.tables:
            table = db_tables[item.table_id]
            table.position_x = item.position_x
            table.position_y = item.position_y
            table.zone = item.zone
            table.capacity = item.capacity

    await db.commit()
    for table in db_tables.values():
        await db.refresh(table)

    return list(db_tables.values())


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


@router.put("/{table_id}", response_model=TableResponse)
async def update_table(
    table_id: int,
    update_data: TableUpdate,
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

    table.table_number = update_data.table_number
    table.zone = update_data.zone
    table.capacity = update_data.capacity
    table.position_x = update_data.position_x
    table.position_y = update_data.position_y

    await db.commit()
    await db.refresh(table)
    return table


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


@router.delete("/{table_id}", status_code=204)
async def delete_table(
    table_id: int,
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

    # TR-1: reject if there are active orders for this table
    active_count_result = await db.execute(
        select(func.count(Order.order_id)).where(
            Order.table_id == table_id,
            Order.status.in_(_ACTIVE_STATUSES),
        )
    )
    active_count = active_count_result.scalar_one()
    if active_count > 0:
        raise HTTPException(status_code=400, detail="Table has active orders and cannot be deleted")

    await db.delete(table)
    await db.commit()


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

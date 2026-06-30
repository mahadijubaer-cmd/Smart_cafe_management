"""Food Court router — Section 15 (food_court parent tenant only).

All endpoints enforce tenant_type == food_court via _require_food_court().
Vendor-private data (menu, inventory, recipes, revenue) is NEVER widened —
only shared resources (tables, shared staff, cross-vendor active orders) use
the family scope returned by accessible_tenant_ids().
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    TenantContext,
    accessible_tenant_ids,
    get_tenant_context,
    require_role,
)
from app.models.menu import MenuItem
from app.models.order import Order, OrderStatus
from app.models.table import TablesMap, TableStatus
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole

router = APIRouter(prefix="/food-court", tags=["food-court"])

ACTIVE_STATUSES = frozenset({
    OrderStatus.pending,
    OrderStatus.confirmed,
    OrderStatus.preparing,
    OrderStatus.ready,
})


# ── Guard ─────────────────────────────────────────────────────────────────────

def _require_food_court(ctx: TenantContext = Depends(get_tenant_context)) -> TenantContext:
    if ctx.tenant_type != TenantType.food_court:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only accessible to food court tenants",
        )
    return ctx


# ── Inline request schemas ────────────────────────────────────────────────────

class TableCreate(BaseModel):
    table_number: str
    zone: str = "food-court"
    capacity: int = 4
    position_x: int = 0
    position_y: int = 0


class TableStatusUpdate(BaseModel):
    status: TableStatus


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/vendors")
async def list_vendors(
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(
        UserRole.food_court_admin, UserRole.customer, UserRole.server, UserRole.cleaner
    )),
) -> list[dict]:
    """List vendor restaurants under this food court."""
    result = await db.execute(
        select(Tenant).where(
            Tenant.parent_tenant_id == ctx.tenant_id,
            Tenant.tenant_type == TenantType.food_court_vendor,
            Tenant.is_active.is_(True),
        ).order_by(Tenant.name)
    )
    return [
        {
            "tenant_id": str(v.tenant_id),
            "name": v.name,
            "slug": v.slug,
            "subscription_tier": v.subscription_tier,
            "logo_url": v.logo_url,
        }
        for v in result.scalars().all()
    ]


@router.get("/menu")
async def unified_menu(
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(
        UserRole.customer, UserRole.server, UserRole.food_court_admin
    )),
) -> list[dict]:
    """Unified menu across all vendors, grouped by vendor. Read-only family scope."""
    vendor_ids = await accessible_tenant_ids(ctx, db)
    vendor_ids.discard(ctx.tenant_id)  # food court parent has no menu of its own

    if not vendor_ids:
        return []

    result = await db.execute(
        select(MenuItem, Tenant)
        .join(Tenant, MenuItem.tenant_id == Tenant.tenant_id)
        .where(
            MenuItem.tenant_id.in_(vendor_ids),
            MenuItem.is_available.is_(True),
        )
        .order_by(Tenant.name, MenuItem.name)
    )
    by_vendor: dict[str, dict] = {}
    for item, tenant in result.all():
        vid = str(tenant.tenant_id)
        if vid not in by_vendor:
            by_vendor[vid] = {"vendor_id": vid, "vendor_name": tenant.name, "items": []}
        by_vendor[vid]["items"].append({
            "item_id": str(item.item_id),
            "name": item.name,
            "description": getattr(item, "description", None),
            "price": str(item.price),
        })
    return list(by_vendor.values())


@router.get("/tables")
async def list_shared_tables(
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(
        UserRole.food_court_admin, UserRole.server, UserRole.customer
    )),
) -> list[dict]:
    """Shared table map with live occupancy status."""
    result = await db.execute(
        select(TablesMap)
        .where(TablesMap.tenant_id == ctx.tenant_id)
        .order_by(TablesMap.table_number)
    )
    return [
        {
            "table_id": t.table_id,
            "table_number": t.table_number,
            "zone": t.zone,
            "capacity": t.capacity,
            "status": t.status,
            "position_x": t.position_x,
            "position_y": t.position_y,
        }
        for t in result.scalars().all()
    ]


@router.post("/tables", status_code=status.HTTP_201_CREATED)
async def add_shared_table(
    body: TableCreate,
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.food_court_admin)),
) -> dict:
    """Add a shared table owned by the food court parent."""
    table = TablesMap(
        tenant_id=ctx.tenant_id,
        table_number=body.table_number,
        zone=body.zone,
        capacity=body.capacity,
        position_x=body.position_x,
        position_y=body.position_y,
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    return {
        "table_id": table.table_id,
        "table_number": table.table_number,
        "zone": table.zone,
        "capacity": table.capacity,
        "status": table.status,
    }


@router.patch("/tables/{table_id}/status")
async def update_table_status(
    table_id: int,
    body: TableStatusUpdate,
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.food_court_admin, UserRole.server)),
) -> dict:
    """Update a shared table's occupancy status."""
    result = await db.execute(
        select(TablesMap).where(
            TablesMap.table_id == table_id,
            TablesMap.tenant_id == ctx.tenant_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")

    table.status = body.status
    await db.commit()
    return {"table_id": table_id, "status": table.status}


@router.get("/orders/active")
async def active_orders(
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.food_court_admin, UserRole.server)),
) -> list[dict]:
    """All active orders across every vendor on the shared floor (family scope)."""
    vendor_ids = await accessible_tenant_ids(ctx, db)
    vendor_ids.discard(ctx.tenant_id)

    if not vendor_ids:
        return []

    result = await db.execute(
        select(Order).where(
            Order.tenant_id.in_(vendor_ids),
            Order.status.in_(ACTIVE_STATUSES),
        ).order_by(Order.tenant_id, Order.time_slot)
    )
    return [
        {
            "order_id": str(o.order_id),
            "vendor_tenant_id": str(o.tenant_id),
            "table_id": o.table_id,
            "status": o.status,
            "total_amount": str(o.total_amount),
            "time_slot": o.time_slot.isoformat(),
        }
        for o in result.scalars().all()
    ]


@router.patch("/orders/{order_id}/deliver")
async def deliver_order(
    order_id: uuid.UUID,
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.server)),
) -> dict:
    """Server picks up a vendor's ready order and marks it delivered to the table."""
    vendor_ids = await accessible_tenant_ids(ctx, db)
    vendor_ids.discard(ctx.tenant_id)

    result = await db.execute(
        select(Order).where(
            Order.order_id == order_id,
            Order.tenant_id.in_(vendor_ids),
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != OrderStatus.ready:
        raise HTTPException(
            status_code=400,
            detail=f"Order must be 'ready' to deliver; current status: {order.status}",
        )

    order.status = OrderStatus.delivered
    await db.commit()
    return {"order_id": str(order_id), "status": order.status}


@router.get("/staff")
async def shared_staff(
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.food_court_admin)),
) -> list[dict]:
    """Shared staff (servers and cleaners) employed by the food court parent."""
    result = await db.execute(
        select(User).where(
            User.tenant_id == ctx.tenant_id,
            User.role.in_([UserRole.server, UserRole.cleaner]),
            User.is_active.is_(True),
        ).order_by(User.role, User.full_name)
    )
    return [
        {
            "user_id": str(s.user_id),
            "full_name": s.full_name,
            "email": s.email,
            "role": s.role,
        }
        for s in result.scalars().all()
    ]


@router.get("/analytics")
async def floor_analytics(
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.food_court_admin)),
) -> dict:
    """Floor analytics: table occupancy counts + per-vendor order throughput."""
    # Table occupancy by status
    occupancy_result = await db.execute(
        select(TablesMap.status, func.count().label("count"))
        .where(TablesMap.tenant_id == ctx.tenant_id)
        .group_by(TablesMap.status)
    )
    occupancy = {row.status: row.count for row in occupancy_result}

    # Per-vendor order throughput (all-time)
    vendor_ids = await accessible_tenant_ids(ctx, db)
    vendor_ids.discard(ctx.tenant_id)

    throughput: list[dict] = []
    if vendor_ids:
        vendor_result = await db.execute(
            select(
                Order.tenant_id,
                Tenant.name.label("vendor_name"),
                func.count(Order.order_id).label("total_orders"),
            )
            .join(Tenant, Order.tenant_id == Tenant.tenant_id)
            .where(Order.tenant_id.in_(vendor_ids))
            .group_by(Order.tenant_id, Tenant.name)
            .order_by(Tenant.name)
        )
        throughput = [
            {
                "vendor_id": str(row.tenant_id),
                "vendor_name": row.vendor_name,
                "total_orders": row.total_orders,
            }
            for row in vendor_result
        ]

    return {"table_occupancy": occupancy, "vendor_throughput": throughput}


@router.get("/settlements")
async def settlements(
    ctx: TenantContext = Depends(_require_food_court),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.food_court_admin)),
) -> list[dict]:
    """Per-vendor revenue settlement report (sum of delivered order totals)."""
    vendor_ids = await accessible_tenant_ids(ctx, db)
    vendor_ids.discard(ctx.tenant_id)

    if not vendor_ids:
        return []

    result = await db.execute(
        select(
            Order.tenant_id,
            Tenant.name.label("vendor_name"),
            func.sum(Order.total_amount).label("total_revenue"),
            func.count(Order.order_id).label("order_count"),
        )
        .join(Tenant, Order.tenant_id == Tenant.tenant_id)
        .where(
            Order.tenant_id.in_(vendor_ids),
            Order.status == OrderStatus.delivered,
        )
        .group_by(Order.tenant_id, Tenant.name)
        .order_by(Tenant.name)
    )
    return [
        {
            "vendor_id": str(row.tenant_id),
            "vendor_name": row.vendor_name,
            "total_revenue": str(row.total_revenue or 0),
            "delivered_order_count": row.order_count,
        }
        for row in result
    ]

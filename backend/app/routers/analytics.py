from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, distinct, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    TenantContext,
    get_tenant_context,
    require_role,
)
from app.models.inventory import InventoryItem
from app.models.models import CleanerLog, MenuItem, Order, OrderItem, TablesMap, User
from app.models.order import PaymentStatus
from app.models.table import TableStatus
from app.models.tenant import Tenant, TenantType
from app.models.user import UserRole

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _period_start(period: str):
    if period == "today":
        return func.date_trunc("day", func.now())
    if period == "week":
        return func.now() - text("INTERVAL '7 days'")
    return func.now() - text("INTERVAL '30 days'")


@router.get("/summary", response_model=dict)
async def get_summary(
    period: str = Query("today", regex="^(today|week|month)$"),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(*ADMIN_ROLES)),
):
    start = _period_start(period)

    result = await db.execute(
        select(
            func.count(Order.order_id).label("total_orders"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_revenue"),
            func.coalesce(func.avg(Order.total_amount), 0).label("avg_order_value"),
            func.count(distinct(Order.user_id)).label("total_customers_served"),
            func.count(case((Order.payment_status == PaymentStatus.pending, 1))).label("pending_orders"),
        )
        .select_from(Order)
        .where(Order.tenant_id == ctx.tenant_id, Order.created_at >= start)
    )
    row = result.one()

    active_tables = await db.execute(
        select(func.count(TablesMap.table_id)).where(
            TablesMap.tenant_id == ctx.tenant_id,
            TablesMap.status != TableStatus.available,
        )
    )
    cleaners_on_duty = await db.execute(
        select(func.count(User.user_id)).where(
            User.tenant_id == ctx.tenant_id,
            User.role == UserRole.cleaner,
            User.is_active.is_(True),
        )
    )

    return {
        "total_orders": int(row.total_orders or 0),
        "total_revenue": float(row.total_revenue or 0),
        "avg_order_value": float(row.avg_order_value or 0),
        "total_customers_served": int(row.total_customers_served or 0),
        "pending_orders": int(row.pending_orders or 0),
        "active_tables": int(active_tables.scalar() or 0),
        "cleaners_on_duty": int(cleaners_on_duty.scalar() or 0),
    }


@router.get("/orders-by-hour", response_model=list[dict])
async def get_orders_by_hour(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(*ADMIN_ROLES)),
):
    start = func.now() - text("INTERVAL '7 days'")
    hour_bucket = func.extract("hour", Order.created_at)

    result = await db.execute(
        select(hour_bucket.label("hour"), func.count(Order.order_id).label("order_count"))
        .where(Order.tenant_id == ctx.tenant_id, Order.created_at >= start)
        .group_by(hour_bucket)
        .order_by(hour_bucket)
    )
    return [{"hour": int(row.hour or 0), "order_count": int(row.order_count or 0)} for row in result.all()]


@router.get("/top-items", response_model=list[dict])
async def get_top_items(
    days: int = Query(7, ge=1, le=90),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(*ADMIN_ROLES)),
):
    start_date = func.now() - text(f"INTERVAL '{days} days'")

    result = await db.execute(
        select(
            MenuItem.name.label("item_name"),
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.coalesce(func.sum(OrderItem.subtotal), 0).label("total_revenue"),
        )
        .join(OrderItem, MenuItem.item_id == OrderItem.item_id)
        .join(Order, OrderItem.order_id == Order.order_id)
        .where(Order.tenant_id == ctx.tenant_id, Order.created_at >= start_date)
        .group_by(MenuItem.item_id, MenuItem.name)
        .order_by(func.sum(OrderItem.quantity).desc(), MenuItem.name.asc())
        .limit(10)
    )
    return [
        {
            "item_name": row.item_name,
            "total_quantity": int(row.total_quantity or 0),
            "total_revenue": float(row.total_revenue or 0),
        }
        for row in result.all()
    ]


@router.get("/revenue", response_model=list[dict])
async def get_revenue_trend(
    days: int = Query(30, ge=1, le=365),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(*ADMIN_ROLES)),
):
    start_date = func.now() - text(f"INTERVAL '{days} days'")
    day_bucket = func.date_trunc("day", Order.created_at)

    result = await db.execute(
        select(
            day_bucket.label("date"),
            func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
            func.count(Order.order_id).label("order_count"),
        )
        .where(Order.tenant_id == ctx.tenant_id, Order.created_at >= start_date)
        .group_by(day_bucket)
        .order_by(day_bucket)
    )
    return [
        {
            "date": (
                row.date.date().isoformat()
                if isinstance(row.date, datetime)
                else str(row.date.date()) if hasattr(row.date, "date") else str(row.date)
            ),
            "revenue": float(row.revenue or 0),
            "order_count": int(row.order_count or 0),
        }
        for row in result.all()
    ]


@router.get("/outlets", response_model=list[dict])
async def get_outlet_analytics(
    period: str = Query("month", regex="^(today|week|month)$"),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.super_admin)),
):
    """Brand-wide outlet performance comparison. Only accessible to super_admin of a franchise_brand."""
    start = _period_start(period)

    # Resolve all outlets under this brand
    outlets_result = await db.execute(
        select(Tenant).where(
            Tenant.parent_tenant_id == ctx.tenant_id,
            Tenant.tenant_type == TenantType.franchise_outlet,
        )
    )
    outlets = outlets_result.scalars().all()
    if not outlets:
        return []

    outlet_ids = [o.tenant_id for o in outlets]
    outlet_map = {o.tenant_id: o.name for o in outlets}

    # Revenue + order count per outlet
    rev_result = await db.execute(
        select(
            Order.tenant_id.label("outlet_tenant_id"),
            func.count(Order.order_id).label("order_count"),
            func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
            func.count(distinct(Order.user_id)).label("unique_customers"),
        )
        .where(
            Order.tenant_id.in_(outlet_ids),
            Order.created_at >= start,
        )
        .group_by(Order.tenant_id)
    )
    rev_by_outlet = {row.outlet_tenant_id: row for row in rev_result.all()}

    return [
        {
            "outlet_tenant_id": str(outlet_id),
            "outlet_name": outlet_map[outlet_id],
            "order_count": int(rev_by_outlet[outlet_id].order_count) if outlet_id in rev_by_outlet else 0,
            "revenue": float(rev_by_outlet[outlet_id].revenue) if outlet_id in rev_by_outlet else 0.0,
            "unique_customers": int(rev_by_outlet[outlet_id].unique_customers) if outlet_id in rev_by_outlet else 0,
        }
        for outlet_id in outlet_ids
    ]


@router.get("/inventory-value", response_model=dict)
async def get_inventory_value(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(*ADMIN_ROLES)),
):
    """Total inventory value for the caller's tenant.
    For franchise_brand (super_admin): also breaks down per outlet.
    """
    # Value for caller's own tenant
    own_value_result = await db.execute(
        select(
            func.coalesce(
                func.sum(InventoryItem.quantity_on_hand * InventoryItem.unit_cost), 0
            ).label("total_value"),
            func.count(InventoryItem.item_id).label("item_count"),
        ).where(InventoryItem.tenant_id == ctx.tenant_id)
    )
    own_row = own_value_result.one()
    response: dict = {
        "tenant_id": str(ctx.tenant_id),
        "total_inventory_value": float(own_row.total_value or 0),
        "item_count": int(own_row.item_count or 0),
        "outlets": None,
    }

    # Franchise brand: include per-outlet breakdown
    if ctx.tenant_type == TenantType.franchise_brand:
        outlets_result = await db.execute(
            select(Tenant).where(
                Tenant.parent_tenant_id == ctx.tenant_id,
                Tenant.tenant_type == TenantType.franchise_outlet,
            )
        )
        outlets = outlets_result.scalars().all()
        outlet_ids = [o.tenant_id for o in outlets]
        outlet_map = {o.tenant_id: o.name for o in outlets}

        outlet_values_result = await db.execute(
            select(
                InventoryItem.tenant_id.label("outlet_tenant_id"),
                func.coalesce(
                    func.sum(InventoryItem.quantity_on_hand * InventoryItem.unit_cost), 0
                ).label("total_value"),
                func.count(InventoryItem.item_id).label("item_count"),
            )
            .where(InventoryItem.tenant_id.in_(outlet_ids))
            .group_by(InventoryItem.tenant_id)
        )
        outlet_values = {row.outlet_tenant_id: row for row in outlet_values_result.all()}

        response["outlets"] = [
            {
                "outlet_tenant_id": str(outlet_id),
                "outlet_name": outlet_map[outlet_id],
                "total_inventory_value": float(outlet_values[outlet_id].total_value) if outlet_id in outlet_values else 0.0,
                "item_count": int(outlet_values[outlet_id].item_count) if outlet_id in outlet_values else 0,
            }
            for outlet_id in outlet_ids
        ]

    return response


@router.get("/table-usage", response_model=list[dict])
async def get_table_usage(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(*ADMIN_ROLES)),
):
    today = func.date_trunc("day", func.now())

    result = await db.execute(
        select(
            TablesMap.table_number,
            TablesMap.zone,
            TablesMap.status,
            func.count(distinct(Order.order_id)).filter(Order.created_at >= today).label("times_used_today"),
            func.count(distinct(CleanerLog.log_id)).filter(CleanerLog.cleaned_at >= today).label("times_cleaned_today"),
        )
        .where(TablesMap.tenant_id == ctx.tenant_id)
        .outerjoin(Order, Order.table_id == TablesMap.table_id)
        .outerjoin(CleanerLog, CleanerLog.table_id == TablesMap.table_id)
        .group_by(TablesMap.table_id, TablesMap.table_number, TablesMap.zone, TablesMap.status)
        .order_by(TablesMap.table_number.asc())
    )
    return [
        {
            "table_number": row.table_number,
            "zone": row.zone,
            "times_used_today": int(row.times_used_today or 0),
            "times_cleaned_today": int(row.times_cleaned_today or 0),
            "current_status": getattr(row.status, "value", row.status),
        }
        for row in result.all()
    ]

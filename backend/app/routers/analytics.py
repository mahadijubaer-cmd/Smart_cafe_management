from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, distinct, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import CleanerLog, MenuItem, Order, OrderItem, TablesMap, User, UserRole
from app.models.order import PaymentStatus
from app.models.table import TableStatus

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get sales summary for specified period"""
    start = _period_start(period)

    result = await db.execute(
        select(
            func.count(Order.order_id).label("total_orders"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_revenue"),
            func.coalesce(func.avg(Order.total_amount), 0).label("avg_order_value"),
            func.count(distinct(Order.user_id)).label("total_students_served"),
            func.count(case((Order.payment_status == PaymentStatus.pending, 1))).label("pending_orders"),
        )
        .select_from(Order)
        .where(Order.created_at >= start)
    )

    row = result.one()

    active_tables_result = await db.execute(
        select(func.count(TablesMap.table_id)).where(TablesMap.status != TableStatus.available)
    )
    cleaners_on_duty_result = await db.execute(
        select(func.count(User.user_id)).where(
            User.role == UserRole.cleaner,
            User.is_active.is_(True),
        )
    )

    return {
        "total_orders": int(row.total_orders or 0),
        "total_revenue": float(row.total_revenue or 0),
        "avg_order_value": float(row.avg_order_value or 0),
        "total_students_served": int(row.total_students_served or 0),
        "pending_orders": int(row.pending_orders or 0),
        "active_tables": int(active_tables_result.scalar() or 0),
        "cleaners_on_duty": int(cleaners_on_duty_result.scalar() or 0),
    }


@router.get("/orders-by-hour", response_model=list[dict])
async def get_orders_by_hour(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get order counts grouped by hour for the last 7 days"""
    start = func.now() - text("INTERVAL '7 days'")
    hour_bucket = func.extract("hour", Order.created_at)

    result = await db.execute(
        select(
            hour_bucket.label("hour"),
            func.count(Order.order_id).label("order_count"),
        )
        .where(Order.created_at >= start)
        .group_by(hour_bucket)
        .order_by(hour_bucket)
    )

    return [
        {
            "hour": int(row.hour or 0),
            "order_count": int(row.order_count or 0),
        }
        for row in result.all()
    ]


@router.get("/top-items", response_model=list[dict])
async def get_top_items(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get top selling menu items"""
    start_date = func.now() - text(f"INTERVAL '{days} days'")
    
    result = await db.execute(
        select(
            MenuItem.name.label("item_name"),
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.coalesce(func.sum(OrderItem.subtotal), 0).label("total_revenue")
        )
        .join(OrderItem, MenuItem.item_id == OrderItem.item_id)
        .join(Order, OrderItem.order_id == Order.order_id)
        .where(Order.created_at >= start_date)
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get daily revenue for the last N days"""
    start_date = func.now() - text(f"INTERVAL '{days} days'")
    day_bucket = func.date_trunc("day", Order.created_at)

    result = await db.execute(
        select(
            day_bucket.label("date"),
            func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
            func.count(Order.order_id).label("order_count"),
        )
        .where(Order.created_at >= start_date)
        .group_by(day_bucket)
        .order_by(day_bucket)
    )

    return [
        {
            "date": row.date.date().isoformat() if isinstance(row.date, datetime) else str(row.date.date()) if hasattr(row.date, "date") else str(row.date),
            "revenue": float(row.revenue or 0),
            "order_count": int(row.order_count or 0),
        }
        for row in result.all()
    ]


@router.get("/table-usage", response_model=list[dict])
async def get_table_usage(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get table usage statistics"""
    today = func.date_trunc("day", func.now())

    result = await db.execute(
        select(
            TablesMap.table_number,
            TablesMap.zone,
            TablesMap.status,
            func.count(distinct(Order.order_id)).filter(Order.created_at >= today).label("times_used_today"),
            func.count(distinct(CleanerLog.log_id)).filter(CleanerLog.cleaned_at >= today).label("times_cleaned_today"),
        )
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

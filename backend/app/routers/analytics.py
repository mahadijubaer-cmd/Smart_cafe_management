from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.models import User, UserRole, Order, MenuItem, OrderItem, CleanerLog, TablesMap
from app.core.dependencies import require_role
from datetime import datetime, timedelta

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=dict)
async def get_summary(
    period: str = Query("today", regex="^(today|week|month)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get sales summary for specified period"""
    from sqlalchemy import and_
    
    # Determine date range
    now = datetime.utcnow()
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=7)
    else:  # month
        start = now - timedelta(days=30)
    
    # Count orders
    orders_result = await db.execute(
        select(func.count(Order.order_id)).where(Order.created_at >= start)
    )
    total_orders = orders_result.scalar() or 0
    
    # Sum revenue
    revenue_result = await db.execute(
        select(func.sum(Order.total_amount)).where(Order.created_at >= start)
    )
    total_revenue = float(revenue_result.scalar() or 0)
    
    avg_order_value = total_revenue / total_orders if total_orders > 0 else 0
    
    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "avg_order_value": avg_order_value,
        "period": period
    }


@router.get("/orders-by-hour", response_model=list[dict])
async def get_orders_by_hour(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get order counts grouped by hour"""
    # This is a simplified version - full implementation would use database-specific date functions
    result = await db.execute(select(Order).order_by(Order.created_at))
    orders = result.scalars().all()
    
    hourly = {}
    for order in orders:
        hour = order.created_at.hour
        hourly[hour] = hourly.get(hour, 0) + 1
    
    return [{"hour": h, "order_count": c} for h, c in sorted(hourly.items())]


@router.get("/top-items", response_model=list[dict])
async def get_top_items(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get top selling menu items"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    result = await db.execute(
        select(
            MenuItem.name,
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.subtotal).label("total_revenue")
        )
        .join(OrderItem, MenuItem.item_id == OrderItem.item_id)
        .join(Order, OrderItem.order_id == Order.order_id)
        .where(Order.created_at >= start_date)
        .group_by(MenuItem.item_id, MenuItem.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(10)
    )
    
    items = result.all()
    return [
        {
            "item_name": item[0],
            "total_quantity": int(item[1] or 0),
            "total_revenue": float(item[2] or 0)
        }
        for item in items
    ]


@router.get("/revenue", response_model=list[dict])
async def get_revenue_trend(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get daily revenue for the last N days"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    result = await db.execute(select(Order).where(Order.created_at >= start_date).order_by(Order.created_at))
    orders = result.scalars().all()
    
    daily = {}
    for order in orders:
        date = order.created_at.date()
        if date not in daily:
            daily[date] = {"revenue": 0, "count": 0}
        daily[date]["revenue"] += float(order.total_amount)
        daily[date]["count"] += 1
    
    return [
        {
            "date": str(date),
            "revenue": data["revenue"],
            "order_count": data["count"]
        }
        for date, data in sorted(daily.items())
    ]


@router.get("/table-usage", response_model=list[dict])
async def get_table_usage(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Get table usage statistics"""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    result = await db.execute(select(TablesMap))
    tables = result.scalars().all()
    
    table_data = []
    for table in tables:
        # Count usage today
        usage_result = await db.execute(
            select(func.count(Order.order_id)).where(
                Order.table_id == table.table_id,
                Order.created_at >= today
            )
        )
        times_used = usage_result.scalar() or 0
        
        table_data.append({
            "table_number": table.table_number,
            "zone": table.zone,
            "times_used_today": times_used,
            "current_status": table.status
        })
    
    return table_data

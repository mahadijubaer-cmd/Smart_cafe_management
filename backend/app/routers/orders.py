from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import User, Order, OrderItem, UserRole, TablesMap
from app.schemas.order import OrderCreate, OrderResponse, OrderUpdateStatus
from app.services.order_service import OrderService
from app.core.dependencies import require_role
from app.services.websocket_manager import manager

router = APIRouter(prefix="/orders", tags=["orders"])
order_service = OrderService()


@router.post("/", response_model=OrderResponse, status_code=201)
async def place_order(
    order_data: OrderCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Place a new order"""
    order = await order_service.create_order(db, current_user.user_id, order_data)

    table_number = None
    if order.table_id:
        table_result = await db.execute(select(TablesMap).where(TablesMap.table_id == order.table_id))
        table = table_result.scalar_one_or_none()
        table_number = table.table_number if table else None

    order_items = getattr(order, "items", [])
    await manager.broadcast_to_role(
        "staff",
        {
            "type": "ORDER_PLACED",
            "order_id": str(order.order_id),
            "table_number": table_number,
            "items": [
                {
                    "item_id": str(item.item_id),
                    "quantity": item.quantity,
                    "unit_price": str(item.unit_price),
                    "subtotal": str(item.subtotal),
                }
                for item in order_items
            ],
        },
    )
    return order


@router.get("/", response_model=list[OrderResponse])
async def get_orders(
    status: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student, UserRole.admin, UserRole.staff))
):
    """Get orders (students get own, admin/staff get all)"""
    query = select(Order).options(selectinload(Order.items))
    
    if current_user.role == UserRole.student:
        query = query.where(Order.user_id == current_user.user_id)
    
    if status:
        query = query.where(Order.status == status)
    
    result = await db.execute(query.order_by(Order.created_at.desc()))
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student, UserRole.admin, UserRole.staff))
):
    """Get order details"""
    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.order_id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check authorization
    if current_user.role == UserRole.student and order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return order


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: str,
    status_data: OrderUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.staff, UserRole.admin))
):
    """Update order status (Staff/Admin only)"""
    order = await order_service.update_status(db, order_id, status_data.status, current_user.role)

    if getattr(order.status, "value", order.status) == "confirmed":
        await manager.send_personal(
            str(order.user_id),
            {
                "type": "ORDER_CONFIRMED",
                "order_id": str(order.order_id),
                "status": "confirmed",
            },
        )
    elif getattr(order.status, "value", order.status) == "ready":
        await manager.send_personal(
            str(order.user_id),
            {
                "type": "ORDER_READY",
                "order_id": str(order.order_id),
                "status": "ready",
            },
        )

    return order


@router.patch("/{order_id}/complete", status_code=202)
async def complete_meal(
    order_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Mark meal as completed and trigger cleaner assignment"""
    result = await db.execute(select(Order).where(Order.order_id == order_id))
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    background_tasks.add_task(order_service.complete_meal, db, order_id, current_user.user_id)
    return {"status": "processing"}


@router.delete("/{order_id}", status_code=204)
async def cancel_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Cancel order (only if pending)"""
    result = await db.execute(select(Order).where(Order.order_id == order_id))
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    current_status = getattr(order.status, "value", order.status)
    if current_status != "pending":
        raise HTTPException(status_code=400, detail="Can only cancel pending orders")
    
    order.status = "cancelled"
    await db.commit()

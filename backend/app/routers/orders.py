from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    CUSTOMER_ROLES,
    WORK_ROLES,
    TenantContext,
    get_tenant_context,
    require_role,
)
from app.models.models import Order, TablesMap, User, UserRole
from app.schemas.order import OrderCreate, OrderResponse, OrderUpdateStatus
from app.services.order_service import OrderService
from app.services.qr_service import email_qr_attachment, generate_and_save_order_qr
from app.services.ws_pubsub import publish_event

router = APIRouter(prefix="/orders", tags=["orders"])
order_service = OrderService()


@router.post("/", response_model=OrderResponse, status_code=201)
async def place_order(
    order_data: OrderCreate,
    background_tasks: BackgroundTasks,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    order = await order_service.create_order(db, current_user.user_id, order_data, ctx.tenant_id)

    table_number = None
    if order.table_id:
        table_result = await db.execute(
            select(TablesMap).where(
                TablesMap.table_id == order.table_id,
                TablesMap.tenant_id == ctx.tenant_id,
            )
        )
        table = table_result.scalar_one_or_none()
        table_number = table.table_number if table else None

    await publish_event(
        ctx.tenant_id,
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
                for item in (getattr(order, "items", []) or [])
            ],
        },
        outlet_id=ctx.outlet_id,
    )
    return order


@router.get("/", response_model=list[OrderResponse])
async def get_orders(
    status: str = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES, *WORK_ROLES)),
):
    query = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.tenant_id == ctx.tenant_id)
    )
    if current_user.role in CUSTOMER_ROLES:
        query = query.where(Order.user_id == current_user.user_id)
    if status:
        query = query.where(Order.status == status)
    result = await db.execute(query.order_by(Order.created_at.desc()))
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES, *WORK_ROLES)),
):
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.order_id == order_id, Order.tenant_id == ctx.tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.role in CUSTOMER_ROLES and order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return order


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: str,
    status_data: OrderUpdateStatus,
    background_tasks: BackgroundTasks,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*WORK_ROLES)),
):
    order = await order_service.update_status(db, order_id, status_data.status, ctx.tenant_id)

    status_val = getattr(order.status, "value", order.status)
    event_type = {
        "confirmed": "ORDER_CONFIRMED",
        "preparing": "ORDER_PREPARING",
        "ready": "ORDER_READY",
        "delivered": "ORDER_DELIVERED",
    }.get(status_val)

    if event_type:
        await publish_event(
            ctx.tenant_id,
            {
                "type": event_type,
                "order_id": str(order.order_id),
                "status": status_val,
                "target_user_id": str(order.user_id),
            },
            outlet_id=ctx.outlet_id,
        )

    if status_val == "confirmed":
        # Load user email for QR attachment
        user_result = await db.execute(
            select(User).where(User.user_id == order.user_id)
        )
        order_user = user_result.scalar_one_or_none()
        user_email = order_user.email if order_user else None

        background_tasks.add_task(
            _qr_generate_and_email,
            order.order_id,
            ctx.tenant_id,
            order_user.full_name if order_user else "Customer",
            str(order.total_amount),
            user_email,
        )

    return order


async def _qr_generate_and_email(
    order_id,
    tenant_id,
    user_name: str,
    total: str,
    user_email: str | None,
) -> None:
    """Background task: generate QR, save to disk, record in DB, email attachment."""
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            file_path = await generate_and_save_order_qr(
                db=db,
                order_id=order_id,
                tenant_id=tenant_id,
                user_name=user_name,
                total=total,
            )
            if user_email:
                await email_qr_attachment(user_email, order_id, file_path)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("QR background task failed for order %s", order_id)


@router.patch("/{order_id}/complete", status_code=202)
async def complete_meal(
    order_id: str,
    background_tasks: BackgroundTasks,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    result = await db.execute(
        select(Order).where(Order.order_id == order_id, Order.tenant_id == ctx.tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    background_tasks.add_task(
        order_service.complete_meal, db, order_id, current_user.user_id, ctx.tenant_id
    )
    return {"status": "processing"}


@router.delete("/{order_id}")
async def cancel_order(
    order_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    result = await db.execute(
        select(Order).where(Order.order_id == order_id, Order.tenant_id == ctx.tenant_id)
    )
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

    await publish_event(
        ctx.tenant_id,
        {
            "type": "ORDER_CANCELLED",
            "order_id": str(order.order_id),
            "target_user_id": str(order.user_id),
        },
        outlet_id=ctx.outlet_id,
    )
    return {"status": "cancelled", "order_id": str(order.order_id)}

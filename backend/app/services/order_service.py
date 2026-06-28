from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.menu import MenuItem
from app.models.models import Notification, RewardLog, User
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.models.table import TablesMap, TableStatus
from app.schemas.order import OrderCreate
from app.services.cleaner_service import CleanerService
from app.services import inventory_service


class OrderService:
    async def create_order(
        self,
        db: AsyncSession,
        user_id: UUID,
        order_data: OrderCreate,
        tenant_id: UUID,
    ) -> Order:
        result = await db.execute(
            select(User).where(User.user_id == user_id, User.tenant_id == tenant_id)
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        items_data = []
        total_amount = Decimal("0.00")

        for item_req in order_data.items:
            result = await db.execute(
                select(MenuItem).where(
                    MenuItem.item_id == item_req.item_id,
                    MenuItem.tenant_id == tenant_id,
                )
            )
            item = result.scalar_one_or_none()
            if not item:
                raise HTTPException(status_code=404, detail=f"Item {item_req.item_id} not found")
            if not item.is_available:
                raise HTTPException(status_code=400, detail=f"Item {item.name} is not available")

            unit_price = Decimal(str(item.price))
            subtotal = unit_price * item_req.quantity
            total_amount += subtotal
            items_data.append({
                "item": item,
                "quantity": item_req.quantity,
                "unit_price": unit_price,
            })

        discount = Decimal("0.00")
        if order_data.redeem_points:
            if user.reward_points < 100:
                raise HTTPException(status_code=400, detail="Not enough reward points to redeem")
            discount = Decimal("10.00")
            user.reward_points -= 100

        order = Order(
            tenant_id=tenant_id,
            user_id=user_id,
            table_id=order_data.table_id,
            time_slot=order_data.time_slot,
            status=OrderStatus.pending,
            total_amount=total_amount,
            discount_amount=discount,
            payment_status=PaymentStatus.pending,
            payment_method=None,
            special_notes=order_data.special_notes,
        )
        db.add(order)
        await db.flush()

        for item_data in items_data:
            order_item = OrderItem(
                tenant_id=tenant_id,
                order_id=order.order_id,
                item_id=item_data["item"].item_id,
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
            )
            db.add(order_item)

        if order_data.table_id:
            result = await db.execute(
                select(TablesMap).where(
                    TablesMap.table_id == order_data.table_id,
                    TablesMap.tenant_id == tenant_id,
                )
            )
            table = result.scalar_one_or_none()
            if not table:
                raise HTTPException(status_code=404, detail="Table not found")
            table.status = TableStatus.occupied

        db.add(Notification(
            tenant_id=tenant_id,
            user_id=user_id,
            type="ORDER_PLACED",
            message=f"Your order #{str(order.order_id)[:8]} has been placed",
        ))

        await db.commit()
        await db.refresh(user)

        # Deduct inventory for all order items that have recipes (non-blocking)
        try:
            await inventory_service.consume_inventory_for_order(db, order, tenant_id)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "Inventory deduction failed for order %s — order still placed", order.order_id
            )

        loaded = await db.execute(
            select(Order).options(selectinload(Order.items)).where(Order.order_id == order.order_id)
        )
        return loaded.scalar_one()

    async def update_status(
        self,
        db: AsyncSession,
        order_id: str,
        new_status: str,
        tenant_id: UUID,
    ) -> Order:
        valid_transitions = {
            "pending": ["confirmed"],
            "confirmed": ["preparing"],
            "preparing": ["ready"],
            "ready": ["delivered"],
            "cancelled": [],
        }

        result = await db.execute(
            select(Order).where(Order.order_id == order_id, Order.tenant_id == tenant_id)
        )
        order = result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        current_status = getattr(order.status, "value", order.status)
        if new_status not in valid_transitions.get(current_status, []):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from {current_status} to {new_status}",
            )

        order.status = new_status
        order.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(order)
        return order

    async def complete_meal(
        self,
        db: AsyncSession,
        order_id: str,
        user_id: UUID,
        tenant_id: UUID,
    ) -> Order:
        result = await db.execute(
            select(Order).where(Order.order_id == order_id, Order.tenant_id == tenant_id)
        )
        order = result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        current_status = getattr(order.status, "value", order.status)
        if current_status != "delivered":
            raise HTTPException(status_code=400, detail="Order must be delivered before completion")

        if order.table_id:
            await CleanerService().assign_cleaner(db, order.table_id, order_id, tenant_id)

        points = int(Decimal(str(order.total_amount)) // Decimal("10"))
        result = await db.execute(
            select(User).where(User.user_id == user_id, User.tenant_id == tenant_id)
        )
        user = result.scalar_one_or_none()
        if user and points > 0:
            user.reward_points += points

        db.add(RewardLog(
            tenant_id=tenant_id,
            user_id=user_id,
            order_id=order_id,
            points_earned=points,
            points_redeemed=0,
            description=f"Reward points for completing order #{str(order.order_id)[:8]}",
        ))
        await db.commit()
        if user:
            await db.refresh(user)
        await db.refresh(order)
        return order

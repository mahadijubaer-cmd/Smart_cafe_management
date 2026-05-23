from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.menu import MenuItem
from app.models.models import Notification, RewardLog, User
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus, PaymentMethod
from app.models.table import TablesMap, TableStatus
from app.schemas.order import OrderCreate
from app.services.cleaner_service import CleanerService


class OrderService:
    async def create_order(self, db: AsyncSession, user_id, order_data: OrderCreate) -> Order:
        """Create a new order with items"""
        result = await db.execute(select(User).where(User.user_id == user_id))
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        items_data = []
        total_amount = Decimal("0.00")

        for item_req in order_data.items:
            result = await db.execute(select(MenuItem).where(MenuItem.item_id == item_req.item_id))
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
                "subtotal": subtotal
            })
        
        discount = Decimal("0.00")
        if order_data.redeem_points:
            if user.reward_points < 100:
                raise HTTPException(status_code=400, detail="Not enough reward points to redeem")

            discount = Decimal("10.00")
            user.reward_points -= 100
        
        order = Order(
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
                order_id=order.order_id,
                item_id=item_data["item"].item_id,
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
            )
            db.add(order_item)
        
        if order_data.table_id:
            result = await db.execute(select(TablesMap).where(TablesMap.table_id == order_data.table_id))
            table = result.scalar_one_or_none()
            if not table:
                raise HTTPException(status_code=404, detail="Table not found")

            table.status = TableStatus.occupied
        
        notification = Notification(
            user_id=user_id,
            type="ORDER_PLACED",
            message=f"Your order #{str(order.order_id)[:8]} has been placed"
        )
        db.add(notification)
        
        await db.commit()
        await db.refresh(user)

        loaded_order = await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.order_id == order.order_id)
        )

        return loaded_order.scalar_one()
    
    async def update_status(self, db: AsyncSession, order_id: str, new_status: str, actor_role) -> Order:
        """Update order status with validation"""
        allowed_roles = {"admin", "staff"}
        actor_value = getattr(actor_role, "value", actor_role)
        if actor_value not in allowed_roles:
            raise HTTPException(status_code=403, detail="Not enough permissions")

        valid_transitions = {
            "pending": ["confirmed"],
            "confirmed": ["preparing"],
            "preparing": ["ready"],
            "ready": ["delivered"],
            "cancelled": []
        }
        
        result = await db.execute(select(Order).where(Order.order_id == order_id))
        order = result.scalar_one_or_none()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        current_status = getattr(order.status, "value", order.status)
        
        if new_status not in valid_transitions.get(current_status, []):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from {current_status} to {new_status}"
            )
        
        order.status = new_status
        order.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(order)
        
        return order
    
    async def complete_meal(self, db: AsyncSession, order_id: str, user_id) -> Order:
        """Complete a meal and trigger cleaner assignment"""
        result = await db.execute(select(Order).where(Order.order_id == order_id))
        order = result.scalar_one_or_none()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        current_status = getattr(order.status, "value", order.status)
        if current_status != "delivered":
            raise HTTPException(status_code=400, detail="Order must be delivered before completion")
        
        cleaner_service = CleanerService()
        if order.table_id:
            await cleaner_service.assign_cleaner(db, order.table_id, order_id)
        
        points = int(Decimal(str(order.total_amount)) // Decimal("10"))
        result = await db.execute(select(User).where(User.user_id == user_id))
        user = result.scalar_one_or_none()

        if user and points > 0:
            user.reward_points += points

        reward_log = RewardLog(
            user_id=user_id,
            order_id=order_id,
            points_earned=points,
            points_redeemed=0,
            description=f"Reward points for completing order #{str(order.order_id)[:8]}"
        )
        db.add(reward_log)
        await db.commit()

        if user:
            await db.refresh(user)

        await db.refresh(order)
        
        return order

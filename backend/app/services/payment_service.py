from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Order, User, Payment
from decimal import Decimal
from fastapi import HTTPException
from datetime import datetime
import uuid
import logging

logger = logging.getLogger(__name__)


class PaymentService:
    async def pay_order(self, db: AsyncSession, order_id: str, user_id, method: str) -> Payment:
        """Process payment for an order"""
        
        result = await db.execute(select(Order).where(Order.order_id == order_id))
        order = result.scalar()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        if order.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        if order.payment_status != "pending":
            raise HTTPException(status_code=400, detail="Order already paid")
        
        net_amount = order.total_amount - order.discount_amount
        
        if method == "wallet":
            # Verify wallet balance
            user_result = await db.execute(select(User).where(User.user_id == user_id))
            user = user_result.scalar()
            
            if not user or user.wallet_balance < net_amount:
                raise HTTPException(status_code=400, detail="Insufficient wallet balance")
            
            # Deduct from wallet
            user.wallet_balance -= net_amount
        
        # Create payment
        payment = Payment(
            order_id=order_id,
            user_id=user_id,
            amount=net_amount,
            method=method,
            status="success",
            transaction_ref=str(uuid.uuid4())
        )
        
        order.payment_status = "paid"
        
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        
        return payment
    
    async def topup(self, db: AsyncSession, user_id, amount: Decimal) -> User:
        """Add funds to user wallet"""
        
        if amount <= 0 or amount > 10000:
            raise HTTPException(status_code=400, detail="Invalid amount")
        
        result = await db.execute(select(User).where(User.user_id == user_id))
        user = result.scalar()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user.wallet_balance += amount
        await db.commit()
        await db.refresh(user)
        
        return user
    
    async def earn_reward_points(self, db: AsyncSession, user_id, order_id: str) -> None:
        """Award reward points for completed order"""
        
        result = await db.execute(select(Order).where(Order.order_id == order_id))
        order = result.scalar()
        
        if not order:
            return
        
        points = int(order.total_amount // 10)
        
        if points > 0:
            user_result = await db.execute(select(User).where(User.user_id == user_id))
            user = user_result.scalar()
            
            if user:
                user.reward_points += points
                await db.commit()
                logger.info(f"Awarded {points} points to user {user_id}")

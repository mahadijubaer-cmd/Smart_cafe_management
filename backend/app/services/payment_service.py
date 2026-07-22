from decimal import Decimal
import logging
import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Order, Payment, RewardLog, User
from app.models.order import PaymentMethod, PaymentStatus
from app.models.wallet_transaction import WalletTransaction

logger = logging.getLogger(__name__)


class PaymentService:
    async def pay_order(
        self,
        db: AsyncSession,
        order_id: str,
        user_id: UUID,
        method: str,
        tenant_id: UUID,
    ) -> Payment:
        try:
            result = await db.execute(
                select(Order)
                .where(Order.order_id == order_id, Order.tenant_id == tenant_id)
                .with_for_update()
            )
            order = result.scalar_one_or_none()
            if not order:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
            if order.user_id != user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

            current_status = getattr(order.payment_status, "value", order.payment_status)
            if current_status != PaymentStatus.pending.value:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order already paid")

            net_amount = Decimal(str(order.total_amount)) - Decimal(str(order.discount_amount))
            try:
                payment_method = PaymentMethod(method)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid payment method",
                ) from exc

            if payment_method == PaymentMethod.wallet:
                user_result = await db.execute(
                    select(User)
                    .where(User.user_id == user_id, User.tenant_id == tenant_id)
                    .with_for_update()
                )
                user = user_result.scalar_one_or_none()
                if user is None or Decimal(str(user.wallet_balance)) < net_amount:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Insufficient wallet balance",
                    )
                user.wallet_balance = Decimal(str(user.wallet_balance)) - net_amount
                db.add(WalletTransaction(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    amount=-net_amount,
                    description="Order payment",
                    reference_id=order.order_id,
                ))

            payment = Payment(
                tenant_id=tenant_id,
                order_id=order_id,
                user_id=user_id,
                amount=net_amount,
                method=payment_method,
                status="success",
                transaction_ref=str(uuid.uuid4()),
            )
            payment.order = order
            order.payment_status = PaymentStatus.paid
            order.payment_method = payment_method
            db.add(payment)
            await db.commit()
        except Exception:
            await db.rollback()
            raise

        await db.refresh(payment)
        return payment

    async def topup(
        self,
        db: AsyncSession,
        user_id: UUID,
        amount: Decimal,
        tenant_id: UUID,
    ) -> User:
        if amount <= 0 or amount > 10000:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid amount")
        try:
            result = await db.execute(
                select(User)
                .where(User.user_id == user_id, User.tenant_id == tenant_id)
                .with_for_update()
            )
            user = result.scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            user.wallet_balance = Decimal(str(user.wallet_balance)) + amount
            db.add(WalletTransaction(
                tenant_id=tenant_id,
                user_id=user_id,
                amount=amount,
                description="Wallet top-up (simulation)",
            ))
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await db.refresh(user)
        return user

    async def earn_reward_points(
        self,
        db: AsyncSession,
        user_id: UUID,
        order_id: str,
        total_amount: Decimal,
        tenant_id: UUID,
    ) -> None:
        points = int(Decimal(str(total_amount)) // Decimal("10"))
        try:
            user_result = await db.execute(
                select(User)
                .where(User.user_id == user_id, User.tenant_id == tenant_id)
                .with_for_update()
            )
            user = user_result.scalar_one_or_none()
            if user is None:
                return
            user.reward_points += points
            db.add(RewardLog(
                tenant_id=tenant_id,
                user_id=user_id,
                order_id=order_id,
                points_earned=points,
                points_redeemed=0,
                description="Earned from order",
            ))
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        logger.info("Awarded %s points to user %s", points, user_id)

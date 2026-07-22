from decimal import Decimal
import logging
import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Order, Payment, RewardLog, User
from app.models.order import OrderStatus, PaymentMethod, PaymentStatus
from app.models.payment_gateway import GatewayTransaction
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

    async def complete_gateway_order_payment(
        self, db: AsyncSession, gtx: GatewayTransaction
    ) -> Payment | None:
        """Called after a gateway_transactions row has already been marked 'success' (RFC-011
        Stage 2) — creates the matching `payments` row and flips the order paid, same shape as
        pay_order's synchronous wallet/simulation path, so GET /payments/history needs no changes.
        Caller (payments.py's settlement helpers) already holds a row lock on `gtx` and has already
        verified the gateway's own validation API confirmed the exact amount (PAY-7/PAY-8) — this
        method does not re-verify, it only records the outcome.
        """
        result = await db.execute(
            select(Order).where(Order.order_id == gtx.order_id).with_for_update()
        )
        order = result.scalar_one_or_none()
        if not order or order.payment_status != PaymentStatus.pending:
            return None  # already settled by a concurrent path, or the order vanished

        payment_method = PaymentMethod(gtx.gateway_type.value)
        payment = Payment(
            tenant_id=gtx.tenant_id,
            order_id=gtx.order_id,
            user_id=gtx.user_id,
            amount=gtx.amount,
            method=payment_method,
            status="success",
            transaction_ref=gtx.gateway_external_ref or str(gtx.gateway_transaction_id),
        )
        order.payment_status = PaymentStatus.paid
        order.payment_method = payment_method
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        return payment

    async def complete_gateway_guest_session_payment(
        self, db: AsyncSession, gtx: GatewayTransaction
    ) -> list[Order]:
        """RFC-011 Stage 3 / PAY-13 — guest-session counterpart to
        complete_gateway_order_payment above. Marks every payable sibling order in the
        guest session paid directly, no `payments` row — mirrors the existing simulated
        guest-payment precedent (order_service.pay_guest_order_online, WAL-5), which
        also never creates a `payments` row for guest orders. Caller already holds the
        gtx row lock and has already verified the gateway's own validation API (PAY-7).
        """
        result = await db.execute(
            select(Order).where(Order.guest_token == gtx.guest_token).with_for_update()
        )
        orders = list(result.scalars().all())
        payment_method = PaymentMethod(gtx.gateway_type.value)
        for order in orders:
            if (
                order.status != OrderStatus.cancelled
                and order.payment_status != PaymentStatus.paid
            ):
                order.payment_status = PaymentStatus.paid
                order.payment_method = payment_method
        await db.commit()
        return orders

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

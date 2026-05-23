from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.database import AsyncSessionLocal
from app.models.models import User, UserRole, Order, Payment
from app.schemas.payment import PaymentCreate, PaymentResponse, PaymentHistoryResponse, TopupRequest
from app.services.payment_service import PaymentService
from app.core.dependencies import require_role

router = APIRouter(prefix="/payments", tags=["payments"])
payment_service = PaymentService()


async def award_reward_points_background(user_id, order_id, total_amount):
    async with AsyncSessionLocal() as background_db:
        await payment_service.earn_reward_points(background_db, user_id, order_id, total_amount)


@router.post("/pay", response_model=PaymentResponse)
async def pay_order(
    payment_data: PaymentCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Pay for an order"""
    payment = await payment_service.pay_order(db, payment_data.order_id, current_user.user_id, payment_data.method)

    order_total_amount = getattr(getattr(payment, "order", None), "total_amount", None)
    if order_total_amount is None:
        order_result = await db.execute(select(Order).where(Order.order_id == payment.order_id))
        order = order_result.scalar_one_or_none()
        order_total_amount = order.total_amount if order else payment.amount
    
    background_tasks.add_task(
        award_reward_points_background,
        current_user.user_id,
        payment_data.order_id,
        order_total_amount,
    )
    
    return payment


@router.post("/topup", response_model=dict)
async def topup_wallet(
    topup_data: TopupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Add funds to wallet"""
    user = await payment_service.topup(db, current_user.user_id, topup_data.amount)
    
    return {"wallet_balance": float(user.wallet_balance)}


@router.get("/history", response_model=list[PaymentHistoryResponse])
async def get_payment_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Get payment history for current user"""
    
    result = await db.execute(
        select(Payment)
        .options(selectinload(Payment.order))
        .where(Payment.user_id == current_user.user_id)
        .order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()
    
    return payments

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, get_db
from app.core.dependencies import (
    CUSTOMER_ROLES,
    TenantContext,
    get_tenant_context,
    require_role,
)
from app.models.models import Order, Payment, User
from app.schemas.payment import PaymentCreate, PaymentHistoryResponse, PaymentResponse, TopupRequest
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["payments"])
payment_service = PaymentService()


async def _award_points_background(user_id, order_id, total_amount, tenant_id):
    async with AsyncSessionLocal() as db:
        await payment_service.earn_reward_points(db, user_id, order_id, total_amount, tenant_id)


@router.post("/pay", response_model=PaymentResponse)
async def pay_order(
    payment_data: PaymentCreate,
    background_tasks: BackgroundTasks,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    payment = await payment_service.pay_order(
        db, payment_data.order_id, current_user.user_id, payment_data.method, ctx.tenant_id
    )

    order_result = await db.execute(
        select(Order).where(Order.order_id == payment.order_id, Order.tenant_id == ctx.tenant_id)
    )
    order = order_result.scalar_one_or_none()
    order_total = order.total_amount if order else payment.amount

    background_tasks.add_task(
        _award_points_background,
        current_user.user_id,
        payment_data.order_id,
        order_total,
        ctx.tenant_id,
    )
    return payment


@router.post("/topup", response_model=dict)
async def topup_wallet(
    topup_data: TopupRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    user = await payment_service.topup(db, current_user.user_id, topup_data.amount, ctx.tenant_id)
    return {"wallet_balance": float(user.wallet_balance)}


@router.get("/history", response_model=list[PaymentHistoryResponse])
async def get_payment_history(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    result = await db.execute(
        select(Payment)
        .options(selectinload(Payment.order))
        .where(
            Payment.user_id == current_user.user_id,
            Payment.tenant_id == ctx.tenant_id,
        )
        .order_by(Payment.created_at.desc())
    )
    return result.scalars().all()

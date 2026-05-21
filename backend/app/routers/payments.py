from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.models import User, UserRole, Order
from app.schemas.payment import PaymentCreate, PaymentResponse, TopupRequest
from app.services.payment_service import PaymentService
from app.core.dependencies import require_role

router = APIRouter(prefix="/payments", tags=["payments"])
payment_service = PaymentService()


@router.post("/pay", response_model=PaymentResponse)
async def pay_order(
    payment_data: PaymentCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Pay for an order"""
    payment = await payment_service.pay_order(db, payment_data.order_id, current_user.user_id, payment_data.method)
    
    # Award reward points in background
    background_tasks.add_task(payment_service.earn_reward_points, db, current_user.user_id, payment_data.order_id)
    
    return payment


@router.post("/topup", response_model=dict)
async def topup_wallet(
    topup_data: TopupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Add funds to wallet"""
    if topup_data.amount <= 0 or topup_data.amount > 10000:
        raise HTTPException(status_code=400, detail="Invalid amount")
    
    user = await payment_service.topup(db, current_user.user_id, topup_data.amount)
    
    return {"wallet_balance": float(user.wallet_balance), "message": "Funds added successfully"}


@router.get("/history", response_model=list[dict])
async def get_payment_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Get payment history for current user"""
    from app.models.models import Payment
    
    result = await db.execute(
        select(Payment)
        .where(Payment.user_id == current_user.user_id)
        .order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()
    
    return [
        {
            "payment_id": str(p.payment_id),
            "order_id": str(p.order_id),
            "amount": float(p.amount),
            "method": p.method,
            "status": p.status,
            "created_at": p.created_at.isoformat()
        }
        for p in payments
    ]

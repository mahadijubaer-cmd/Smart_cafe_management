from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.dependencies import (
    CUSTOMER_ROLES,
    TenantContext,
    get_tenant_context,
    require_role,
)
from app.core.limiter import limiter
from app.models.models import Order, Payment, Tenant, User
from app.models.order import PaymentStatus
from app.models.payment_gateway import GatewayPurpose, GatewayTransaction, GatewayTransactionStatus, GatewayType
from app.schemas.payment import PaymentCreate, PaymentHistoryResponse, PaymentResponse, TopupRequest
from app.schemas.payment_gateway import GatewayInitiateRequest, GatewayInitiateResponse
from app.services import gateway_configs_service
from app.services.gateways.base import GatewayClient, GatewayInitiationError
from app.services.gateways.sslcommerz_gateway import SSLCommerzGateway
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["payments"])
payment_service = PaymentService()

_TERMINAL_GATEWAY_STATUSES = {
    GatewayTransactionStatus.success,
    GatewayTransactionStatus.failed,
    GatewayTransactionStatus.cancelled,
}


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


# ── RFC-011 Stage 2 — real gateway checkout (authenticated order payment) ───────────────────────


def _build_gateway_client(gateway_type: GatewayType, config: dict) -> GatewayClient:
    if gateway_type == GatewayType.sslcommerz:
        return SSLCommerzGateway(
            store_id=config["store_id"],
            store_password=config["store_password"],
            is_sandbox=config.get("is_sandbox", True),
        )
    # bKash ships in Stage 4 — the interface already supports it, no implementation yet.
    raise HTTPException(status_code=400, detail=f"Gateway '{gateway_type.value}' is not yet supported")


async def _load_gateway_transaction_for_update(
    db: AsyncSession, gateway_transaction_id: UUID
) -> GatewayTransaction | None:
    result = await db.execute(
        select(GatewayTransaction)
        .where(GatewayTransaction.gateway_transaction_id == gateway_transaction_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def _settle_success(db: AsyncSession, gtx: GatewayTransaction, form_data: dict) -> bool:
    """Validates with the gateway's own API before trusting anything (PAY-7), and is safe to call
    more than once for the same row (PAY-8) — caller must already hold the row lock from
    _load_gateway_transaction_for_update. Returns True only if genuinely settled as paid."""
    if gtx.status in _TERMINAL_GATEWAY_STATUSES:
        return gtx.status == GatewayTransactionStatus.success

    config = await gateway_configs_service.get_decrypted_config(db, gtx.tenant_id, gtx.gateway_type)
    if not config:
        gtx.status = GatewayTransactionStatus.failed
        gtx.raw_response = form_data
        await db.commit()
        return False

    gateway_client = _build_gateway_client(gtx.gateway_type, config)
    result = await gateway_client.validate(val_id=form_data.get("val_id", ""), tran_id=gtx.gateway_ref or "")

    gtx.raw_response = result.raw_response
    amount_matches = result.verified_amount is not None and result.verified_amount == Decimal(str(gtx.amount))
    if not result.success or not amount_matches:
        gtx.status = GatewayTransactionStatus.failed
        await db.commit()
        return False

    gtx.status = GatewayTransactionStatus.success
    gtx.gateway_external_ref = result.external_ref
    await db.commit()

    if gtx.purpose == GatewayPurpose.order_payment:
        await payment_service.complete_gateway_order_payment(db, gtx)
    # wallet_topup settlement ships in Stage 3

    return True


async def _settle_non_success(db: AsyncSession, gtx: GatewayTransaction, outcome: str, form_data: dict) -> None:
    if gtx.status in _TERMINAL_GATEWAY_STATUSES:
        return
    gtx.status = GatewayTransactionStatus.cancelled if outcome == "cancel" else GatewayTransactionStatus.failed
    gtx.raw_response = form_data
    await db.commit()


async def _build_frontend_redirect(db: AsyncSession, gtx: GatewayTransaction, payment_flag: str) -> str:
    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.tenant_id == gtx.tenant_id))
    slug = tenant_result.scalar_one_or_none() or ""
    if gtx.order_id:
        return f"{settings.FRONTEND_URL}/{slug}/track/{gtx.order_id}?payment={payment_flag}"
    return f"{settings.FRONTEND_URL}/{slug}/wallet?payment={payment_flag}"  # wallet top-up, Stage 3


@router.post("/gateway/initiate", response_model=GatewayInitiateResponse)
async def initiate_gateway_payment(
    data: GatewayInitiateRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES)),
):
    result = await db.execute(
        select(Order).where(Order.order_id == data.order_id, Order.tenant_id == ctx.tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if order.payment_status != PaymentStatus.pending:
        raise HTTPException(status_code=400, detail="Order already paid")

    config = await gateway_configs_service.get_decrypted_config(db, ctx.tenant_id, data.gateway_type)
    if not config:
        raise HTTPException(status_code=400, detail="This payment method isn't available for this order")

    net_amount = Decimal(str(order.total_amount)) - Decimal(str(order.discount_amount))
    gtx = GatewayTransaction(
        tenant_id=ctx.tenant_id,
        purpose=GatewayPurpose.order_payment,
        order_id=order.order_id,
        user_id=current_user.user_id,
        gateway_type=data.gateway_type,
        amount=net_amount,
        status=GatewayTransactionStatus.initiated,
    )
    db.add(gtx)
    await db.commit()
    await db.refresh(gtx)

    tran_id = gtx.gateway_transaction_id.hex
    gtx.gateway_ref = tran_id

    base_callback = f"{settings.BACKEND_URL}/api/v1/payments/gateway/{gtx.gateway_transaction_id}/callback"
    gateway_client = _build_gateway_client(data.gateway_type, config)
    try:
        session = await gateway_client.initiate(
            tran_id=tran_id,
            amount=net_amount,
            success_url=f"{base_callback}/success",
            fail_url=f"{base_callback}/fail",
            cancel_url=f"{base_callback}/cancel",
            ipn_url=f"{settings.BACKEND_URL}/api/v1/payments/gateway/ipn",
            customer_name=current_user.full_name,
            customer_email=current_user.email,
            customer_phone=current_user.phone or "",
        )
    except GatewayInitiationError as exc:
        gtx.status = GatewayTransactionStatus.failed
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    await db.commit()
    return GatewayInitiateResponse(
        gateway_transaction_id=str(gtx.gateway_transaction_id), redirect_url=session.redirect_url
    )


@router.post("/gateway/{gateway_transaction_id}/callback/{outcome}")
@limiter.limit("20/minute")
async def gateway_payment_callback(
    request: Request,
    gateway_transaction_id: UUID,
    outcome: str,
    db: AsyncSession = Depends(get_db),
):
    """Browser-redirect landing point after the customer completes/abandons the gateway's hosted
    page — rate-limited since real end users hit this (unlike /gateway/ipn below)."""
    if outcome not in ("success", "fail", "cancel"):
        raise HTTPException(status_code=404)

    form_data = dict(await request.form())
    gtx = await _load_gateway_transaction_for_update(db, gateway_transaction_id)
    if not gtx:
        return RedirectResponse(settings.FRONTEND_URL, status_code=303)

    if outcome == "success":
        settled = await _settle_success(db, gtx, form_data)
        payment_flag = "success" if settled else "failed"
    else:
        await _settle_non_success(db, gtx, outcome, form_data)
        payment_flag = "cancelled" if outcome == "cancel" else "failed"

    redirect_url = await _build_frontend_redirect(db, gtx, payment_flag)
    return RedirectResponse(redirect_url, status_code=303)


@router.post("/gateway/ipn")
async def gateway_payment_ipn(request: Request, db: AsyncSession = Depends(get_db)):
    """Server-to-server webhook — no auth (the gateway calls this directly), not rate-limited
    (throttling here would risk limiting the gateway's own retries; idempotency is the real
    defense, see _settle_success/_settle_non_success's terminal-status check)."""
    form_data = dict(await request.form())
    tran_id = form_data.get("tran_id", "")
    try:
        gateway_transaction_id = UUID(tran_id)
    except ValueError:
        return {"status": "ignored"}

    gtx = await _load_gateway_transaction_for_update(db, gateway_transaction_id)
    if not gtx:
        return {"status": "ignored"}

    if form_data.get("status", "") in ("VALID", "VALIDATED"):
        await _settle_success(db, gtx, form_data)
    else:
        await _settle_non_success(db, gtx, "fail", form_data)

    return {"status": "ok"}

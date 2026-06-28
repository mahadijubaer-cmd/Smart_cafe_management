"""Receipt PDF endpoints.

GET /receipts/{order_id}/pdf — download money receipt PDF (owner or admin).
"""
import io
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import ADMIN_ROLES, TenantContext, get_current_user, get_tenant_context
from app.models.models import Order, Payment, ReceiptLog, User
from app.models.menu import MenuItem
from app.models.tenant import Tenant
from app.services import pdf_service

router = APIRouter(prefix="/receipts", tags=["receipts"])


def _make_receipt_no() -> str:
    date_str = datetime.now().strftime("%Y%m%d")
    short_id = uuid.uuid4().hex[:6].upper()
    return f"RCP-{date_str}-{short_id}"


@router.get("/{order_id}/pdf")
async def download_receipt(
    order_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate (and cache) a money receipt PDF for the given order."""
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.user))
        .where(Order.order_id == order_id, Order.tenant_id == ctx.tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_admin = current_user.role in ADMIN_ROLES
    if not is_admin and order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Resolve tenant
    t_result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = t_result.scalar_one_or_none()
    tenant_name = tenant.name if tenant else "SCMS Platform"
    tenant_address = tenant.address if tenant else None

    # Resolve or create receipt number
    rcpt_result = await db.execute(
        select(ReceiptLog).where(ReceiptLog.order_id == order_id)
    )
    receipt_log = rcpt_result.scalar_one_or_none()
    if receipt_log:
        receipt_no = receipt_log.receipt_no
    else:
        receipt_no = _make_receipt_no()
        db.add(ReceiptLog(
            tenant_id=ctx.tenant_id,
            order_id=order.order_id,
            receipt_no=receipt_no,
        ))
        await db.commit()

    # Resolve last payment for method/timestamp
    pay_result = await db.execute(
        select(Payment)
        .where(Payment.order_id == order_id)
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    payment = pay_result.scalar_one_or_none()
    payment_method = (
        payment.method.value if payment and hasattr(payment.method, "value")
        else (str(payment.method) if payment else "N/A")
    )
    payment_at = payment.created_at if payment else None

    # Build items list — resolve menu item names
    items_data = []
    for oi in order.items:
        mi_result = await db.execute(select(MenuItem).where(MenuItem.item_id == oi.item_id))
        mi = mi_result.scalar_one_or_none()
        items_data.append({
            "name": mi.name if mi else str(oi.item_id)[:8],
            "quantity": oi.quantity,
            "unit_price": float(oi.unit_price),
            "subtotal": float(oi.subtotal),
        })

    subtotal = Decimal(str(order.total_amount)) + Decimal(str(order.discount_amount))
    discount = Decimal(str(order.discount_amount))
    total = Decimal(str(order.total_amount))

    user = order.user
    student_id = user.student_id if user else None

    pdf_bytes = pdf_service.generate_receipt_pdf(
        receipt_no=receipt_no,
        tenant_name=tenant_name,
        tenant_address=tenant_address,
        user_name=user.full_name if user else "Unknown",
        user_email=user.email if user else "",
        student_id=student_id,
        order_id=str(order.order_id),
        order_created_at=order.created_at,
        items=items_data,
        subtotal=subtotal,
        discount=discount,
        total=total,
        payment_method=payment_method,
        payment_at=payment_at,
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="receipt_{receipt_no}.pdf"'},
    )

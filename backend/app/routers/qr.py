"""QR code endpoints.

GET /qr/order/{order_id}/base64  — base64-encoded PNG (owner)
GET /qr/order/{order_id}/png     — streaming PNG (owner)
GET /qr/table/{table_number}/png — table QR PNG (public)
"""
import base64
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import ADMIN_ROLES, TenantContext, get_current_user, get_tenant_context, require_role
from app.models.models import Order, User
from app.models.user import UserRole
from app.services import qr_service

router = APIRouter(prefix="/qr", tags=["qr"])


async def _get_order_and_check_owner(
    order_id: str,
    ctx: TenantContext,
    current_user: User,
    db: AsyncSession,
) -> Order:
    result = await db.execute(
        select(Order).where(Order.order_id == order_id, Order.tenant_id == ctx.tenant_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    is_admin = current_user.role in ADMIN_ROLES
    if not is_admin and order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return order


@router.get("/order/{order_id}/base64")
async def get_order_qr_base64(
    order_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the order QR code as a base64-encoded PNG string."""
    order = await _get_order_and_check_owner(order_id, ctx, current_user, db)

    png_bytes = qr_service.generate_order_qr_bytes(
        order_id=order.order_id,
        user_name=str(order.user_id)[:8],
        total=str(order.total_amount),
        status=getattr(order.status, "value", str(order.status)),
    )
    b64 = base64.b64encode(png_bytes).decode()
    return {
        "order_id": str(order.order_id),
        "format": "png",
        "encoding": "base64",
        "data": b64,
    }


@router.get("/order/{order_id}/png")
async def get_order_qr_png(
    order_id: str,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream the order QR code as a PNG image."""
    order = await _get_order_and_check_owner(order_id, ctx, current_user, db)

    png_bytes = qr_service.generate_order_qr_bytes(
        order_id=order.order_id,
        user_name=str(order.user_id)[:8],
        total=str(order.total_amount),
        status=getattr(order.status, "value", str(order.status)),
    )
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="order_{str(order_id)[:8]}.png"'},
    )


@router.get("/table/{table_number}/png")
async def get_table_qr_png(table_number: int):
    """Stream a table QR code PNG — public endpoint, no auth required."""
    png_bytes = qr_service.generate_table_qr_bytes(table_number)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="table_{table_number}.png"'},
    )

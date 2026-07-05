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
from app.models.table import TablesMap
from app.models.tenant import Tenant
from app.models.user import UserRole
from app.services import pdf_service, qr_service

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
async def get_table_qr_png(table_number: int, db: AsyncSession = Depends(get_db)):
    """Stream a table QR code PNG — public endpoint, no auth required.

    RFC-007 (Phase 22): if the table's tenant has a public guest-ordering menu
    enabled, the QR encodes the `/m/{public_slug}` guest URL instead of the
    legacy authenticated `/order?table=` URL.
    """
    table_result = await db.execute(select(TablesMap).where(TablesMap.table_id == table_number))
    table = table_result.scalar_one_or_none()

    public_slug = None
    table_label = str(table_number)
    if table:
        tenant_result = await db.execute(select(Tenant).where(Tenant.tenant_id == table.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if tenant and tenant.public_menu_enabled and tenant.public_slug:
            public_slug = tenant.public_slug
        table_label = table.table_number

    png_bytes = qr_service.generate_table_qr_bytes(table_number, table_label, public_slug)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="table_{table_number}.png"'},
    )


@router.get("/table-sheet/pdf")
async def get_table_qr_sheet_pdf(
    outlet_id: str | None = None,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
):
    """RFC-007 (Phase 22): one-page-per-table PDF sheet of table QR codes for printing."""
    tenant_result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    query = select(TablesMap).where(TablesMap.tenant_id == ctx.tenant_id)
    if outlet_id:
        query = query.where(TablesMap.outlet_id == outlet_id)
    tables_result = await db.execute(query.order_by(TablesMap.table_number))
    tables = tables_result.scalars().all()

    if not tables:
        raise HTTPException(status_code=404, detail="No tables found")

    public_slug = tenant.public_slug if tenant.public_menu_enabled else None
    table_rows = [
        {
            "table_number": t.table_number,
            "zone": t.zone,
            "qr_png_bytes": qr_service.generate_table_qr_bytes(t.table_id, t.table_number, public_slug),
        }
        for t in tables
    ]

    pdf_bytes = pdf_service.generate_table_qr_sheet_pdf(tenant.name, table_rows)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="table-qr-sheet.pdf"'},
    )

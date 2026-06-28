"""Memo PDF generation endpoint.

POST /memo/generate — streams an A4 institutional memorandum PDF.
Access: staff, outlet_admin, tenant_admin roles.
"""
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.dependencies import FLOOR_STAFF_ROLES, TenantContext, get_tenant_context, require_role
from app.models.user import User, UserRole
from app.schemas.memo import MemoRequest
from app.services import pdf_service
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.tenant import Tenant

router = APIRouter(prefix="/memo", tags=["memo"])

_MEMO_ROLES = (UserRole.staff, UserRole.outlet_admin, UserRole.tenant_admin)


@router.post("/generate")
async def generate_memo(
    data: MemoRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_MEMO_ROLES)),
):
    """Generate and stream an A4 PDF memorandum."""
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    tenant_name = tenant.name if tenant else "SCMS Platform"

    pdf_bytes = pdf_service.generate_memo_pdf(
        tenant_name=tenant_name,
        ref_no=data.ref_no,
        date=data.date,
        to=data.to,
        from_name=data.from_name,
        subject=data.subject,
        body_paragraphs=data.body_paragraphs,
        signatory_name=data.signatory_name,
        signatory_title=data.signatory_title,
    )
    filename = f"memo_{data.ref_no.replace('/', '-')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

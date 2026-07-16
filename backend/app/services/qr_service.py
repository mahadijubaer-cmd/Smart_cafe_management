"""QR Code service — generation, persistence, and email delivery.

File layout:
  {MEDIA_ROOT}/qr_codes/{order_id}.png   ← order QR images
  {MEDIA_ROOT}/qr_codes/table_{N}.png    ← table QR images (cached)

Order QR payload:
  {"order_id":"...","user":"...","total":"...","status":"..."}

Table QR payload:
  "{FRONTEND_URL}/order?table={table_number}"
"""
import base64
import io
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import qrcode
from qrcode.image.pil import PilImage
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import QrCode

logger = logging.getLogger(__name__)

MEDIA_ROOT = Path(settings.MEDIA_ROOT)
QR_DIR = MEDIA_ROOT / "qr_codes"


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _make_qr(data: str, box_size: int = 10, border: int = 4) -> PilImage:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white")


def generate_order_qr_bytes(
    order_id: UUID,
    user_name: str,
    total: str,
    status: str,
) -> bytes:
    """Return PNG bytes for an order QR code (no file I/O)."""
    payload = json.dumps({
        "order_id": str(order_id),
        "user": user_name,
        "total": total,
        "status": status,
    })
    img = _make_qr(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_url_qr_bytes(url: str) -> bytes:
    """Return PNG bytes for a QR code encoding an arbitrary URL.

    Used by the guest order tracking link (RFC-007, Phase 22) so a guest can
    save/share their tracking page without typing the URL.
    """
    img = _make_qr(url, box_size=8)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_table_qr_bytes(
    table_id: int,
    table_number_label: str | None = None,
    public_slug: str | None = None,
) -> bytes:
    """Return PNG bytes for a table QR code.

    RFC-007 (Phase 22): when the tenant has a `public_slug` (restaurant segment,
    public menu enabled), the QR encodes the guest-ordering URL
    `{FRONTEND_URL}/m/{public_slug}?t={table_number}` — each outlet is already
    its own tenant with its own `public_slug`, so no separate outlet param is
    needed. Falls back to the legacy authenticated-order URL otherwise.
    """
    if public_slug:
        table_label = table_number_label or str(table_id)
        url = f"{settings.FRONTEND_URL}/m/{public_slug}?t={table_label}"
    else:
        url = f"{settings.FRONTEND_URL}/order?table={table_id}"
    img = _make_qr(url, box_size=8)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def generate_and_save_order_qr(
    db: AsyncSession,
    order_id: UUID,
    tenant_id: UUID,
    user_name: str,
    total: str,
) -> Path:
    """Generate order QR PNG, save to disk, record in qr_codes table.

    Idempotent: if the file already exists it is overwritten and the DB
    row is upserted (insert or no-op if already recorded).
    """
    _ensure_dir(QR_DIR)
    file_path = QR_DIR / f"{order_id}.png"

    png_bytes = generate_order_qr_bytes(order_id, user_name, total, "confirmed")
    file_path.write_bytes(png_bytes)
    logger.info("QR code saved: %s", file_path)

    # Upsert DB record (skip if already exists)
    from sqlalchemy import select
    existing = await db.execute(
        select(QrCode).where(QrCode.order_id == order_id)
    )
    if existing.scalar_one_or_none() is None:
        db.add(QrCode(
            tenant_id=tenant_id,
            order_id=order_id,
            file_path=str(file_path),
        ))
        await db.commit()

    return file_path


async def email_qr_attachment(
    db: AsyncSession,
    to_email: str,
    order_id: UUID,
    file_path: Path,
) -> None:
    """Email the QR code PNG as an attachment, then mark qr_codes.emailed on success.

    Delivery itself goes through app.config.email.send_qr_attachment_email — the same
    Brevo-preferred provider selection send_otp_email/send_invite_email use (ADR-007) — rather
    than duplicating SMTP-only logic here.
    """
    from sqlalchemy import update

    from app.config.email import send_qr_attachment_email

    sent = await send_qr_attachment_email(to_email, order_id, file_path)
    if sent:
        await db.execute(
            update(QrCode)
            .where(QrCode.order_id == order_id)
            .values(emailed=True, emailed_at=datetime.now(timezone.utc))
        )
        await db.commit()

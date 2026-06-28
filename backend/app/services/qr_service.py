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


def generate_table_qr_bytes(table_number: int) -> bytes:
    """Return PNG bytes for a table QR code (encodes the order URL)."""
    url = f"{settings.FRONTEND_URL}/order?table={table_number}"
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
    to_email: str,
    order_id: UUID,
    file_path: Path,
) -> None:
    """Email the QR code PNG as an attachment.

    Falls back to a log line if SMTP is not configured.
    """
    if not settings.mail_enabled:
        logger.warning("[DEV — no SMTP] Would email QR for order %s to %s", order_id, to_email)
        return

    from fastapi_mail import FastMail, MessageSchema, MessageType
    from app.config.email import _mail_config

    message = MessageSchema(
        subject=f"Your order QR code — #{str(order_id)[:8].upper()}",
        recipients=[to_email],
        body=(
            f"Your order has been confirmed.\n\n"
            f"Please present the attached QR code at the counter to collect your order.\n\n"
            f"Order ID: {order_id}\n\n"
            f"— {settings.MAIL_FROM_NAME}"
        ),
        subtype=MessageType.plain,
        attachments=[str(file_path)],
    )
    fm = FastMail(_mail_config)
    try:
        await fm.send_message(message)
        logger.info("QR email sent to %s for order %s", to_email, order_id)
    except Exception:
        logger.exception("Failed to email QR for order %s to %s", order_id, to_email)

"""Email sender — Brevo transactional API (preferred) or SMTP (fastapi-mail) fallback.

See ADR-007 for the provider-selection rationale and ADR-005 for the visibility design
(delivery failures are always logged, never surfaced to the caller). When neither Brevo
nor SMTP is configured, send_otp_email()/send_invite_email() log the code/link instead of
throwing, so the rest of the OTP/invite flow still works end-to-end in local dev.
"""
import asyncio
import base64
import logging
from pathlib import Path
from typing import Awaitable, Callable, TypeVar

from brevo import (
    AsyncBrevo,
    Brevo,
    SendTransacEmailRequestAttachmentItem,
    SendTransacEmailRequestSender,
    SendTransacEmailRequestToItem,
)
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.core.config import settings

logger = logging.getLogger(__name__)

_T = TypeVar("_T")

# Render's egress to Brevo/SMTP has shown transient failures (same class of issue as the
# Redis/Upstash DNS flakiness — found 2026-09-22: an OTP send silently vanished with no
# Brevo-side event at all, then succeeded seconds later on retry with identical inputs).
# A short retry absorbs that without the caller ever seeing it.
_SEND_ATTEMPTS = 3
_SEND_RETRY_DELAY_SECONDS = 1.0


async def _send_with_retries(send: Callable[[], Awaitable[_T]], description: str) -> _T:
    last_exc: Exception | None = None
    for attempt in range(1, _SEND_ATTEMPTS + 1):
        try:
            return await send()
        except Exception as exc:  # noqa: BLE001 - genuinely want to retry any send failure
            last_exc = exc
            if attempt < _SEND_ATTEMPTS:
                logger.warning(
                    "%s failed on attempt %d/%d, retrying: %s",
                    description, attempt, _SEND_ATTEMPTS, exc,
                )
                await asyncio.sleep(_SEND_RETRY_DELAY_SECONDS * attempt)
    assert last_exc is not None
    raise last_exc


_mail_config: "ConnectionConfig | None" = None


def _get_mail_config() -> "ConnectionConfig":
    global _mail_config
    if _mail_config is None:
        _mail_config = ConnectionConfig(
            MAIL_USERNAME=settings.MAIL_USERNAME,
            MAIL_PASSWORD=settings.MAIL_PASSWORD,
            MAIL_FROM=settings.MAIL_FROM,
            MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
            MAIL_PORT=settings.MAIL_PORT,
            MAIL_SERVER=settings.MAIL_SERVER,
            MAIL_STARTTLS=settings.MAIL_STARTTLS,
            MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )
    return _mail_config


def _brevo_sender() -> SendTransacEmailRequestSender:
    return SendTransacEmailRequestSender(name=settings.MAIL_FROM_NAME, email=settings.MAIL_FROM)


_PURPOSE_LABELS = {
    "email_verification": "email verification",
    "password_reset": "password reset",
    "login": "login",
}


async def send_otp_email(to_email: str, otp_code: str, purpose: str) -> None:
    """Send a 6-digit OTP to the given address via whichever provider is configured."""
    provider = settings.mail_provider
    if provider == "none":
        logger.warning(
            "[DEV — no mail provider] OTP for %s (%s): %s", to_email, purpose, otp_code
        )
        return

    label = _PURPOSE_LABELS.get(purpose, purpose)
    body = (
        f"Hello,\n\n"
        f"Your one-time code for {label} is:\n\n"
        f"    {otp_code}\n\n"
        f"This code expires in 10 minutes. Do not share it with anyone.\n\n"
        f"— {settings.MAIL_FROM_NAME}"
    )
    subject = "Your SCMS verification code"

    if provider == "brevo":
        client = AsyncBrevo(api_key=settings.BREVO_API_KEY)
        await _send_with_retries(
            lambda: client.transactional_emails.send_transac_email(
                sender=_brevo_sender(),
                to=[SendTransacEmailRequestToItem(email=to_email)],
                subject=subject,
                html_content=f"<pre style='font:inherit'>{body}</pre>",
            ),
            description=f"OTP email to {to_email} via Brevo",
        )
        logger.info("OTP email sent to %s via Brevo (purpose=%s)", to_email, purpose)
        return

    message = MessageSchema(
        subject=subject,
        recipients=[to_email],
        body=body,
        subtype=MessageType.plain,
    )
    fm = FastMail(_get_mail_config())
    await _send_with_retries(
        lambda: fm.send_message(message),
        description=f"OTP email to {to_email} via SMTP",
    )
    logger.info("OTP email sent to %s via SMTP (purpose=%s)", to_email, purpose)


def verify_mail_config() -> None:
    """Best-effort startup check: log clearly if a mail provider is enabled but broken.

    `mail_provider` picks Brevo over SMTP over "none" (dev-log fallback) — see ADR-007.
    Whichever is active, a broken config (bad API key, unverified Brevo sender, invalid SMTP
    credentials) would otherwise fail silently on every future OTP send (`POST /otp/send`
    always returns 200 by design, to avoid leaking account existence — see ADR-005). This
    function makes that visible in startup logs instead. Never raises: a broken mail config
    must not prevent the API from starting, since OTP email is fire-and-forget by design.
    """
    provider = settings.mail_provider

    if provider == "none":
        logger.warning(
            "No mail provider configured (BREVO_API_KEY and MAIL_USERNAME/MAIL_PASSWORD all "
            "empty) — OTP codes will be logged instead of emailed. Fine for local dev only."
        )
        return

    if provider == "brevo":
        try:
            Brevo(api_key=settings.BREVO_API_KEY).account.get_account()
        except Exception as exc:
            logger.error(
                "BREVO CHECK FAILED: %s — BREVO_API_KEY is set but invalid, revoked, or Brevo "
                "is unreachable. OTP emails will silently fail to send until this is fixed; "
                "POST /otp/send will still return 200 by design (see ADR-005). Note: sends will "
                "also fail if MAIL_FROM (%s) is not a verified sender in this Brevo account, "
                "even with a valid API key — see operations/deployment.md.",
                exc,
                settings.MAIL_FROM,
            )
        else:
            logger.info("Brevo check OK — API key valid and account reachable.")
        return

    import smtplib

    try:
        if settings.MAIL_SSL_TLS:
            server = smtplib.SMTP_SSL(settings.MAIL_SERVER, settings.MAIL_PORT, timeout=5)
        else:
            server = smtplib.SMTP(settings.MAIL_SERVER, settings.MAIL_PORT, timeout=5)
        try:
            if settings.MAIL_STARTTLS:
                server.starttls()
            server.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
        finally:
            server.quit()
    except Exception as exc:
        logger.error(
            "SMTP CHECK FAILED for %s: %s — MAIL_USERNAME/MAIL_PASSWORD are set but invalid, "
            "revoked, or the server is unreachable. OTP emails (registration verification, admin "
            "login 2FA, password reset) will silently fail to send until this is fixed; "
            "POST /otp/send will still return 200 by design (see ADR-005). If MAIL_USERNAME/"
            "MAIL_PASSWORD in .env are still the .env.example placeholder values "
            "('your_email@gmail.com' / 'your_app_password'), that is almost certainly the cause.",
            settings.MAIL_SERVER,
            exc,
        )
    else:
        logger.info("SMTP check OK — %s reachable and credentials valid.", settings.MAIL_SERVER)


async def send_invite_email(to_email: str, invite_link: str, role: str, org_name: str) -> None:
    """Send a staff invitation email with the accept link.

    The invitation row is already committed by the caller before this runs, so a delivery
    failure here must not surface as a 500 on an otherwise-successful request — log and
    swallow it instead (the invite link can still be resent/shared manually).
    """
    provider = settings.mail_provider
    if provider == "none":
        logger.warning("[DEV — no mail provider] Invite for %s (%s): %s", to_email, role, invite_link)
        return

    body = (
        f"Hello,\n\n"
        f"You have been invited to join {org_name} as {role}.\n\n"
        f"Click the link below to accept your invitation and create your account:\n\n"
        f"    {invite_link}\n\n"
        f"This invitation expires in 48 hours. If you did not expect this, you can ignore it.\n\n"
        f"— {settings.MAIL_FROM_NAME}"
    )
    subject = f"You've been invited to join {org_name}"

    try:
        if provider == "brevo":
            client = AsyncBrevo(api_key=settings.BREVO_API_KEY)
            await _send_with_retries(
                lambda: client.transactional_emails.send_transac_email(
                    sender=_brevo_sender(),
                    to=[SendTransacEmailRequestToItem(email=to_email)],
                    subject=subject,
                    html_content=f"<pre style='font:inherit'>{body}</pre>",
                ),
                description=f"Invite email to {to_email} via Brevo",
            )
            logger.info("Invite email sent to %s via Brevo (role=%s)", to_email, role)
            return

        message = MessageSchema(
            subject=subject,
            recipients=[to_email],
            body=body,
            subtype=MessageType.plain,
        )
        fm = FastMail(_get_mail_config())
        await _send_with_retries(
            lambda: fm.send_message(message),
            description=f"Invite email to {to_email} via SMTP",
        )
        logger.info("Invite email sent to %s via SMTP (role=%s)", to_email, role)
    except Exception:
        logger.exception("Failed to send invite email to %s (role=%s)", to_email, role)


async def send_qr_attachment_email(to_email: str, order_id, file_path: Path) -> bool:
    """Email a generated order QR code as an attachment. Returns True only on an actual send.

    Uses the same Brevo-preferred provider selection as send_otp_email/send_invite_email above —
    unlike those, delivery here isn't fire-and-forget from the caller's point of view: a True
    return lets qr_service mark qr_codes.emailed, so don't return True for the "no provider
    configured" dev-log path.
    """
    provider = settings.mail_provider
    if provider == "none":
        logger.warning("[DEV — no mail provider] Would email QR for order %s to %s", order_id, to_email)
        return False

    subject = f"Your order QR code — #{str(order_id)[:8].upper()}"
    body = (
        f"Your order has been confirmed.\n\n"
        f"Please present the attached QR code at the counter to collect your order.\n\n"
        f"Order ID: {order_id}\n\n"
        f"— {settings.MAIL_FROM_NAME}"
    )

    try:
        if provider == "brevo":
            content_b64 = base64.b64encode(file_path.read_bytes()).decode()
            client = AsyncBrevo(api_key=settings.BREVO_API_KEY)
            await _send_with_retries(
                lambda: client.transactional_emails.send_transac_email(
                    sender=_brevo_sender(),
                    to=[SendTransacEmailRequestToItem(email=to_email)],
                    subject=subject,
                    html_content=f"<pre style='font:inherit'>{body}</pre>",
                    attachment=[SendTransacEmailRequestAttachmentItem(content=content_b64, name=file_path.name)],
                ),
                description=f"QR email to {to_email} via Brevo",
            )
            logger.info("QR email sent to %s via Brevo for order %s", to_email, order_id)
            return True

        message = MessageSchema(
            subject=subject,
            recipients=[to_email],
            body=body,
            subtype=MessageType.plain,
            attachments=[str(file_path)],
        )
        fm = FastMail(_get_mail_config())
        await _send_with_retries(
            lambda: fm.send_message(message),
            description=f"QR email to {to_email} via SMTP",
        )
        logger.info("QR email sent to %s via SMTP for order %s", to_email, order_id)
        return True
    except Exception:
        logger.exception("Failed to email QR for order %s to %s", order_id, to_email)
        return False

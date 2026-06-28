"""FastMail configuration and OTP email sender.

When MAIL_USERNAME / MAIL_PASSWORD are not set (local dev without SMTP),
send_otp_email() logs the code instead of throwing so the rest of the
OTP flow still works end-to-end.
"""
import logging

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.core.config import settings

logger = logging.getLogger(__name__)

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

_PURPOSE_LABELS = {
    "email_verification": "email verification",
    "password_reset": "password reset",
    "login": "login",
}


async def send_otp_email(to_email: str, otp_code: str, purpose: str) -> None:
    """Send a 6-digit OTP to the given address.

    Falls back to a log line if SMTP is not configured (dev mode).
    """
    if not settings.mail_enabled:
        logger.warning(
            "[DEV — no SMTP] OTP for %s (%s): %s", to_email, purpose, otp_code
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
    message = MessageSchema(
        subject=f"Your SCMS verification code",
        recipients=[to_email],
        body=body,
        subtype=MessageType.plain,
    )
    fm = FastMail(_mail_config)
    await fm.send_message(message)
    logger.info("OTP email sent to %s (purpose=%s)", to_email, purpose)

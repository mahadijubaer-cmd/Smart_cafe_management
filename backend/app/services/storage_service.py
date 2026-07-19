"""Public file storage — Backblaze B2 (S3-compatible) in production, local disk in dev.

Only tenant logos and menu item images go through here: both are uploaded once and served
indefinitely afterward via a public URL, so they need real persistence. QR codes do not use
this module — they're generated and consumed within a single request (see qr_service.py) and
never re-read from disk later, so local disk is fine for them even on an ephemeral filesystem.

Falls back to MEDIA_ROOT + the /media StaticFiles mount whenever B2 isn't configured (mirrors
the Brevo-vs-SMTP-vs-none precedent for mail — see Settings.mail_provider) so local dev and CI
need zero setup.
"""
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

MEDIA_ROOT = Path(settings.MEDIA_ROOT)

_b2_client = None


def _get_b2_client():
    global _b2_client
    if _b2_client is None:
        import boto3
        from botocore.client import Config as BotoConfig

        _b2_client = boto3.client(
            "s3",
            endpoint_url=settings.B2_ENDPOINT_URL,
            aws_access_key_id=settings.B2_KEY_ID,
            aws_secret_access_key=settings.B2_APPLICATION_KEY,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _b2_client


def save_public_file(subdir: str, filename: str, contents: bytes, content_type: str) -> str:
    """Persist `contents` under `{subdir}/{filename}` and return a URL the browser can load.

    Uses Backblaze B2 when configured (Settings.b2_enabled); otherwise writes to local disk
    under MEDIA_ROOT and returns a /media/... path served by the StaticFiles mount in main.py.
    """
    if settings.b2_enabled:
        key = f"{subdir}/{filename}"
        _get_b2_client().put_object(
            Bucket=settings.B2_BUCKET_NAME,
            Key=key,
            Body=contents,
            ContentType=content_type,
        )
        url = f"{settings.B2_PUBLIC_URL_BASE.rstrip('/')}/{key}"
        logger.info("Uploaded %s to Backblaze B2", key)
        return url

    target_dir = MEDIA_ROOT / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / filename).write_bytes(contents)
    return f"/media/{subdir}/{filename}"

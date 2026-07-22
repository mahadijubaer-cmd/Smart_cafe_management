"""At-rest encryption for per-tenant payment gateway credentials (RFC-011, ADR-015).

Only the genuinely secret sub-fields of a gateway config are ever passed through
these functions (e.g. SSLCommerz store_password, bKash app_secret/password) — the
non-secret identifiers (store_id, username) are stored in plain columns and never
touch this module. See TenantPaymentGateway.public_identifier /
.credentials_encrypted (app/models/payment_gateway.py).

Deliberately fails loudly rather than degrading quietly (unlike this codebase's
optional-integration pattern for B2/mail/Brevo, config.py's `*_enabled` properties):
silently persisting a merchant secret in plaintext is not an acceptable fallback.
"""
from __future__ import annotations

import json

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class EncryptionNotConfigured(RuntimeError):
    """Raised when a secret must be encrypted/decrypted but ENCRYPTION_KEY is unset."""


def _fernet() -> Fernet:
    if not settings.ENCRYPTION_KEY:
        raise EncryptionNotConfigured(
            "ENCRYPTION_KEY is not configured on this server — payment gateway credentials "
            "cannot be saved or read until it is set. See specs/operations/deployment.md."
        )
    return Fernet(settings.ENCRYPTION_KEY.encode())


def encrypt_json(data: dict) -> str:
    """Encrypt a dict of secret fields into an opaque, storable string."""
    payload = json.dumps(data).encode()
    return _fernet().encrypt(payload).decode()


def decrypt_json(blob: str) -> dict:
    """Decrypt a blob produced by encrypt_json back into its dict of secret fields."""
    try:
        payload = _fernet().decrypt(blob.encode())
    except InvalidToken as exc:
        raise EncryptionNotConfigured(
            "Stored payment gateway credentials could not be decrypted — ENCRYPTION_KEY may "
            "have changed since they were saved. Re-enter this gateway's credentials."
        ) from exc
    return json.loads(payload.decode())

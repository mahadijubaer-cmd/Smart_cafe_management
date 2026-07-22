from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException

from app.core.crypto import decrypt_json, encrypt_json
from app.models.payment_gateway import GatewayType, TenantPaymentGateway
from app.schemas.payment_gateway import GatewayConfigMasked, GatewayConfigUpsert
from app.services.gateways.base import GatewayClient
from app.services.gateways.bkash_gateway import BkashGateway
from app.services.gateways.sslcommerz_gateway import SSLCommerzGateway


def build_gateway_client(gateway_type: GatewayType, config: dict) -> GatewayClient:
    """Shared by payments.py (authenticated) and public.py (guest) — one dispatch
    point per gateway type, so adding a gateway (Stage 4's bKash) means one new
    branch here, not one per router."""
    if gateway_type == GatewayType.sslcommerz:
        return SSLCommerzGateway(
            store_id=config["store_id"],
            store_password=config["store_password"],
            is_sandbox=config.get("is_sandbox", True),
        )
    if gateway_type == GatewayType.bkash:
        return BkashGateway(
            app_key=config["app_key"],
            app_secret=config["app_secret"],
            username=config["username"],
            password=config["password"],
            is_sandbox=config.get("is_sandbox", True),
        )
    raise HTTPException(status_code=400, detail=f"Gateway '{gateway_type.value}' is not yet supported")

# Which upsert fields are the non-secret "public_identifier" for each gateway type,
# and which are the secret sub-fields that get Fernet-encrypted (ADR-015).
_PUBLIC_FIELDS: dict[GatewayType, list[str]] = {
    GatewayType.sslcommerz: ["store_id"],
    GatewayType.bkash: ["username", "app_key"],
}
_SECRET_FIELDS: dict[GatewayType, list[str]] = {
    GatewayType.sslcommerz: ["store_password"],
    GatewayType.bkash: ["app_secret", "password"],
}


async def _get_row(db: AsyncSession, tenant_id: UUID, gateway_type: GatewayType) -> TenantPaymentGateway | None:
    result = await db.execute(
        select(TenantPaymentGateway).where(
            TenantPaymentGateway.tenant_id == tenant_id,
            TenantPaymentGateway.gateway_type == gateway_type,
        )
    )
    return result.scalar_one_or_none()


def _to_masked(row: TenantPaymentGateway) -> GatewayConfigMasked:
    return GatewayConfigMasked(
        gateway_type=row.gateway_type,
        is_enabled=row.is_enabled,
        is_sandbox=row.is_sandbox,
        public_identifier=row.public_identifier,
        has_credentials=bool(row.credentials_encrypted),
    )


async def list_masked_configs(db: AsyncSession, tenant_id: UUID) -> list[GatewayConfigMasked]:
    result = await db.execute(
        select(TenantPaymentGateway).where(TenantPaymentGateway.tenant_id == tenant_id)
    )
    return [_to_masked(row) for row in result.scalars().all()]


async def upsert_config(
    db: AsyncSession, tenant_id: UUID, gateway_type: GatewayType, data: GatewayConfigUpsert
) -> GatewayConfigMasked:
    row = await _get_row(db, tenant_id, gateway_type)
    if row is None:
        row = TenantPaymentGateway(tenant_id=tenant_id, gateway_type=gateway_type)
        db.add(row)

    row.is_enabled = data.is_enabled
    row.is_sandbox = data.is_sandbox

    public_values = {f: getattr(data, f) for f in _PUBLIC_FIELDS[gateway_type] if getattr(data, f) is not None}
    if public_values:
        row.public_identifier = (
            public_values[_PUBLIC_FIELDS[gateway_type][0]]
            if len(public_values) == 1
            else json.dumps(public_values)
        )

    secret_values = {f: getattr(data, f) for f in _SECRET_FIELDS[gateway_type] if getattr(data, f) is not None}
    if secret_values:
        # Merge onto any previously stored secrets rather than replacing wholesale, so
        # updating just one secret field (e.g. rotating a password) doesn't blank the others.
        existing = decrypt_json(row.credentials_encrypted) if row.credentials_encrypted else {}
        existing.update(secret_values)
        row.credentials_encrypted = encrypt_json(existing)

    await db.commit()
    await db.refresh(row)
    return _to_masked(row)


async def delete_config(db: AsyncSession, tenant_id: UUID, gateway_type: GatewayType) -> bool:
    row = await _get_row(db, tenant_id, gateway_type)
    if row is None:
        return False
    await db.delete(row)
    await db.commit()
    return True


async def get_decrypted_config(db: AsyncSession, tenant_id: UUID, gateway_type: GatewayType) -> dict | None:
    """Server-only — the returned dict may contain real secrets. Never expose via an API response.
    Requires `is_enabled=true` — used by checkout/settlement, where a disabled gateway must never
    be payable. See `get_decrypted_config_any` for the Stage 5 "test connection" use case, which
    intentionally does NOT gate on `is_enabled`."""
    row = await _get_row(db, tenant_id, gateway_type)
    if row is None or not row.is_enabled or not row.credentials_encrypted:
        return None
    return _decrypt_row(row, gateway_type)


async def get_decrypted_config_any(db: AsyncSession, tenant_id: UUID, gateway_type: GatewayType) -> dict | None:
    """RFC-011 Stage 5 / PAY-15 — same as `get_decrypted_config` but ignores `is_enabled`, so an
    admin can test credentials before switching a gateway live. Server-only, same secrecy contract."""
    row = await _get_row(db, tenant_id, gateway_type)
    if row is None or not row.credentials_encrypted:
        return None
    return _decrypt_row(row, gateway_type)


def _decrypt_row(row: TenantPaymentGateway, gateway_type: GatewayType) -> dict:
    secrets = decrypt_json(row.credentials_encrypted)
    public_fields = _PUBLIC_FIELDS[gateway_type]
    if row.public_identifier:
        if len(public_fields) == 1:
            secrets[public_fields[0]] = row.public_identifier
        else:
            secrets.update(json.loads(row.public_identifier))
    secrets["is_sandbox"] = row.is_sandbox
    return secrets


def build_gateway_callback_urls(
    gateway_type: GatewayType, backend_url: str, gateway_transaction_id
) -> tuple[str, str, str, str]:
    """Returns `(success_url, fail_url, cancel_url, ipn_url)` for `GatewayClient.initiate()`.

    bKash registers exactly one `callbackURL` (outcome discriminated via a `?status=` query param
    on redirect, not separate paths — see `bkash_gateway.py` and payments.md PAY-14), so all three
    URL slots collapse to the single `bkash-callback` route; `ipn_url` is unused by bKash (no
    separate IPN concept) but returned anyway for interface uniformity across gateway types.
    """
    if gateway_type == GatewayType.bkash:
        callback = f"{backend_url}/api/v1/payments/gateway/{gateway_transaction_id}/bkash-callback"
        return callback, callback, callback, callback
    base_callback = f"{backend_url}/api/v1/payments/gateway/{gateway_transaction_id}/callback"
    return (
        f"{base_callback}/success",
        f"{base_callback}/fail",
        f"{base_callback}/cancel",
        f"{backend_url}/api/v1/payments/gateway/ipn",
    )


async def _get_enabled_gateway_types(db: AsyncSession, tenant_id: UUID) -> set[GatewayType]:
    result = await db.execute(
        select(TenantPaymentGateway).where(
            TenantPaymentGateway.tenant_id == tenant_id,
            TenantPaymentGateway.is_enabled.is_(True),
        )
    )
    return {row.gateway_type for row in result.scalars().all() if row.credentials_encrypted}


async def get_available_methods(db: AsyncSession, tenant_id: UUID) -> dict[str, bool]:
    enabled_types = await _get_enabled_gateway_types(db, tenant_id)
    return {
        "wallet": True,
        "simulation": True,
        "sslcommerz": GatewayType.sslcommerz in enabled_types,
        "bkash": GatewayType.bkash in enabled_types,
    }


async def get_guest_available_methods(db: AsyncSession, owner_tenant) -> dict[str, bool]:
    """RFC-011 Stage 3 — public-surface.md's GET /public/{public_slug}/payment-methods.
    No wallet (guests have no account); simulation/real-gateway options only appear at
    all when the venue has opted into guest_checkout_mode='online' — 'counter' means no
    online option whatsoever, not just no real gateway."""
    if owner_tenant is None or owner_tenant.guest_checkout_mode != "online":
        return {"wallet": False, "simulation": False, "sslcommerz": False, "bkash": False}

    enabled_types = await _get_enabled_gateway_types(db, owner_tenant.tenant_id)
    return {
        "wallet": False,
        "simulation": True,
        "sslcommerz": GatewayType.sslcommerz in enabled_types,
        "bkash": GatewayType.bkash in enabled_types,
    }

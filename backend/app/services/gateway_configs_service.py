from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_json, encrypt_json
from app.models.payment_gateway import GatewayType, TenantPaymentGateway
from app.schemas.payment_gateway import GatewayConfigMasked, GatewayConfigUpsert

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
    """Server-only — the returned dict may contain real secrets. Never expose via an API response."""
    row = await _get_row(db, tenant_id, gateway_type)
    if row is None or not row.is_enabled or not row.credentials_encrypted:
        return None

    secrets = decrypt_json(row.credentials_encrypted)
    public_fields = _PUBLIC_FIELDS[gateway_type]
    if row.public_identifier:
        if len(public_fields) == 1:
            secrets[public_fields[0]] = row.public_identifier
        else:
            secrets.update(json.loads(row.public_identifier))
    secrets["is_sandbox"] = row.is_sandbox
    return secrets


async def get_available_methods(db: AsyncSession, tenant_id: UUID) -> dict[str, bool]:
    result = await db.execute(
        select(TenantPaymentGateway).where(
            TenantPaymentGateway.tenant_id == tenant_id,
            TenantPaymentGateway.is_enabled.is_(True),
        )
    )
    enabled_types = {row.gateway_type for row in result.scalars().all() if row.credentials_encrypted}
    return {
        "wallet": True,
        "simulation": True,
        "sslcommerz": GatewayType.sslcommerz in enabled_types,
        "bkash": GatewayType.bkash in enabled_types,
    }

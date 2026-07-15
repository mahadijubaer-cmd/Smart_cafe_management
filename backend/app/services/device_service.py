"""Device terminal service: pairing, token lifecycle, playlist resolution
(RFC-010 / ADR-013, Phase 25). See specs/modules/devices.md.

Token model (ADR-013): opaque `scmsd_{k|s}_{token_urlsafe(32)}`; only the
SHA-256 hex digest is stored (devices.token_hash). Plaintext is returned once,
at pairing. Hot-path verification is cached in Redis for 60s; revocation
deletes the cache key so it takes effect on the next request.
"""
from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.device import Device, DeviceType, KioskConfig, SignagePlaylist
from app.models.tenant import Tenant, TenantType
from app.schemas.device import KIOSK_CONFIG_DEFAULTS

PAIR_CODE_TTL_SECONDS = 600          # DEV-2
AUTH_CACHE_TTL_SECONDS = 60          # ADR-013
LAST_SEEN_THROTTLE_SECONDS = 60      # DEV-9

_PAIR_KEY = "device:pair:{code}"
_AUTH_KEY = "device:auth:{token_hash}"
_SEEN_KEY = "device:seen:{device_id}"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_token(device_type: DeviceType) -> str:
    prefix = "k" if device_type == DeviceType.kiosk else "s"
    return f"scmsd_{prefix}_{secrets.token_urlsafe(32)}"


async def issue_pairing_code(device: Device) -> tuple[str, int]:
    """DEV-2: 6-digit single-use code, one live code per device."""
    redis = await get_redis()
    # Invalidate any previous live code for this device (best-effort scan-free:
    # we store a reverse pointer so we can delete the old code directly).
    reverse_key = f"device:pair:rev:{device.device_id}"
    old_code = await redis.get(reverse_key)
    if old_code:
        old_code = old_code.decode() if isinstance(old_code, bytes) else old_code
        await redis.delete(_PAIR_KEY.format(code=old_code))

    code = f"{secrets.randbelow(1_000_000):06d}"
    await redis.set(_PAIR_KEY.format(code=code), str(device.device_id), ex=PAIR_CODE_TTL_SECONDS)
    await redis.set(reverse_key, code, ex=PAIR_CODE_TTL_SECONDS)
    return code, PAIR_CODE_TTL_SECONDS


async def redeem_pairing_code(db: AsyncSession, code: str) -> tuple[Device, str] | None:
    """Atomically consume the code (GETDEL) and rotate the device token (DEV-4).

    Returns (device, plaintext_token) or None if the code is unknown/expired/used.
    """
    redis = await get_redis()
    device_id = await redis.getdel(_PAIR_KEY.format(code=code))
    if not device_id:
        return None
    device_id = device_id.decode() if isinstance(device_id, bytes) else device_id

    result = await db.execute(select(Device).where(Device.device_id == UUID(device_id)))
    device = result.scalar_one_or_none()
    if device is None:
        return None

    # Rotate: kill the old token's cache entry before overwriting the hash.
    if device.token_hash:
        await redis.delete(_AUTH_KEY.format(token_hash=device.token_hash))

    token = generate_token(device.device_type)
    device.token_hash = hash_token(token)
    device.token_prefix = token[:12]
    device.is_active = True
    device.paired_at = datetime.now(timezone.utc)
    await redis.delete(f"device:pair:rev:{device.device_id}")
    await db.commit()
    await db.refresh(device)
    return device, token


async def resolve_device_by_token(db: AsyncSession, token: str) -> Device | None:
    """Hash lookup with a short Redis cache in front (ADR-013). Returns the
    Device row (fresh scope — DEV-5) or None."""
    token_hash = hash_token(token)
    redis = await get_redis()
    cache_key = _AUTH_KEY.format(token_hash=token_hash)

    cached = await redis.get(cache_key)
    if cached:
        cached = cached.decode() if isinstance(cached, bytes) else cached
        try:
            device_id = UUID(json.loads(cached)["device_id"])
        except (json.JSONDecodeError, KeyError, ValueError):
            device_id = None
        if device_id:
            result = await db.execute(select(Device).where(Device.device_id == device_id))
            device = result.scalar_one_or_none()
            # Re-check liveness even on cache hit — the row is the truth.
            if device and device.is_active and device.token_hash == token_hash:
                await _touch_last_seen(db, device)
                return device
            await redis.delete(cache_key)
            return None

    result = await db.execute(
        select(Device).where(Device.token_hash == token_hash, Device.is_active.is_(True))
    )
    device = result.scalar_one_or_none()
    if device is None:
        return None

    await redis.set(cache_key, json.dumps({"device_id": str(device.device_id)}),
                    ex=AUTH_CACHE_TTL_SECONDS)
    await _touch_last_seen(db, device)
    return device


async def _touch_last_seen(db: AsyncSession, device: Device) -> None:
    """DEV-9: update last_seen_at at most once per LAST_SEEN_THROTTLE_SECONDS."""
    redis = await get_redis()
    seen_key = _SEEN_KEY.format(device_id=device.device_id)
    already = await redis.set(seen_key, "1", ex=LAST_SEEN_THROTTLE_SECONDS, nx=True)
    if already:  # nx=True -> truthy only when the key was newly set
        device.last_seen_at = datetime.now(timezone.utc)
        await db.commit()


async def revoke_device(db: AsyncSession, device: Device) -> None:
    """DEV-3: immediate revocation — null the hash, deactivate, drop caches."""
    redis = await get_redis()
    if device.token_hash:
        await redis.delete(_AUTH_KEY.format(token_hash=device.token_hash))
    await redis.delete(f"device:pair:rev:{device.device_id}")
    device.token_hash = None
    device.token_prefix = None
    device.is_active = False
    device.paired_at = None
    await db.commit()


async def device_scope_tenant_ids(db: AsyncSession, device: Device) -> set[UUID]:
    """DEV-5: the device's tenant, plus vendor children for a food-court device
    (kiosk sessions there split into per-vendor sibling orders)."""
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == device.tenant_id))
    tenant = result.scalar_one_or_none()
    ids = {device.tenant_id}
    if tenant is not None and tenant.tenant_type == TenantType.food_court:
        vendor_result = await db.execute(
            select(Tenant.tenant_id).where(
                Tenant.parent_tenant_id == device.tenant_id,
                Tenant.tenant_type == TenantType.food_court_vendor,
            )
        )
        ids |= set(vendor_result.scalars().all())
    return ids


async def resolve_kiosk_config(db: AsyncSession, tenant_id: UUID, outlet_id: UUID | None) -> dict:
    """Outlet row overrides tenant row; defaults fill the gaps (modules/kiosk.md)."""
    merged = dict(KIOSK_CONFIG_DEFAULTS)

    result = await db.execute(
        select(KioskConfig).where(
            KioskConfig.tenant_id == tenant_id, KioskConfig.outlet_id.is_(None)
        )
    )
    tenant_row = result.scalar_one_or_none()
    if tenant_row:
        merged.update(tenant_row.config or {})

    if outlet_id is not None:
        result = await db.execute(
            select(KioskConfig).where(
                KioskConfig.tenant_id == tenant_id, KioskConfig.outlet_id == outlet_id
            )
        )
        outlet_row = result.scalar_one_or_none()
        if outlet_row:
            merged.update(outlet_row.config or {})

    return merged


async def resolve_playlist(db: AsyncSession, device: Device) -> SignagePlaylist | None:
    """SGN-3: explicit assignment -> outlet default -> tenant default -> None."""
    assigned_id = (device.settings or {}).get("playlist_id")
    if assigned_id:
        try:
            assigned_uuid = UUID(str(assigned_id))
        except ValueError:
            assigned_uuid = None
        if assigned_uuid:
            result = await db.execute(
                select(SignagePlaylist).where(
                    SignagePlaylist.playlist_id == assigned_uuid,
                    SignagePlaylist.tenant_id == device.tenant_id,  # DEV-5
                    SignagePlaylist.is_active.is_(True),
                )
            )
            playlist = result.scalar_one_or_none()
            if playlist:
                return playlist

    if device.outlet_id is not None:
        result = await db.execute(
            select(SignagePlaylist).where(
                SignagePlaylist.tenant_id == device.tenant_id,
                SignagePlaylist.outlet_id == device.outlet_id,
                SignagePlaylist.is_default.is_(True),
                SignagePlaylist.is_active.is_(True),
            )
        )
        playlist = result.scalar_one_or_none()
        if playlist:
            return playlist

    result = await db.execute(
        select(SignagePlaylist).where(
            SignagePlaylist.tenant_id == device.tenant_id,
            SignagePlaylist.outlet_id.is_(None),
            SignagePlaylist.is_default.is_(True),
            SignagePlaylist.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()

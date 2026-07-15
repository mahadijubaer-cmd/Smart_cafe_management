# Module: Devices (Terminal Registry, Pairing, Device Auth)

**Status:** ✅ Implemented (Phase 25.1, RFC-010 / ADR-013)
**Routers:** `backend/app/routers/devices.py` (admin, JWT, `/api/v1/devices`) ·
`backend/app/routers/device_api.py` (device-facing, `X-Device-Token`, `/api/v1/device`)
**Model:** `backend/app/models/device.py` · **Schemas:** `backend/app/schemas/device.py`
**Service:** `backend/app/services/device_service.py`
**Related:** `modules/kiosk.md`, `modules/signage.md`, `modules/websocket.md`,
`system/data-model.md`, `system/security.md`, `decisions/adrs/ADR-013-device-token-auth.md`

---

## Overview

A **device** is a registered piece of venue hardware — a self-service kiosk or a signage display —
bound to one tenant (optionally one outlet). Devices authenticate with a long-lived, revocable,
opaque token (ADR-013), never a user JWT. This module owns the registry, the pairing flow, the
`get_current_device()` dependency, and the device-facing API surface shared by both device types.
Kiosk-specific behaviour lives in `modules/kiosk.md`; signage-specific behaviour in
`modules/signage.md`.

---

## Device Auth Dependency

`core/dependencies.py` gains:

- `DeviceContext` — `device_id, tenant_id, tenant_type, outlet_id, device_type, settings`.
- `get_current_device()` — reads `X-Device-Token` header (REST) or `?token=` (WS); SHA-256-hashes it;
  checks Redis `device:auth:{token_hash}` (TTL 60 s), falling back to a `devices` row lookup
  (`token_hash` match, `is_active=TRUE`, owning tenant `is_active=TRUE`), caching the result.
  Updates `last_seen_at` at most once per 60 s (Redis throttle flag `device:seen:{device_id}`).
  Missing/unknown/revoked token → `401`.
- `require_device_type(device_type)` — factory mirroring `require_role()`; wrong type → `403`.

A device token is never accepted by user-JWT endpoints, and a user JWT is never accepted by
`/device/*` endpoints.

---

## API Endpoints — Admin Registry (`/api/v1/devices`, JWT, `ADMIN_ROLES`)

### `POST /devices`
Body: `{name: str 1–80, device_type: "kiosk"|"signage", outlet_id?: UUID, settings?: object}`.
`outlet_id` must be within the caller's `accessible_tenant_ids()` (food-court/franchise family
scope) → else `404`. Creates an **unpaired** row (`token_hash=NULL`). Response `201`: `DeviceResponse`.

### `GET /devices`
List for the caller's accessible tenants: `device_id, name, device_type, outlet_id, is_active,
paired (bool, token_hash != NULL), token_prefix, paired_at, last_seen_at, settings, created_at`.

### `PATCH /devices/{device_id}`
Update `name`, `settings`, `is_active`, `outlet_id`. Scope-checked. Deactivating (`is_active=false`)
does **not** clear the hash (reactivation restores service); revocation does (below).

### `POST /devices/{device_id}/pairing-code`
Generates a 6-digit numeric code → Redis `device:pair:{code} = device_id`, TTL 600 s, single-use.
Any previous unexpired code for this device is deleted first (one live code per device).
Response: `{code: "483920", expires_in: 600}`. Works for paired devices too — redemption rotates the
token (DEV-4).

### `POST /devices/{device_id}/revoke`
Sets `token_hash=NULL, token_prefix=NULL, is_active=FALSE, paired_at=NULL`; deletes
`device:auth:{old_hash}`; publishes targeted `DEVICE_REVOKED` (see `modules/websocket.md`) so a live
device wipes its stored token and returns to its pairing screen. Response `200`.

### `DELETE /devices/{device_id}`
Hard delete (same cache/WS cleanup as revoke). `204`.

---

## API Endpoints — Device-Facing (`/api/v1/device`)

### `POST /device/pair` — **unauthenticated**, rate-limited 5/min/IP (Redis fixed window, PUB-2 pattern)
Body: `{code: str}`. `GETDEL device:pair:{code}` → miss = `404` (expired/unknown/used). Generates
token `scmsd_{k|s}_{token_urlsafe(32)}`; stores hash + prefix + `paired_at=now()`,
`is_active=TRUE`; invalidates any previous auth-cache entry. Response `201`:

```jsonc
{
  "device_token": "scmsd_k_...",        // plaintext — shown exactly once, never again
  "device_id": "...", "device_type": "kiosk",
  "tenant_id": "...", "tenant_slug": "...", "tenant_name": "...",
  "brand_color": "#1A4D2E", "outlet_id": null,
  "settings": { }, "kiosk_config": { }   // kiosk devices only, resolved (see modules/kiosk.md)
}
```

### `GET /device/me` — any device
Same profile shape as pairing (minus `device_token`). Used as heartbeat + config refresh (kiosks
re-fetch on `KIOSK_CONFIG_UPDATED`).

### `GET /device/menu` — any device
Same payload shape as `GET /public/{public_slug}/menu` (incl. food-court vendor aggregation),
produced by the **shared menu builder** extracted from `routers/public.py` into
`services/menu_service.py` (RFC-010; see `modules/public-surface.md`). Adds `allergens` and
`dietary_tags` per item (`modules/menu.md`). Does **not** require `public_menu_enabled` — the gate
is the device credential (DEV-6). Redis cache `device:menu:{tenant_id}`, TTL 60 s.

### Kiosk-only (see `modules/kiosk.md` for full schemas)
- `POST /device/orders` — create kiosk order
- `GET /device/orders/{guest_token}` — track an order this device created

### Signage-only (see `modules/signage.md` for full schemas)
- `GET /device/playlist` — resolved playlist + slides
- `GET /device/orders/board` — open orders (pickup numbers) for the order-status slide
- `GET /device/trending` — top-N items over a window

### `WS /ws/device?token={device_token}`
See `modules/websocket.md`.

---

## Business Rules

### DEV-1: Token Hashed at Rest, Shown Once
`devices.token_hash = sha256(plaintext)`; plaintext is returned only in the `POST /device/pair`
response and never stored or logged. `token_prefix` (first 12 chars) is the only admin-visible
remnant.

### DEV-2: Pairing Codes Are Single-Use and Short-Lived
6 digits, TTL 600 s, consumed atomically with `GETDEL`. One live code per device. Redemption is
rate-limited 5/min/IP.

### DEV-3: Revocation Is Immediate
Revoke deletes the Redis auth-cache entry, so the credential dies on the next request (worst case
60 s for other app instances' caches). Connected devices also receive targeted `DEVICE_REVOKED`.

### DEV-4: Re-Pairing Rotates
Redeeming a new pairing code for an already-paired device overwrites `token_hash` — the old token is
invalid from that moment.

### DEV-5: Device Scope = Its Tenant (+ Outlet)
Every device query/mutation is scoped to `device.tenant_id` (and `outlet_id` when set), resolved
fresh from the row on every request — never from the token. Cross-tenant access → `404`.

### DEV-6: Device Credential Replaces the Public-Menu Gate
`/device/*` does not check `public_menu_enabled` or segment for reads: the admin registered the
hardware, which is a stronger grant than the public toggle. (Kiosk ordering has its own rule
KSK-2 in `modules/kiosk.md`.)

### DEV-7: Least Privilege
Device endpoints are read-only **except** `POST /device/orders` (kiosk). A device token is never
valid on any `/api/v1` router other than `/device/*` and `/ws/device`.

### DEV-8: Type Gating
Kiosk-only endpoints reject signage devices with `403`, and vice versa (`require_device_type`).

### DEV-9: Last-Seen Tracking
`last_seen_at` is updated (throttled to once/60 s) on any authenticated device request; the admin
Devices page derives an online/stale badge from it (stale = no contact for > 5 min).

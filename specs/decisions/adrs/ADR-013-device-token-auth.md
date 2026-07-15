# ADR-013: Opaque Hashed Device Tokens (not JWT) for Terminal Authentication

**Date:** 2026-07-15
**Status:** Accepted
**Deciders:** Mahadi Jubaer (22301162)

---

## Context

RFC-010 introduces unattended venue hardware (kiosks, signage displays) that must call the API for
months without a human logging in. All existing auth is short-lived user JWT (HS256, tenant claims,
Redis `blacklist:jti:*` revocation sized to token TTL). The existing signage prototype misuses a
staff JWT stored in the browser — it expires, and a stolen display yields a staff credential.

Constraints:
- Credential must live for months yet be revocable **instantly** (a display can be stolen off a wall).
- Compromise blast radius must be minimal: read menu/playlist + create kiosk orders for one
  tenant/outlet — never staff/admin capability.
- Hot path (every device request) must stay cheap.
- Precedents in this codebase: opaque `guest_token` capability tokens (RFC-007) resolved by a single
  indexed lookup.

Alternatives considered:
1. **Long-lived JWT with device claims** — revocation requires a blacklist entry that must outlive
   the token (years), inverting the existing short-TTL blacklist design; scope changes (outlet
   rebinding, deactivation) don't apply until re-issue.
2. **Short-lived JWT + refresh token** — refresh machinery for a headless device adds failure modes
   (display bricked when refresh fails at 2 a.m.) with no security gain over an opaque token that is
   checked against the DB anyway.
3. **Opaque random token, SHA-256 hash stored in DB** — chosen.

## Decision

- Token format: `scmsd_{k|s}_{secrets.token_urlsafe(32)}` — prefix identifies the token class in
  logs/secret-scanning (`k` = kiosk, `s` = signage).
- Storage: `devices.token_hash = sha256(token)` (unique), plus `token_prefix` (first 12 chars) for
  admin display. Plaintext is returned exactly once, at pairing; never stored or logged.
- Pairing: admin generates a 6-digit code → Redis `device:pair:{code}` → device_id, TTL 600 s,
  single-use (GETDEL). Device redeems it at unauthenticated `POST /api/v1/device/pair`
  (rate-limited 5/min/IP). Generating a new code for a paired device rotates: redemption overwrites
  the hash, invalidating the old token.
- Verification: `get_current_device()` reads `X-Device-Token` (REST) or `?token=` (WS), hashes,
  checks Redis cache `device:auth:{token_hash}` (TTL 60 s) then the `devices` row
  (`is_active`, tenant `is_active`). Scope (tenant_id, outlet_id, device_type, settings) is read
  from the row, never from the token.
- Revocation: null `token_hash`, set `is_active = false`, delete the Redis cache key, publish
  targeted `DEVICE_REVOKED` so a live device wipes its stored token and returns to pairing.
- Authorization: device endpoints are limited to menu/playlist/trending/board reads and kiosk order
  creation, enforced by `require_device_type()`; a device token is never accepted by user-JWT
  endpoints.

## Rationale

- Instant, stateless-client revocation: flipping the row kills the credential on next request
  (≤60 s cache TTL), with no long-lived blacklist to maintain.
- Fresh scope on every request: rebinding a device to another outlet or deactivating it applies
  immediately — a JWT would carry stale claims until re-issue.
- Symmetry with the proven `guest_token` pattern: one indexed lookup, same cost profile; the Redis
  cache makes the hot path a single Redis GET.
- Hashing at rest means a DB leak does not leak usable credentials (unlike storing raw tokens, and
  unlike HS256 JWTs where the shared secret signs *all* tokens).

## Consequences

**Positive:**
- Stolen device ≠ stolen staff credential; blast radius is one device's read scope.
- Admins see prefix + last-seen, can rotate/revoke from the Devices page with immediate effect.

**Negative:**
- Every device request touches Redis (and DB on cache miss) — accepted; identical to guest-token cost.
- A new auth code path (`get_current_device`) must be maintained alongside user JWT auth.

**Neutral / Trade-offs:**
- Revocation propagates within the 60 s auth-cache TTL rather than instantaneously; the targeted
  `DEVICE_REVOKED` WS event closes the gap for connected devices.
- Tokens live in device `localStorage` — acceptable for venue-owned hardware in kiosk-mode browsers;
  documented in `system/security.md`.

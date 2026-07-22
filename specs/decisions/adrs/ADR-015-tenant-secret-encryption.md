# ADR-015: At-Rest Encryption for Per-Tenant Payment Gateway Credentials

**Date:** 2026-07-22
**Status:** Accepted
**Deciders:** Mahadi Jubaer

---

## Context

RFC-011 (payment gateway integration) requires storing each tenant's own SSLCommerz/bKash merchant
credentials (store password, app secret, etc.) in the database, since the backend must decrypt and
forward them on every gateway API call. This is a fundamentally different requirement from every
existing secret in this codebase.

Grepped the full backend for any existing precedent: `backend/app/core/config.py` holds exactly one
class of secret — platform-wide, single-value, unencrypted environment variables (`SECRET_KEY` for
JWT signing, `BREVO_API_KEY`, Backblaze B2 keys, SMTP credentials). None are per-tenant, none are
stored in the database, none are encrypted — they only ever live in process environment. The closest
per-tenant *credential* precedent, ADR-013's device tokens, is a **one-way hash**
(`devices.token_hash = sha256(token)`), used to verify a bearer already possesses a secret the
platform itself issued once and never needs to see again. That's the wrong shape here: the platform
must recover the *plaintext* of a tenant's merchant password to call SSLCommerz/bKash's own API —
hashing is not applicable, symmetric encryption is required.

No `cryptography.fernet`, KMS, or vault integration exists anywhere in this codebase today. The
`cryptography` package itself is present only as a **transitive** dependency (`python-jose[cryptography]`,
used for JWT signing) — never imported directly for anything else.

## Decision

1. **New setting `Settings.ENCRYPTION_KEY`** (`backend/app/core/config.py`) — a base64-encoded 32-byte
   Fernet key (`cryptography.fernet.Fernet.generate_key()`), platform-wide, env-var-sourced exactly
   like `SECRET_KEY` — this key encrypts every tenant's gateway secrets; it is not per-tenant itself.
2. **New `backend/app/core/crypto.py`**: `encrypt_json(data: dict) -> str` / `decrypt_json(blob: str)
   -> dict`, thin wrappers around `Fernet(settings.ENCRYPTION_KEY.encode())`. `encrypt_json` raises a
   clear `RuntimeError` if `ENCRYPTION_KEY` is unset — **fail loudly, never silently store
   plaintext or silently no-op.**
3. **Split storage: only genuinely secret fields are encrypted.** `tenant_payment_gateways` has a
   plain `public_identifier` column (SSLCommerz `store_id`, bKash `username`+`app_key`) alongside
   `credentials_encrypted` (a Fernet-encrypted JSON blob holding only `store_password` /
   `app_secret`+`password`). The admin's masked-list `GET /payment-gateways/me` therefore never needs
   to call `decrypt_json` at all — it renders `public_identifier` directly and a fixed masked
   placeholder for whatever the encrypted blob holds, eliminating an entire class of
   accidental-secret-leak bug on that hot read path.
4. **`cryptography` becomes an explicit, pinned direct dependency** (`backend/requirements.txt` /
   `pyproject.toml`), not left as an unpinned transitive one.
5. **Deliberately does NOT follow this codebase's existing "quietly degrade" pattern** for optional
   integrations (`config.py`'s `b2_enabled`/`mail_enabled`/`brevo_enabled` properties, which let the
   app run fine with a feature simply switched off when unconfigured). A payment credential save with
   `ENCRYPTION_KEY` unset must hard-fail the request (clear `500`/`400` error), because the
   alternative — silently persisting a merchant password in plaintext — is not an acceptable degraded
   mode for a secret of this sensitivity.

## Rationale

A dedicated symmetric-encryption layer is unavoidable: nothing existing fits the requirement (must
decrypt server-side, per-tenant, multiple independent secrets). Fernet is chosen over a bespoke
AES-GCM implementation because it's already transitively vendored via `python-jose[cryptography]`
(no new supply-chain footprint beyond pinning it directly), is authenticated encryption by default
(prevents tampering, not just confidentiality), and needs no IV/nonce management by the caller — the
lowest-risk correct choice for a small, single-key, few-secrets-per-tenant use case at this app's
scale (per ADR-001, sub-100-tenant). Splitting secret vs. non-secret fields into separate storage is
a small modeling cost that pays for itself the first time someone reviews or debugs the admin list
endpoint's code and can see, by inspection, that it's structurally incapable of leaking a decrypted
secret — that property is worth more than the minor convenience of one flat encrypted blob.

## Consequences

**Positive:**
- A new, reusable `encrypt_json`/`decrypt_json` primitive exists for any future per-tenant secret
  this codebase needs (there is currently exactly one consumer, but the interface is generic).
- The admin masked-list read path is structurally incapable of decrypting a secret, by construction.
- Fail-loud behavior surfaces a misconfigured `ENCRYPTION_KEY` immediately at the point of harm (a
  credential save), not as a silent security gap discovered later.

**Negative:**
- A new required-in-production secret (`ENCRYPTION_KEY`) to provision and document
  (`specs/operations/deployment.md`), on top of the existing `SECRET_KEY`/Brevo/B2 secrets — one more
  thing that must be present and consistent across deploys (rotating it without a re-encryption
  migration path would make existing stored credentials undecryptable; not needed for this initial
  build, flagged here for awareness if rotation is ever requested).

**Neutral / Trade-offs:**
- This is a single-key (not per-tenant-key, not KMS-backed) scheme — appropriate at this app's
  confirmed scale (ADR-001) and consistent with every other secret in this codebase being a single
  platform-wide value; a multi-tenant SaaS at far larger scale would likely graduate to a real KMS,
  which is explicitly out of scope here.

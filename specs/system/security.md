# Security

**Last verified against code:** 2026-06-30

---

## 1. JWT (Access Token)

**Library:** python-jose  
**Algorithm:** HS256  
**Secret:** `SECRET_KEY` env var (must be ≥ 32 characters in production)  
**Expiry:** `ACCESS_TOKEN_EXPIRE_MINUTES` env var (default: 60 minutes)  
**No refresh token** — planned Phase 19

### JWT Payload Claims

| Claim | Type | Source |
|---|---|---|
| `sub` | str (UUID) | `user.user_id` |
| `role` | str | `user.role.value` (one of 10 UserRole values) |
| `tenant_id` | str (UUID) | `tenant.tenant_id` |
| `tenant_type` | str | `tenant.tenant_type.value` |
| `tenant_slug` | str | `tenant.slug` |
| `outlet_id` | str (UUID) \| null | `user.outlet_id` if set |
| `exp` | int | Unix timestamp (now + ACCESS_TOKEN_EXPIRE_MINUTES) |
| `jti` | str (UUID4) | Auto-generated per token — used for blacklisting |

> Note: `brand_color` is decoded from JWT by the **frontend** (`src/lib/auth.ts`) but is NOT in the backend JWT payload. The frontend reads it from the tenant profile separately.

### Token Creation (code: `backend/app/core/security.py`)

```python
to_encode = {
    "sub": str(user.user_id),
    "role": user.role.value,
    "tenant_id": str(tenant.tenant_id),
    "tenant_type": tenant.tenant_type.value,
    "tenant_slug": tenant.slug,
    "outlet_id": str(user.outlet_id) if user.outlet_id else None,
    "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    "jti": str(uuid.uuid4()),
}
token = jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
```

### Impersonation Claim (RFC-009, Platform Admin Control Plane)

`AuthService.create_access_token()` accepts an optional `extra_claims: dict | None` param, merged
into `to_encode` before signing. The only current use is
`POST /platform/tenants/{tenant_id}/impersonate` (`platform_admin`-only), which mints a token with:

- `sub` = the **real, calling platform admin's** `user_id` — not a synthetic user
- `tenant_id`/`tenant_type`/`tenant_slug` = the **target** tenant's, not the platform admin's own
- `role` = the platform admin's real role (`platform_admin`, unchanged)
- `impersonation: true` (new claim, extra_claims)
- `expires_delta=timedelta(minutes=15)` — much shorter than the default 60-minute expiry

No new verification logic is needed anywhere: `require_role()` checks the DB-loaded user's real role
(still `platform_admin`, a member of `ADMIN_ROLES`), and `TenantContextMiddleware` scopes the request
purely from the `tenant_id`/`tenant_type`/`tenant_slug` claims — both already correct by construction.
The frontend reads the `impersonation` claim (`src/lib/auth.ts`) purely for UI purposes (the
persistent "Viewing as..." banner) — it carries no server-side authorization meaning. See
`specs/modules/platform.md` (PA-4) and `RFC-009` §2.7 for the full design rationale.

---

## 2. Password Hashing

**Library:** passlib  
**Scheme:** `pbkdf2_sha256`  
**Configuration:** `CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")`

Minimum password length: **8 characters** (enforced by `UserCreate.password` Pydantic validator).  
Passwords are never stored in plaintext or returned in any response.

---

## 3. Token Blacklist (Logout)

On `POST /auth/logout`:
- Extracts `jti` from the decoded JWT
- Writes Redis key: `blacklist:jti:{jti}`
- TTL: `token.exp - now()` seconds — key auto-expires when the token would have expired anyway

On every authenticated request (`get_current_user()` dependency):
- Checks `EXISTS blacklist:jti:{jti}` in Redis
- If key exists: returns `401 "Token has been revoked"`

---

## 4. Rate Limiting

**Library:** slowapi (starlette wrapper for `limits`)  
**Backend:** Redis (same instance as rest of application)  
**Scope:** Per IP address

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 10 requests / minute |
| `POST /auth/register` | 5 requests / minute |
| `POST /otp/send` | 3 requests / 10 minutes |

When exceeded: `429 Too Many Requests`

OTP attempt limiting is a business rule (not a rate limiter): 5 wrong codes → OTP key deleted → must request new OTP. See `modules/auth.md` → OTP-2.

---

## 5. CORS Policy

**Library:** FastAPI `CORSMiddleware`

| Setting | Value |
|---|---|
| `allow_origins` | Value of `CORS_ORIGINS` env var (default: `["http://localhost:3000"]`) |
| `allow_credentials` | `True` |
| `allow_methods` | `["*"]` |
| `allow_headers` | `["*"]` |

**Production rule:** `CORS_ORIGINS` must be set to the exact frontend origin (e.g. `https://scms.bracu.ac.bd`). The wildcard `"*"` is invalid when `allow_credentials=True`.

---

## 6. Role-Based Access Control (RBAC)

Role groups are defined in `backend/app/core/dependencies.py` and used as FastAPI dependencies on every endpoint.

```python
CUSTOMER_ROLES  = (UserRole.customer, UserRole.student)

ADMIN_ROLES     = (UserRole.outlet_admin, UserRole.tenant_admin,
                   UserRole.food_court_admin, UserRole.super_admin,
                   UserRole.platform_admin)

FLOOR_STAFF_ROLES = (UserRole.staff, UserRole.cleaner, UserRole.server)

ALL_STAFF       = ADMIN_ROLES + FLOOR_STAFF_ROLES
```

The `require_role(*roles)` dependency raises `403 "Insufficient permissions"` if the authenticated user's role is not in the allowed set.

**Role escalation prevention:** Self-registration only allows `student` or `customer`. All other role assignments require an authenticated admin action (Phase 21 invite flow).

### Full Permissions Matrix

| Endpoint area | customer / student | staff | cleaner | server | outlet/tenant/food_court admin | super_admin | platform_admin |
|---|---|---|---|---|---|---|---|
| `GET /menu/*` | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `POST/PUT/DELETE /menu/*` | — | — | — | — | ✓ | ✓ | ✓ |
| `POST /orders/` | ✓ | — | — | — | — | — | — |
| `GET /orders/` | own only | all | — | — | all | all | all |
| `PATCH /orders/{id}/status` | — | ✓ | — | — | ✓ | ✓ | ✓ |
| `DELETE /orders/{id}` | own pending | — | — | — | — | — | — |
| `GET /tables/` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /tables/` | — | — | — | — | ✓ | ✓ | ✓ |
| `PATCH /tables/{id}/status` | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /cleaners/logs` | — | — | own | — | all | all | all |
| `POST /cleaners/logs` | — | — | — | — | ✓ | ✓ | ✓ |
| `PATCH /cleaners/logs/{id}/complete` | — | — | own | — | ✓ | ✓ | ✓ |
| `GET /inventory/*` | — | — | — | — | ✓ (not food_court_admin) | ✓ | ✓ |
| `POST/PUT/PATCH /inventory/*` | — | — | — | — | ✓ (not food_court_admin) | ✓ | ✓ |
| `POST /payments/pay` | ✓ | — | — | — | — | — | — |
| `POST /payments/topup` | ✓ | — | — | — | — | — | — |
| `GET /payments/history` | own | — | — | — | — | — | — |
| `GET /analytics/*` | — | — | — | — | ✓ | ✓ | ✓ |
| `/food-court/*` | customer ✓ | — | ✓ | ✓ | food_court_admin ✓ | — | — |
| `GET /tenants/*` | — | — | — | — | — | — | ✓ |
| `POST /memo/generate` | — | ✓ | — | — | outlet_admin, tenant_admin ✓ | — | — |
| `GET /qr/order/*` | own | — | — | — | ✓ | ✓ | ✓ |
| `GET /qr/table/*` | — | — | — | — | ✓ | ✓ | ✓ |
| `GET /receipts/*` | own | — | — | — | ✓ | ✓ | ✓ |

---

## 7. Input Validation

All request bodies are validated by **Pydantic v2** before reaching any router function.

- Type coercion is strict: wrong type → `422`
- Pattern validation prevents invalid enum-like string values
- Email validated by `EmailStr` (format check; no DNS lookup)
- Decimal fields prevent float imprecision for monetary/quantity values
- SQL injection: impossible — all queries use SQLAlchemy ORM with parameterized bindings
- XSS: not applicable at REST API layer (all responses are JSON); React escapes by default in the frontend

---

## 8. WebSocket Security

- Token passed as URL query parameter: `?token={jwt}`
- Server validates: JWT signature, expiry, Redis blacklist, `user_id` in URL path = JWT `sub`
- Connection dropped immediately if any check fails (no WS handshake completed)
- After connection: server pushes only; client can send PING (`{"type": "PING"}`) to receive PONG

---

## 8a. Device Credentials (Kiosk / Signage Terminals) ✅ Implemented (Phase 25, RFC-010 / ADR-013)

A second credential class alongside user JWTs, for unattended venue hardware:

- **Format:** opaque `scmsd_{k|s}_{token_urlsafe(32)}`; stored as `devices.token_hash =
  sha256(token)` — plaintext returned exactly once at pairing, never stored or logged.
- **Issuance:** admin-generated 6-digit pairing code (Redis, TTL 600 s, single-use GETDEL) redeemed
  at unauthenticated `POST /device/pair`, rate-limited 5/min/IP.
- **Verification:** `get_current_device()` — hash lookup with 60 s Redis cache; scope
  (tenant/outlet/type) read fresh from the row on every request, never from the token.
- **Revocation:** immediate — null the hash, delete the cache key, push targeted `DEVICE_REVOKED`.
- **Least privilege:** device tokens work only on `/device/*` and `/ws/device`; reads plus kiosk
  order creation, nothing else. Never interchangeable with user JWTs in either direction.
- **WS:** `ws://host/ws/device?token={device_token}` — same query-param transport as user WS,
  validated by the device hash lookup instead of JWT checks.

**PCI-DSS scoping statement (KSK-1):** kiosks take no payment input of any kind — orders are
settled at the counter via the existing mark-paid flow. No cardholder data exists anywhere in SCMS,
keeping the entire system out of PCI-DSS scope. Any future kiosk payment feature must re-evaluate
this boundary before implementation.

---

## 8b. Payment Gateway Credential Encryption (RFC-011 / ADR-015)

A new secret class: each tenant's own SSLCommerz/bKash merchant credentials, stored in
`tenant_payment_gateways.credentials_encrypted`.

- **Format:** Fernet symmetric encryption (`cryptography.fernet`), keyed by a new platform-wide
  `ENCRYPTION_KEY` setting — see ADR-015 for why Fernet and why platform-wide rather than per-tenant.
- **Split storage:** only the genuinely secret sub-fields are encrypted (SSLCommerz `store_password`;
  bKash `app_secret`/`password`). Non-secret identifiers (`store_id`, bKash `username`/`app_key`) are
  plaintext in `public_identifier` — the admin's masked-list `GET /payment-gateways/me` never
  decrypts anything to render.
- **Fail-loud, not quiet-degrade:** unlike this codebase's existing optional-integration pattern
  (B2/mail/Brevo, which run fine unconfigured), a credential save with `ENCRYPTION_KEY` unset is a
  hard error — never silently persists plaintext.
- **Never returned decrypted via any API response**, including the admin's own config endpoints —
  decryption happens only server-side, immediately before a live gateway API call.

**PCI-DSS scoping statement (KSK-2):** payment gateway checkout is a **redirect to the gateway's own
hosted page** (SSLCommerz Session API, bKash Tokenized Checkout) — SCMS itself never receives, stores,
or transmits cardholder data or mobile-banking credentials at any point; the browser navigates away to
the gateway and back. This keeps SCMS out of PCI-DSS scope for the same reason KSK-1 does for kiosks —
no cardholder data ever reaches this system. Any future in-app card-entry form (rather than a hosted
redirect) would require re-evaluating this boundary.

---

## 9. Secrets Management

| Secret | Env Var | Minimum |
|---|---|---|
| JWT signing key | `SECRET_KEY` | 32 characters |
| Database password | `POSTGRES_PASSWORD` | 16 characters recommended |
| Redis password | `REDIS_PASSWORD` | — (optional) |
| Email SMTP credentials | `MAIL_USERNAME`, `MAIL_PASSWORD` | — |
| Tenant payment-gateway credential encryption key (RFC-011/ADR-015) | `ENCRYPTION_KEY` | Fernet key — `Fernet.generate_key()` |

Rules:
- `.env` is in `.gitignore` — never commit it
- `.env.example` contains only placeholder values, never real credentials
- Production secrets managed via Docker `env_file` or Kubernetes secrets

---

## 10. Known Security Gaps (Planned)

| Gap | Planned Phase |
|---|---|
| No refresh token — users must re-login after expiry | 19 |
| No account lockout after N failed logins | 19 |
| No audit log of admin actions | 22 |
| No global API rate limit (only auth + OTP routes) | 19 |
| HTTPS not enforced in development Docker setup | Deployment (reverse proxy) |
| No Content-Security-Policy header | Future |

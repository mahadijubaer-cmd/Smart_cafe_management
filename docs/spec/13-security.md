# Spec 13 — Security

**Last updated:** 2026-06-30  
**Status:** Authoritative

> This file documents every security control applied to the SCMS backend. When adding a new endpoint or changing auth behaviour, cross-check this file and update it if needed.

---

## 1. Authentication

### JWT — Access Token

- **Algorithm:** HS256
- **Payload claims:**

| Claim | Type | Value |
|---|---|---|
| `sub` | str | `user_id` (UUID) |
| `user_id` | str | UUID — explicit (redundant with `sub`, kept for client convenience) |
| `tenant_id` | str | UUID |
| `tenant_type` | str | One of 7 TenantType values |
| `tenant_slug` | str | e.g. `"bracu"` |
| `outlet_id` | str \| null | UUID if user belongs to a franchise outlet |
| `role` | str | One of 10 UserRole values |
| `brand_color` | str | e.g. `"#1A4D2E"` |
| `jti` | str | UUID — unique per token; used for blacklisting |
| `exp` | int | Unix timestamp (expiry) |

- **Secret:** `JWT_SECRET_KEY` env var (must be ≥ 32 characters in production; see `09-deployment.md`)
- **Expiry:** Configured by `JWT_EXPIRE_MINUTES` env var (default: 60 minutes)
- **No refresh token currently.** Planned for Phase 19.

### Token Blacklist (Logout)

On `POST /auth/logout`:
- Redis key: `blacklist:jti:{jti}` where `{jti}` is the UUID from the JWT payload
- TTL: `(token.exp - now)` seconds — key expires when the token would have expired anyway, so Redis doesn't accumulate stale blacklist entries
- On every authenticated request: `get_current_user()` checks `EXIST blacklist:jti:{jti}` before accepting the token. If key exists → `401 "Token has been revoked"`.

### Password Hashing

- Library: **passlib** with **bcrypt** (12 rounds)
- Passwords are never stored in plaintext
- Minimum password length: **8 characters** (enforced by `UserCreate.password` validator)
- No maximum enforced in schema, but bcrypt truncates at 72 bytes

---

## 2. Rate Limiting

Library: **slowapi** (starlette-compatible wrapper around limits/redis).

Rate limits are applied per-IP address using Redis as the backend counter.

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 10 requests / minute |
| `POST /auth/register` | 5 requests / minute |
| `POST /otp/send` | 3 requests / 10 minutes per email |
| `POST /otp/verify` | 5 attempts before OTP is invalidated (business rule OTP-2; not a rate limiter) |
| All other endpoints | No global limit currently applied (planned Phase 19) |

When rate limit is exceeded: `429 Too Many Requests` with header:
```
Retry-After: <seconds>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: 0
```

---

## 3. CORS Policy

Library: FastAPI's built-in `CORSMiddleware`.

| Setting | Value |
|---|---|
| `allow_origins` | `["http://localhost:3000"]` in development; controlled by `ALLOWED_ORIGINS` env var in production |
| `allow_credentials` | `True` |
| `allow_methods` | `["*"]` |
| `allow_headers` | `["*"]` |

**Production rule:** `ALLOWED_ORIGINS` must be set to exact frontend origin(s). The wildcard `"*"` is never used in production because `allow_credentials=True` makes `"*"` origin invalid per CORS spec.

---

## 4. Tenant Isolation (Multi-Tenancy Security)

Full multi-tenancy is enforced at three layers. See `01-architecture.md` → Tenant Isolation Model for the full diagram.

### Layer 1 — Middleware (`TenantContextMiddleware`)

- Reads `Authorization: Bearer <jwt>` header
- Decodes JWT with `JWT_SECRET_KEY`; does NOT hit the database
- Extracts `tenant_id`, `tenant_type`, `tenant_slug`, `outlet_id` from JWT claims
- Populates `request.state.tenant_ctx` for all downstream handlers
- On failure (expired token, bad signature, missing header): sets `tenant_ctx = None`; unauthenticated routes are unaffected, authenticated routes return 401

### Layer 2 — Dependency (`get_current_user` in `dependencies.py`)

- Verifies `tenant_ctx` is not None (not unauthenticated)
- Checks Redis blacklist: `EXISTS blacklist:jti:{jti}` → 401 if found
- No database lookup on every request (token is self-contained)
- No cross-check between JWT tenant and request URL slug — slug is only for routing

### Layer 3 — Data Query

- Every DB query on a tenant-scoped table MUST include `.where(Model.tenant_id == ctx.tenant_id)`
- Absence of this filter is a **critical security bug** (rule TI-1)
- Foreign key resolves within the same `tenant_id` → a user cannot reference another tenant's order/item/table by guessing its UUID

---

## 5. Role-Based Access Control (RBAC)

Role groups defined in `backend/app/core/dependencies.py`:

```python
CUSTOMER_ROLES = (UserRole.customer, UserRole.student)
ADMIN_ROLES = (UserRole.outlet_admin, UserRole.tenant_admin, 
               UserRole.food_court_admin, UserRole.super_admin, UserRole.platform_admin)
STAFF_ROLES = (UserRole.staff,)
CLEANER_ROLES = (UserRole.cleaner,)
SERVER_ROLES = (UserRole.server,)
ALL_STAFF = ADMIN_ROLES + STAFF_ROLES + CLEANER_ROLES + SERVER_ROLES
```

Role checks use FastAPI dependencies injected per endpoint. See `03-auth.md` → Permissions Matrix for full access table.

**Escalation prevention:** A user cannot self-assign a role above `customer` or `student` during registration. Admin role assignment requires an authenticated admin to call `PATCH /users/{user_id}` (planned Phase 21 invite flow).

---

## 6. Input Validation

All request bodies are validated by Pydantic v2 before reaching any router function.

- **Type coercion is strict:** An integer field receiving a string returns 422 (not silently coerced)
- **Pattern validation** prevents invalid values for controlled fields (OTP purpose, payment method, slug)
- **Email validation** uses Pydantic `EmailStr` (DNS lookup NOT performed — format check only)
- **Decimal fields** prevent floating-point imprecision for monetary values
- **Length constraints** prevent buffer-related issues: see `12-schemas.md` for all length constraints

**SQL Injection:** Not possible — all queries use SQLAlchemy ORM with parameterized bindings. No raw SQL strings with user input.

**XSS:** Not applicable at the REST API layer (all responses are JSON). The Next.js frontend uses React's default escaping; no `dangerouslySetInnerHTML` usage.

---

## 7. WebSocket Security

- Connection requires JWT query parameter: `ws://host/ws/{user_id}?token={jwt}`
- Server validates JWT on connect; rejects if expired, blacklisted, or user_id in path doesn't match JWT `sub`
- After validation, connection is associated with `(tenant_id, outlet_id)` from the JWT
- Messages from the server are broadcast only to connections in the same tenant channel
- Clients cannot send data messages (server only sends; client can send PING)

---

## 8. File Uploads

Currently limited to:
- `POST /tenants/me/logo` — planned Phase 15 — will use Next.js API route for server-side upload; file validated for MIME type (`image/png`, `image/jpeg`, `image/webp`) and max size (2 MB) before writing to `/media/logos/`

No untrusted file execution. PDFs are generated server-side, not uploaded by users.

---

## 9. Secrets Management

| Secret | Env Var | Minimum Length |
|---|---|---|
| JWT signing key | `JWT_SECRET_KEY` | 32 characters |
| Database password | `POSTGRES_PASSWORD` | 16 characters (recommended) |
| Redis (if AUTH enabled) | `REDIS_PASSWORD` | — |

**Rules:**
- Never commit `.env` to version control — `.env` is in `.gitignore`
- `.env.example` must never contain real values
- Production secrets are managed via the host environment (Docker Compose env_file or Kubernetes secrets)

See `09-deployment.md` → Environment Variables for the full list.

---

## 10. Known Gaps (Planned)

| Gap | Phase |
|---|---|
| No refresh token — users must re-login after expiry | 19 |
| No account lockout after N failed logins | 19 |
| No audit log of admin actions | 22 |
| Rate limiting only on auth + OTP endpoints; no global API rate limit | 19 |
| No HTTPS enforcement in development (`docker-compose.yml`) — production must terminate TLS at reverse proxy | Deployment |
| No Content-Security-Policy header | Ongoing |

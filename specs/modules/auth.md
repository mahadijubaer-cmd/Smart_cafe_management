# Module: Auth

**Routers:** `backend/app/routers/auth.py`, `backend/app/routers/otp.py`  
**Schemas:** `backend/app/schemas/user.py`, `backend/app/schemas/otp.py`  
**Service:** `backend/app/services/auth_service.py`  
**Last verified:** 2026-07-11

---

## Overview

Handles user registration, login, logout, profile retrieval, and OTP-based email verification and 2FA. JWT tokens are returned immediately for all roles — admin 2FA is enforced by the frontend, not the backend.

---

## API Endpoints

### `POST /api/v1/auth/register`

**Auth:** None | **Rate limit:** None (no slowapi limiter decorator on this endpoint — rate
limiting is only wired on `otp.py`/`public.py` endpoints)

**Request body:** `UserCreate`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | EmailStr | Yes | Valid email format |
| `password` | str | Yes | `min_length=8` |
| `full_name` | str | Yes | `min_length=2`, `max_length=100` |
| `role` | UserRole | No | Default `customer`; only `student` or `customer` allowed at self-registration |
| `tenant_slug` | str | Yes | Must match an active tenant |
| `student_id` | str \| null | No | For academic tenants |
| `phone` | str \| null | No | — |

**Business logic (server-side):**
1. **BR-REG-1:** `role` must be `student` or `customer` → `400 "This role requires an admin invitation."` for any other role (checked before tenant resolution)
2. Resolve `tenant_slug` → tenant → `404` if not found or inactive
3. **BR-SEG-1:** if the resolved tenant is a restaurant-segment tenant (`is_restaurant_segment(tenant.tenant_type)`), consumer self-registration is unavailable → `400 "Consumer registration is not available for this tenant"`, regardless of role
4. `(email, tenant_id)` must be unique → `400 "Email already registered for this tenant"`
5. If `tenant.allowed_email_domain` set: email's domain (`"@" + local part after @`) must match exactly → `400 "Registration requires an {allowed_email_domain} email address"`
6. Hash password with `pbkdf2_sha256`
7. Create user with `is_active=TRUE` (default), `email_verified=FALSE` (default)
8. Return `UserResponse` — **no JWT is issued at registration**; the caller must call `POST /auth/login` separately to obtain a token

**Response `201`:** `UserResponse` (not `Token` — registration does not log the user in)

```json
{
  "user_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "student1@g.bracu.ac.bd",
  "full_name": "Alice Rahman",
  "role": "student",
  "tenant_id": "...",
  "outlet_id": null,
  "employee_id": null,
  "wallet_balance": "0.00",
  "reward_points": 0,
  "email_verified": false,
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z"
}
```

**Current behaviour:** User is active immediately. The frontend calls `POST /otp/send` + `POST /otp/verify` separately to set `email_verified=TRUE`.

> **Not to be confused with organization registration.** `POST /auth/register` registers a *user* under an *existing* tenant. To onboard a *new organization* (tenant) + its first admin in one public flow, see `POST /tenants/register` in `modules/tenants.md` (RFC-006, BR-ORG-1…7).

---

### `POST /api/v1/auth/login`

**Auth:** None | **Rate limit:** None (no slowapi limiter decorator on this endpoint — rate
limiting is only wired on `otp.py`/`public.py` endpoints)

**Request body:** `UserLogin`

| Field | Type | Required |
|---|---|---|
| `email` | EmailStr | Yes |
| `password` | str | Yes |
| `tenant_slug` | str | Yes |

**Business logic:**
1. Resolve `tenant_slug` → active tenant → `404` if not found
2. Find user by `(email, tenant_id)` → `401 "Invalid credentials"` if not found
3. Verify password → `401 "Invalid credentials"` if wrong
4. Check `user.is_active` → `403 "Account is disabled"` if False
5. **BR-SEG-1:** if `user.role` is `customer` or `student` AND the tenant is a restaurant-segment
   tenant (`is_restaurant_segment(tenant.tenant_type)`) → `403 "Consumer login is not available for
   this tenant"` (closes the same gap as BR-SEG-1 on registration, for pre-existing accounts)
6. Issue JWT

**Response `200`:** `Token` (same shape as register)

**Current behaviour:** Token issued immediately for ALL roles. There is no backend 2FA step. The frontend login page sends `POST /otp/send` + `POST /otp/verify` for admin roles before storing the token — this is a UI gate.

---

### `POST /api/v1/auth/logout`

**Auth:** Required

**Request body:** None

**Business logic:** Extracts `jti` from token → writes `blacklist:jti:{jti}` to Redis with TTL = remaining token lifetime.

**Response `204`:** No body.

---

### `GET /api/v1/auth/me`

**Auth:** Required | **Roles:** Any authenticated

**Response `200`:** `UserResponse`

```json
{
  "user_id": "3fa85f64-...",
  "email": "student1@g.bracu.ac.bd",
  "full_name": "Alice Rahman",
  "role": "student",
  "tenant_id": "...",
  "outlet_id": null,
  "employee_id": null,
  "wallet_balance": "350.00",
  "reward_points": 40,
  "email_verified": true,
  "is_active": true,
  "created_at": "2026-06-01T10:00:00Z"
}
```

---

### `POST /api/v1/otp/send`

**Auth:** None | **Rate limit:** 3 / minute per client IP (slowapi, not per-email)

**Request body:** `OtpSendRequest`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | EmailStr | Yes | — |
| `purpose` | str | Yes | Pattern: `^(login\|email_verification\|password_reset)$` |
| `tenant_slug` | str | Yes | — |

**Business logic:**
1. Resolve `tenant_slug` → active tenant → `404` if not found
2. Generate 6-digit numeric OTP; store in Redis: key `otp:{purpose}:{email}`, TTL=600s, value =
   `{code, attempts: 0}`
3. Send email via `send_otp_email()`, using whichever provider `Settings.mail_provider` resolves to
   — `brevo` (preferred, if `BREVO_API_KEY` set), else `smtp` (fastapi-mail, if `MAIL_USERNAME`/
   `MAIL_PASSWORD` set), else `none` (ADR-007). **Fire-and-forget** either way: any exception
   (Brevo API error, SMTP auth failure, unreachable host, etc.) is caught, logged, and never
   surfaced to the caller. If the provider is `none`, the code is logged instead of emailed —
   dev-mode fallback.
4. Write an audit row via `otp_service.log_otp_request()` (email, purpose, tenant, IP, user-agent)
5. **Always** returns `200`, regardless of whether the tenant/email combination is real or whether
   the email actually sent — this is intentional (anti user-enumeration; see ADR-005).

**Response `200`:**
```json
{
  "message": "If that address is registered, a code has been sent.",
  "email": "student1@g.bracu.ac.bd",
  "purpose": "email_verification"
}
```

> **If OTP emails aren't arriving**, this endpoint's `200` response tells you nothing — the failure
> is silent by design (step 3 above). Check backend startup logs for the `verify_mail_config()`
> Brevo/SMTP check (ADR-005, ADR-007) and `operations/deployment.md`'s provider-config notes first.

---

### `POST /api/v1/otp/verify`

**Auth:** None

**Request body:** `OtpVerifyRequest`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | EmailStr | Yes | — |
| `purpose` | str | Yes | Pattern: `^(login\|email_verification\|password_reset)$` |
| `otp_code` | str | Yes | `min_length=6`, `max_length=6`, pattern `^[0-9]{6}$` |
| `tenant_slug` | str | Yes | — |

> **Important:** Field name is `otp_code`, NOT `code`.

**Business logic:**
1. Retrieve key `otp:{purpose}:{email}` from Redis
2. If not found: `400 "OTP expired or not found"`
3. Compare code: if wrong, increment `attempts`
4. If `attempts >= 5`: delete key → `400 "Too many failed attempts. Request a new OTP."`
5. If correct: delete key (single-use); if `purpose=email_verification` → set `user.email_verified=TRUE`

**Response `200`:**
```json
{ "verified": true, "message": "OTP verified successfully" }
```

---

### `PATCH /api/v1/auth/me`

**Auth:** Required | **Roles:** Any authenticated

Update own profile fields — only `full_name`, `phone`, `student_id` are settable, and only fields
actually submitted (non-`None`) are applied.

**Request body:** `ProfileUpdate`

| Field | Type | Required |
|---|---|---|
| `full_name` | str \| null | No |
| `phone` | str \| null | No |
| `student_id` | str \| null | No |

**Response `200`:** `UserResponse`

---

### `POST /api/v1/auth/forgot-password`

**Auth:** None

**Request body:** `ForgotPasswordRequest` — `{ "email": "...", "tenant_slug": "..." }`

**Business logic (BR-AUTH-1):**
1. Look up an *active* user by `(email, tenant_slug)`.
2. If found: generate and store a `password_reset`-purpose OTP, send it by email (best-effort — a
   failed send is swallowed, never raised).
3. **Always** returns `200` with the same message, whether or not the email/tenant combination
   exists — this endpoint never reveals whether an account exists.

**Response `200`:** `{ "message": "If that email is registered, an OTP has been sent." }`

---

### `POST /api/v1/auth/reset-password`

**Auth:** None

**Request body:** `ResetPasswordRequest` — `{ "email": "...", "tenant_slug": "...", "otp_code": "...", "new_password": "..." }`

**Business logic:**
1. Verify the `password_reset`-purpose OTP for `email` → `400 "Invalid or expired OTP"` if it fails.
2. Validate `new_password` complexity (uppercase + digit + special char + min 8 chars) → `400` with
   a descriptive message if it fails.
3. Look up user by `(email, tenant_slug)` → `404 "User not found"` if missing.
4. Hash and set the new password.

**Response `200`:** `{ "message": "Password updated. Please log in." }`

---

### `POST /api/v1/auth/change-password`

**Auth:** Required | **Roles:** Any authenticated

**Request body:** `ChangePasswordRequest` — `{ "current_password": "...", "new_password": "..." }`

**Business logic (BR-AUTH-3):**
1. Verify `current_password` against the caller's stored hash → `400 "Current password is incorrect"` if wrong.
2. Validate `new_password` complexity → `400` with a descriptive message if it fails.
3. Reject if `new_password` matches the current password → `400 "New password cannot match current"`.
4. Hash and set the new password.

**Response `200`:** `{ "message": "Password changed." }`

---

### `POST /api/v1/auth/refresh`

**Auth:** Required | **Roles:** Any authenticated

**Business logic (BR-AUTH-4):**
1. Blacklist the caller's current JWT `jti` in Redis (same mechanism as logout).
2. Load the caller's tenant and issue a brand-new JWT with full tenant claims.

**Response `200`:** `Token` (same shape as login)

---

## Pydantic Schemas

### `UserCreate`

```python
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.customer
    tenant_slug: str
    student_id: str | None = None
    phone: str | None = None
```

### `UserLogin`

```python
class UserLogin(BaseModel):
    email: EmailStr
    password: str
    tenant_slug: str
```

### `UserResponse`

```python
class UserResponse(BaseModel):
    user_id: UUID
    email: str
    full_name: str
    role: str
    tenant_id: UUID
    outlet_id: UUID | None
    employee_id: str | None
    wallet_balance: Decimal
    reward_points: int
    email_verified: bool
    is_active: bool
    created_at: datetime
```

### `Token`

```python
class Token(BaseModel):
    access_token: str
    token_type: str        # always "bearer"
    user_id: UUID
    tenant_id: UUID
    tenant_type: str       # one of 7 TenantType values
    tenant_slug: str
    outlet_id: UUID | None
    role: str              # one of 10 UserRole values
```

### `OtpSendRequest`

```python
class OtpSendRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(..., pattern="^(login|email_verification|password_reset)$")
    tenant_slug: str
```

### `OtpVerifyRequest`

```python
class OtpVerifyRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(..., pattern="^(login|email_verification|password_reset)$")
    otp_code: str = Field(..., min_length=6, max_length=6, pattern="^[0-9]{6}$")
    tenant_slug: str
```

---

## OTP Business Rules

### OTP-1: OTP Is Single-Use
Once verified successfully, the Redis key is immediately deleted. Reuse returns `400 "OTP expired or not found"`.

### OTP-2: Maximum 5 Attempts
After 5 wrong codes, key is deleted → `400 "Too many failed attempts. Request a new OTP."`. User must request a new OTP.

### OTP-3: Purpose Namespace Isolation
Keys are namespaced by purpose: `otp:email_verification:{email}` vs `otp:login:{email}`. An OTP for one purpose cannot satisfy another.

### OTP-4: 10-Minute Expiry
OTP Redis keys have TTL=600s. After expiry: `400 "OTP expired or not found"`.

---

## JWT Structure

See `system/security.md` → Section 1 for full JWT claims table.

**Summary of claims:** `sub` (user_id), `role`, `tenant_id`, `tenant_type`, `tenant_slug`, `outlet_id`, `exp`, `jti`

---

## Registration Workflow

```
1. Client → POST /auth/register
   Backend: create user (is_active=TRUE, email_verified=FALSE), issue Token

2. Client → POST /otp/send { purpose: "email_verification", ... }
   Backend: send OTP email

3. Client → POST /otp/verify { purpose: "email_verification", otp_code: "..." }
   Backend: set email_verified=TRUE

4. User is now fully registered and verified
```

## Registration Business Rules

### BR-REG-1: Restricted Roles Cannot Self-Register

The following roles **cannot** be self-registered via `POST /auth/register`:
`staff`, `cleaner`, `outlet_admin`, `tenant_admin`, `platform_admin`, `food_court_admin`

Only `student` and `customer` may self-register.  
Any other role → `400 "This role requires an admin invitation."`

**Frontend enforcement:** The register form's ProfileTypeSelector must never offer these roles as options.  
**Backend enforcement:** The register endpoint checks and rejects blocked roles server-side (Phase 14).

---

## Login Workflow

```
1. Client → POST /auth/login
   Backend: verify credentials, issue Token immediately (all roles)

2a. Customer/staff roles: store token in Zustand → redirect to role home

2b. Admin roles (frontend only):
   - Frontend holds token in memory (not stored yet)
   - Send POST /otp/send { purpose: "login" }
   - Show OTP input on login page
   - POST /otp/verify { purpose: "login", otp_code: "..." }
   - On success: store token in Zustand → redirect to admin dashboard
```

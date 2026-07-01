# Module: Auth

**Routers:** `backend/app/routers/auth.py`, `backend/app/routers/otp.py`  
**Schemas:** `backend/app/schemas/user.py`, `backend/app/schemas/otp.py`  
**Service:** `backend/app/services/auth_service.py`  
**Last verified:** 2026-06-30

---

## Overview

Handles user registration, login, logout, profile retrieval, and OTP-based email verification and 2FA. JWT tokens are returned immediately for all roles — admin 2FA is enforced by the frontend, not the backend.

---

## API Endpoints

### `POST /api/v1/auth/register`

**Auth:** None | **Rate limit:** 5 / minute

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
1. Resolve `tenant_slug` → tenant → `404` if not found or inactive
2. **BR-REG-1:** `role` must be `student` or `customer` → `400 "This role requires an admin invitation."` for any other role
3. If `tenant.allowed_email_domain` set: `email.endswith(domain)` must be True → `400 "Email domain not allowed"`
4. `(email, tenant_id)` must be unique → `400 "Email already registered for this tenant"`
5. Hash password with `pbkdf2_sha256`
6. Create user with `is_active=TRUE`, `email_verified=FALSE`
7. Return `UserResponse`

**Response `201`:** `Token`

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "tenant_id": "...",
  "tenant_type": "academic",
  "tenant_slug": "bracu",
  "outlet_id": null,
  "role": "student"
}
```

**Current behaviour:** User is active immediately. The frontend calls `POST /otp/send` + `POST /otp/verify` separately to set `email_verified=TRUE`. Phase 19 will switch to `is_active=FALSE` until OTP.

> **Not to be confused with organization registration.** `POST /auth/register` registers a *user* under an *existing* tenant. To onboard a *new organization* (tenant) + its first admin in one public flow, see `POST /tenants/register` in `modules/tenants.md` (RFC-006, BR-ORG-1…7).

---

### `POST /api/v1/auth/login`

**Auth:** None | **Rate limit:** 10 / minute

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
4. Check `user.is_active` → `400 "Account is inactive"` if False
5. Issue JWT

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

**Auth:** None | **Rate limit:** 3 / 10 minutes per email

**Request body:** `OtpSendRequest`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | EmailStr | Yes | — |
| `purpose` | str | Yes | Pattern: `^(login\|email_verification\|password_reset)$` |
| `tenant_slug` | str | Yes | — |

**Business logic:**
1. Generate 6-digit numeric OTP
2. Store in Redis: key `otp:{purpose}:{email}`, TTL=600s, value = `{code, attempts: 0}`
3. Send email via fastapi-mail (skipped if `MAIL_USERNAME` not set)

**Response `200`:**
```json
{
  "message": "OTP sent to student1@g.bracu.ac.bd",
  "email": "student1@g.bracu.ac.bd",
  "purpose": "email_verification"
}
```

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

## Planned Endpoints ❌ [Phase 19]

| Endpoint | Purpose |
|---|---|
| `POST /auth/forgot-password` | Send password reset OTP |
| `POST /auth/reset-password` | Accept `{email, otp_code, new_password}` |
| `POST /auth/change-password` | Authenticated user changes own password |
| `POST /auth/refresh` | Issue new token from valid token |
| `PATCH /auth/me` | Update own profile (full_name, phone, student_id) |

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

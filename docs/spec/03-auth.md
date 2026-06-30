# Spec 03 — Authentication & Authorization

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. JWT Structure

Every access token is a signed JWT (algorithm: HS256, secret: `SECRET_KEY` env var).

```json
{
  "sub": "<user_id UUID>",
  "email": "user@example.com",
  "tenant_id": "<tenant_id UUID>",
  "tenant_slug": "bracu",
  "tenant_type": "academic",
  "role": "student",
  "outlet_id": null,
  "brand_color": "#1A4D2E",
  "jti": "<unique token id UUID>",
  "exp": 1735689600
}
```

| Claim | Type | Description |
|---|---|---|
| `sub` | string (UUID) | User ID |
| `email` | string | User email |
| `tenant_id` | string (UUID) | The tenant this user belongs to |
| `tenant_slug` | string | Tenant slug |
| `tenant_type` | string | One of the 7 tenant_type values |
| `role` | string | User's role enum value |
| `outlet_id` | string (UUID) \| null | Only for `outlet_admin` — the outlet they manage |
| `brand_color` | string | Tenant's brand color hex (e.g. "#1A4D2E") |
| `jti` | string (UUID) | Unique token ID, used for blacklisting on logout |
| `exp` | integer | Unix expiry timestamp |

**Lifetime:** Controlled by `ACCESS_TOKEN_EXPIRE_MINUTES` env var. Default: `1440` (24 hours).

---

## 2. Registration Flow

> **RFC:** If you change this flow, also update [rfcs/RFC-001-tenant-discovery.md](../rfcs/RFC-001-tenant-discovery.md)

**Current implementation (Phase 10):**
```
POST /api/v1/auth/register
Body: { email, password, full_name, role, tenant_slug, student_id? }

Server validates:
  ① Tenant exists and is active (slug lookup)
  ② Role is in allowed public roles: [student, customer]
     → staff and cleaner must be admin-invited (Phase 21)
  ③ Email ends with tenant.allowed_email_domain if that field is set
  ④ (email, tenant_id) does not already exist
  ⑤ Password meets complexity rules

Server creates:
  User {
    is_active = TRUE,       ← user can log in immediately (current implementation)
    email_verified = FALSE  ← OTP flow sets this to TRUE
  }

Response 201: UserResponse (user object with token)
```

**Frontend OTP step (Phase 10 - `register/page.tsx`):**
```
After user creation, frontend calls:
POST /api/v1/otp/send
Body: { email, purpose: "verification" }
→ Sends 6-digit OTP to email (stored: otp:verification:{email} TTL=600s)

POST /api/v1/otp/verify
Body: { email, code, purpose: "verification" }
→ Sets user.email_verified = TRUE
→ Deletes Redis OTP key (single-use)
→ Returns 200: { message: "Email verified" }
```

> **Planned (Phase 19):** Registration will be updated so `is_active = FALSE` on creation; login will be blocked until OTP verification completes.

---

## 3. Login Flow

**Current implementation:**
```
POST /api/v1/auth/login
Body: { email, password, tenant_slug }    (form data: username=email, password)

Server:
  ① Looks up user by (email, tenant_id from slug)
  ② Verifies password hash
  ③ Checks is_active = TRUE
  ④ Returns JWT immediately for ALL roles (no 2FA currently)

Response 200: { access_token, token_type: "bearer", user: UserResponse }
```

**Frontend 2FA step (Phase 10 - `login/page.tsx`):**

The login page implements a 2FA-like step in the frontend UI for admin roles:
1. Calls `POST /auth/login` → gets token
2. Decodes token → checks role
3. If admin role: sends OTP via `POST /otp/send` (purpose: "login")
4. Shows OTP input; verifies via `POST /otp/verify`
5. Only proceeds to dashboard after OTP verification

The 2FA gate is currently enforced only at the frontend level. Backend returns the token on step 1 regardless of role.

> **Planned (Phase 19):** Backend login will be updated to return `{ requires_2fa: true }` for admin roles and issue the final token only after OTP verification.

---

## 4. Logout

```
POST /api/v1/auth/logout
Headers: Authorization: Bearer <token>

Server:
  Decodes token to extract jti and exp
  Stores in Redis: blacklist:jti:{jti}     ← key pattern is blacklist:jti: (not blacklist:jwt:)
    TTL = max(0, token_exp - current_time)
  Returns 204 No Content                  ← 204, not 200

From this point: any request with this token returns 401
```

---

## 5. Token Validation (every authenticated request)

`get_current_user()` dependency in `backend/app/core/dependencies.py`:

```
1. Extract Bearer token from Authorization header (via OAuth2PasswordBearer)
   → 401 if missing

2. Decode JWT via AuthService.decode_token() (signature + expiry check)
   → 401 if invalid signature or expired

3. Check Redis: blacklist:jti:{jti}          ← key pattern uses :jti: not :jwt:
   → 401 if found (logged out token)

4. Load user from DB by sub (user_id)
   → 401 if user not found

5. Assert user.is_active = TRUE
   → 401 if deactivated after token was issued

6. Return User object to handler
```

**Note:** There is no runtime tenant cross-check (jwt.tenant_id vs slug). Tenant isolation is enforced at the DB query layer by `require_role` callers using `ctx.tenant_id` from the middleware.

---

## 6. User Roles

```python
class UserRole(str, Enum):
    platform_admin   = "platform_admin"
    super_admin      = "super_admin"
    outlet_admin     = "outlet_admin"
    tenant_admin     = "tenant_admin"
    food_court_admin = "food_court_admin"
    staff            = "staff"
    cleaner          = "cleaner"
    server           = "server"
    student          = "student"   # legacy alias treated as customer
    customer         = "customer"
```

**Role groups** (constants in `backend/app/core/dependencies.py`):

```python
CUSTOMER_ROLES = (UserRole.customer, UserRole.student)   # student kept for backwards compat
CLEANER_ROLES  = (UserRole.cleaner,)
FLOOR_STAFF_ROLES = (UserRole.staff, UserRole.server)
ADMIN_ROLES    = (UserRole.outlet_admin, UserRole.tenant_admin,
                  UserRole.food_court_admin, UserRole.super_admin, UserRole.platform_admin)
WORK_ROLES     = FLOOR_STAFF_ROLES + ADMIN_ROLES
ALL_AUTH_ROLES = CUSTOMER_ROLES + CLEANER_ROLES + WORK_ROLES
```

---

## 7. Permissions Matrix

✅ Allowed  ❌ Forbidden  ⚠️ Partial (see notes)

| Endpoint Group | `platform_admin` | `super_admin` | `outlet_admin` / `tenant_admin` | `food_court_admin` | `staff` | `cleaner` | `server` | `student` / `customer` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Auth — all | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OTP — all | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Menu — read items | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Menu — write (CRUD items/categories) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Orders — place new order | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Orders — view all (admin/kitchen) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Orders — view own | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Orders — update status | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Orders — cancel own | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (pending only) |
| Tables — read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tables — manage (CRUD) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tables — update status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cleaners — manage assignments | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cleaners — view/complete own assignment | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Payments — topup wallet | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Payments — view history | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (own) |
| Analytics — all | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Analytics — outlets (franchise) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Inventory — read | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Inventory — write | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| QR — order | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (own orders) |
| QR — table | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Memo — generate PDF | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Receipts — download | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (own) |
| Tenants — CRUD | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tenants — self settings | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Food Court — all | food_court only → 403 for vendor | ← same | ← same | ✅ | ❌ | ❌ | ✅ (server) | ✅ (read) |
| Food Court — deliver order | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Food Court — analytics/settlements | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 8. Role Enforcement Pattern

```python
# In routers, roles are enforced with the require_role dependency:
@router.get("/inventory/items")
async def list_items(
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(
        UserRole.tenant_admin,
        UserRole.outlet_admin,
        UserRole.super_admin,
        UserRole.platform_admin,
    ))
):
    ...
```

---

## 9. Planned Auth Endpoints (Not Yet Implemented)

These endpoints are specified but not yet built. Implementation phase: Phase 19.

| Endpoint | Purpose |
|---|---|
| `POST /auth/forgot-password` | Send OTP to email to initiate password reset |
| `POST /auth/reset-password` | Accept OTP + new password, update hash |
| `POST /auth/change-password` | Authenticated user changes their own password |
| `POST /auth/refresh` | Issue new token from a valid, non-expired, non-blacklisted token |
| `PATCH /auth/me` | Update own profile: full_name, phone, student_id |

> See RFC: [RFC-004 — Password Reset](../rfcs/RFC-004-password-reset.md)

# Module: Tenants

**Router:** `backend/app/routers/tenants.py`  
**Schemas:** `backend/app/schemas/tenant.py`  
**Last verified:** 2026-06-30

---

## Overview

Platform-level management of tenant organisations. Creates, updates, activates, and suspends
tenants. Also manages franchise outlet creation under a brand.

Most endpoints (`GET/POST /tenants`, `PATCH/activate/suspend /tenants/{id}`) are `platform_admin`
only. The two outlet endpoints (`GET/POST /tenants/{tenant_id}/outlets`) additionally accept the
brand's own `super_admin`/`tenant_admin`, scoped to their own tenant — see BR-FRAN-1 (RFC-008).

> Every tenant belongs to exactly one **segment** (`cafeteria` or `restaurant`), derived from
> `tenant_type` — see `system/segments.md`. There is no `segment` column; do not add one.

---

## Access

**Public endpoints** (`GET /tenants/public`, `GET /tenants/public/{slug}`): No auth required  
**Admin endpoints** (all others): `platform_admin` only

---

## API Endpoints

### `GET /api/v1/tenants/public`

**Auth:** None

**Query params:** `?q=<name or city search>` (optional, case-insensitive substring match)

**Business logic:**
- Returns all tenants where `is_active = TRUE`
- If `q` provided: filter where `name ILIKE %q%` OR `city ILIKE %q%`
- Response cached in Redis: key `tenants:public:list` (no `q`) or `tenants:public:list:q={q}`, TTL=300s

**Response `200`:** `TenantPublicListResponse`

```json
{
  "items": [
    {
      "name": "BRACU Cafeteria",
      "slug": "bracu",
      "tenant_type": "academic",
      "logo_url": null,
      "city": "Dhaka",
      "brand_color": "#1A4D2E",
      "is_active": true
    }
  ],
  "total": 1
}
```

---

### `GET /api/v1/tenants/public/{slug}`

**Auth:** None

**Path param:** `slug` — the tenant's URL-safe identifier

**Business logic:**
- Returns tenant where `slug = {slug}` AND `is_active = TRUE`
- `404 "Tenant not found"` if slug not found or tenant is inactive
- Response cached in Redis: key `tenants:public:{slug}`, TTL=300s

**Response `200`:** `TenantPublicDetailResponse`

```json
{
  "name": "BRACU Cafeteria",
  "slug": "bracu",
  "tenant_type": "academic",
  "logo_url": null,
  "city": "Dhaka",
  "brand_color": "#1A4D2E",
  "is_active": true,
  "allowed_email_domain": "@g.bracu.ac.bd"
}
```

**Error:** `404 "Tenant not found"`

---

### `GET /api/v1/tenants`

**Query params:** `?skip=0&limit=50`

**Response `200`:** `TenantListResponse`

```json
{
  "items": [ TenantResponse, ... ],
  "total": 6
}
```

---

### `POST /api/v1/tenants`

**Request body:** `TenantCreate`

| Field | Type | Required | Default | Constraint |
|---|---|---|---|---|
| `name` | str | Yes | — | `min_length=2`, `max_length=150` |
| `slug` | str | Yes | — | `min_length=2`, `max_length=80`, pattern `^[a-z0-9-]+$` |
| `tenant_type` | TenantType | Yes | — | One of 7 values |
| `subscription_tier` | SubscriptionTier | No | `starter` | `free\|starter\|professional\|enterprise` |
| `parent_tenant_id` | UUID \| null | No | null | — |
| `logo_url` | str \| null | No | null | — |
| `brand_color` | str | No | `"#1A4D2E"` | `max_length=7` |
| `allowed_email_domain` | str \| null | No | null | Must start with `@` if set |
| `address` | str \| null | No | null | — |
| `city` | str \| null | No | null | — |
| `phone` | str \| null | No | null | — |
| `contact_email` | str \| null | No | null | — |
| `homemade_enabled` | bool | No | `false` | — |
| `inventory_strict_mode` | bool | No | **`false`** | — |

> `inventory_strict_mode` defaults to `false` — must be explicitly set to `true`.

**Business logic:**
- `slug` uniqueness check → `400 "Slug '{slug}' already taken"`

**Response `201`:** `TenantResponse`

---

### `POST /api/v1/tenants/register` ✅ [RFC-006 — Public organization onboarding]

**Auth:** None (public)

Creates a brand-new organization (tenant) **and** its first admin user in one atomic transaction, then returns a JWT so the owner is logged straight in. Distinct from `POST /auth/register` (which registers a *user* under an *existing* tenant). See `decisions/rfcs/RFC-006-organization-registration.md` and business rules **BR-ORG-1 … BR-ORG-7** below.

**Request body:** `TenantRegister`

```json
{
  "organization": {
    "name": "Green Fork Bistro",
    "slug": "green-fork",
    "tenant_type": "independent_restaurant",
    "city": "Dhaka",
    "contact_email": "owner@greenfork.com",
    "brand_color": "#1A4D2E",
    "allowed_email_domain": null
  },
  "admin": {
    "full_name": "Owner Name",
    "email": "owner@greenfork.com",
    "password": "Owner@1234"
  }
}
```

| Field | Type | Constraint |
|---|---|---|
| `organization.slug` | str | 2–80 chars, `^[a-z0-9-]+$`, globally unique |
| `organization.tenant_type` | enum | Self-serve only: `independent_restaurant`, `corporate`, `academic`, `franchise_brand`, `food_court`. `franchise_outlet` / `food_court_vendor` → `400` (BR-ORG-1) |
| `admin.password` | str | ≥8 chars, 1 uppercase, 1 digit, 1 special (BR-ORG-6) |

**Business logic (single atomic transaction — BR-ORG-7):**
1. Validate `tenant_type ∈ SELF_SERVE_TENANT_TYPES` (BR-ORG-1) → else `400`
2. Validate `slug` globally unique (BR-ORG-2) → else `400 "Slug '{slug}' already taken"`
3. Validate password complexity (BR-ORG-6) → else `400`
4. Create `Tenant` (`subscription_tier=free`, `is_active=TRUE`, `parent_tenant_id=NULL` — BR-ORG-4)
5. Create first admin `User` (`role=food_court_admin` if `tenant_type=food_court` else `tenant_admin`, `is_active=TRUE`, `email_verified=TRUE` — BR-ORG-5)
6. Issue JWT

**Response `201`:** `Token` — same shape as `POST /auth/login` (`outlet_id=null`).

**Errors:** `400` slug taken · `400` non-self-serve tenant type · `400` weak password · `422` validation.

---

### `GET /api/v1/tenants/{tenant_id}`

**Response `200`:** `TenantResponse`

**Error:** `404 "Tenant not found"`

---

### `PATCH /api/v1/tenants/{tenant_id}`

**Request body:** `TenantUpdate` — all fields optional

| Field | Type | Updatable? | Constraint |
|---|---|---|---|
| `name` | str | Yes | 2–150 chars |
| `logo_url` | str \| null | Yes | — |
| `brand_color` | str \| null | Yes | max 7 chars |
| `subscription_tier` | SubscriptionTier \| null | Yes | — |
| `allowed_email_domain` | str \| null | Yes | — |
| `address` | str \| null | Yes | — |
| `city` | str \| null | Yes | — |
| `phone` | str \| null | Yes | — |
| `contact_email` | str \| null | Yes | — |
| `homemade_enabled` | bool \| null | Yes | — |
| `inventory_strict_mode` | bool \| null | Yes | — |

> **`slug` and `tenant_type` cannot be changed after creation.** They are not in `TenantUpdate`.

**Response `200`:** `TenantResponse`

---

### `POST /api/v1/tenants/{tenant_id}/activate`

Sets `tenant.is_active = True`.

**Response `200`:** `TenantResponse`

---

### `POST /api/v1/tenants/{tenant_id}/suspend`

Sets `tenant.is_active = False`.

**Response `200`:** `TenantResponse`

---

### `GET /api/v1/tenants/{tenant_id}/outlets`

Lists all child tenants (franchise outlets) under a brand.

**Auth:** Required | **Roles:** `platform_admin` (any brand), or `super_admin`/`tenant_admin`
**only for their own tenant** — see **BR-FRAN-1** below.

**Response `200`:** `TenantListResponse`

---

### `POST /api/v1/tenants/{tenant_id}/outlets`

Creates a franchise outlet under the given brand tenant. Used both by platform admins (support/ops)
and by a franchise brand's own admin to self-provision a new branch (RFC-008).

**Auth:** Required | **Roles:** `platform_admin` (any brand), or `super_admin`/`tenant_admin`
**only for their own tenant** — see **BR-FRAN-1** below.

**Request body:** `OutletCreate`

| Field | Type | Required | Default | Constraint |
|---|---|---|---|---|
| `name` | str | Yes | — | 2–150 chars |
| `slug` | str | Yes | — | 2–80 chars, `^[a-z0-9-]+$` |
| `subscription_tier` | SubscriptionTier | No | `starter` | — |
| `logo_url` | str \| null | No | null | — |
| `brand_color` | str | No | `"#1A4D2E"` | max 7 chars |
| `allowed_email_domain` | str \| null | No | null | — |
| `address` | str \| null | No | null | — |
| `city` | str \| null | No | null | — |
| `phone` | str \| null | No | null | — |
| `contact_email` | str \| null | No | null | — |
| `homemade_enabled` | bool | No | false | — |
| `inventory_strict_mode` | bool | No | false | — |

> `tenant_type = franchise_outlet` and `parent_tenant_id = {tenant_id}` are set server-side. Not in request body.

**Response `201`:** `TenantResponse`

**Errors:** `400` if the target tenant is not a `franchise_brand` (defends the `platform_admin`
path) · `400` slug taken · `403` if a non-platform-admin caller's own tenant isn't `tenant_id` (or
isn't a `franchise_brand`).

---

## Business Rules — Franchise Outlet Access (RFC-008)

**BR-FRAN-1:** A caller may `GET`/`POST` `/tenants/{tenant_id}/outlets` if either:
- their role is `platform_admin` (any brand), **or**
- their role is `super_admin` or `tenant_admin`, their own JWT `tenant_id` equals the path
  `tenant_id`, **and** their own JWT `tenant_type` is `franchise_brand`.

Anyone else receives `403`. This lets a franchise brand's own admin self-provision new outlets
without a platform-admin intermediary, while still preventing one brand's admin from managing a
different brand's outlets.

> **Role terminology note:** the product spec calls this role "Franchise Admin." In code it is
> `UserRole.super_admin` (also accepted: `tenant_admin`) — see `system/architecture.md` for the full
> spec-term ↔ `UserRole` mapping.

---

### `GET /api/v1/tenants/me`

**Auth:** Required | **Roles:** `tenant_admin`, `outlet_admin`, `food_court_admin`

Returns the full tenant record for the calling user's own tenant. Used by the admin settings page.

**Response `200`:** `TenantResponse`

---

### `PATCH /api/v1/tenants/me/settings`

**Auth:** Required | **Roles:** `tenant_admin`, `outlet_admin`, `food_court_admin`

**Request body:** `TenantSettingsUpdate` — all fields optional

| Field | Type | Notes |
|---|---|---|
| `name` | str \| null | 2–150 chars |
| `logo_url` | str \| null | URL; prefer `POST /tenants/me/logo` |
| `brand_color` | str \| null | Hex color, max 7 chars |
| `address` | str \| null | — |
| `city` | str \| null | — |
| `phone` | str \| null | — |
| `contact_email` | str \| null | — |
| `allowed_email_domain` | str \| null | Must start with `@` if set |
| `homemade_enabled` | bool \| null | — |
| `inventory_strict_mode` | bool \| null | — |
| `public_menu_enabled` | bool \| null | ✅ [Phase 22 — Implemented 2026-07-05] (RFC-007). Gates `modules/public-surface.md`. Any segment may enable it — restaurant segment gets guest ordering, cafeteria segment gets read-only browsing only (BR-SEG-3, Phase D) |
| `public_slug` | str \| null | ✅ [Phase 22]. Short guest-facing identifier, distinct from `slug`; globally unique |
| `guest_checkout_mode` | str \| null | ✅ [Phase 22]. `counter` \| `online`; `online` enables `POST /public/orders/{guest_token}/pay` (simulated gateway, see `modules/payments.md` WAL-5) |

> **Not updatable:** `slug`, `tenant_type`, `subscription_tier`, `is_active`, `parent_tenant_id`

**Side effects:** Invalidates `tenants:public:{slug}` and `tenants:public:list` in Redis.

**Response `200`:** `TenantResponse`

---

### `POST /api/v1/tenants/me/logo`

**Auth:** Required | **Roles:** `tenant_admin`, `outlet_admin`, `food_court_admin`

**Request:** `multipart/form-data` with field `logo`

| Constraint | Value |
|---|---|
| Allowed types | `image/png`, `image/jpeg`, `image/webp` |
| Max size | 2 MB |

**Business logic:**
1. Validate content type and file size
2. Save file to `{MEDIA_ROOT}/logos/{tenant_id}.{ext}`
3. Set `tenant.logo_url = "/media/logos/{tenant_id}.{ext}"`
4. Invalidate Redis caches

**Response `200`:**
```json
{ "logo_url": "/media/logos/<tenant_id>.png" }
```

**Errors:**
- `400 "Invalid file type. Allowed: PNG, JPEG, WebP."`
- `400 "File too large. Maximum size is 2 MB."`

---

## Pydantic Schemas

### `TenantPublicResponse`
```python
class TenantPublicResponse(BaseModel):
    name: str
    slug: str
    tenant_type: TenantType
    logo_url: str | None
    city: str | None
    brand_color: str
    is_active: bool
    model_config = ConfigDict(from_attributes=True)
```

### `TenantPublicDetailResponse`
```python
class TenantPublicDetailResponse(TenantPublicResponse):
    """Extends TenantPublicResponse with fields needed for registration."""
    allowed_email_domain: str | None
```

### `TenantPublicListResponse`
```python
class TenantPublicListResponse(BaseModel):
    items: list[TenantPublicResponse]
    total: int
```

---

### `TenantSettingsUpdate`
```python
class TenantSettingsUpdate(BaseModel):
    """Self-service update for tenant admin. slug, tenant_type, subscription_tier immutable."""
    name: str | None = Field(default=None, min_length=2, max_length=150)
    logo_url: str | None = None
    brand_color: str | None = Field(default=None, max_length=7)
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    allowed_email_domain: str | None = None
    homemade_enabled: bool | None = None
    inventory_strict_mode: bool | None = None
```

---

### `TenantCreate`
```python
class TenantCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    tenant_type: TenantType
    subscription_tier: SubscriptionTier = SubscriptionTier.starter
    parent_tenant_id: UUID | None = None
    logo_url: str | None = None
    brand_color: str = Field(default="#1A4D2E", max_length=7)
    allowed_email_domain: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    homemade_enabled: bool = False
    inventory_strict_mode: bool = False    # DEFAULT FALSE
```

### `OutletCreate`
```python
class OutletCreate(BaseModel):
    # tenant_type and parent_tenant_id are set server-side
    name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    subscription_tier: SubscriptionTier = SubscriptionTier.starter
    logo_url: str | None = None
    brand_color: str = Field(default="#1A4D2E", max_length=7)
    allowed_email_domain: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    homemade_enabled: bool = False
    inventory_strict_mode: bool = False
```

### `TenantUpdate`
```python
class TenantUpdate(BaseModel):
    # slug and tenant_type are NOT here — immutable after creation
    name: str | None = Field(default=None, min_length=2, max_length=150)
    logo_url: str | None = None
    brand_color: str | None = Field(default=None, max_length=7)
    subscription_tier: SubscriptionTier | None = None
    allowed_email_domain: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    homemade_enabled: bool | None = None
    inventory_strict_mode: bool | None = None
```

### `TenantResponse`
```python
class TenantResponse(BaseModel):
    tenant_id: UUID
    parent_tenant_id: UUID | None
    tenant_type: TenantType
    name: str
    slug: str
    logo_url: str | None
    brand_color: str
    subscription_tier: SubscriptionTier
    is_active: bool
    allowed_email_domain: str | None
    address: str | None
    city: str | None
    phone: str | None
    contact_email: str | None
    homemade_enabled: bool
    inventory_strict_mode: bool
    created_at: datetime
```

### `TenantListResponse`
```python
class TenantListResponse(BaseModel):
    items: list[TenantResponse]
    total: int
```

---

### Organization Registration Schemas (RFC-006)

> `SELF_SERVE_TENANT_TYPES` (module constant in `schemas/tenant.py`): `independent_restaurant`, `corporate`, `academic`, `franchise_brand`, `food_court`. `franchise_outlet` and `food_court_vendor` are excluded (BR-ORG-1) — they require a `parent_tenant_id`.

#### `OrgRegisterDetails` (nested inside `TenantRegister.organization`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `name` | `str` | Yes | — | `min_length=2`, `max_length=150` |
| `slug` | `str` | Yes | — | `min_length=2`, `max_length=80`, pattern `^[a-z0-9-]+$` |
| `tenant_type` | `TenantType` | Yes | — | Self-serve only — see `SELF_SERVE_TENANT_TYPES` (BR-ORG-1) |
| `city` | `str \| None` | No | `None` | `max_length=100` |
| `contact_email` | `EmailStr \| None` | No | `None` | — |
| `brand_color` | `str` | No | `"#1A4D2E"` | `max_length=7` |
| `allowed_email_domain` | `str \| None` | No | `None` | `max_length=150` |

#### `OrgRegisterAdmin` (nested inside `TenantRegister.admin`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `full_name` | `str` | Yes | — | `min_length=2`, `max_length=100` |
| `email` | `EmailStr` | Yes | — | — |
| `password` | `str` | Yes | — | `min_length=8`, `max_length=128`; complexity enforced in router (BR-ORG-6) |

#### `TenantRegister` (Request — `POST /tenants/register`)

Public self-serve organization onboarding. Response is a `Token` (see `modules/auth.md`) — same shape as `POST /auth/login`.

```json
{ "organization": OrgRegisterDetails, "admin": OrgRegisterAdmin }
```

---

## Organization Registration Rules (RFC-006)

Public self-serve onboarding of a new organization (tenant) via `POST /tenants/register`.

### BR-ORG-1: Only Self-Serve Tenant Types May Self-Register
Allowed: `independent_restaurant`, `corporate`, `academic`, `franchise_brand`, `food_court`. `franchise_outlet` and `food_court_vendor` are **rejected with 400** — they require a `parent_tenant_id` and must be created under an existing parent (`POST /tenants/{id}/outlets`, or by a food-court admin), never as a standalone public signup.

### BR-ORG-2: Slug Uniqueness & Format
`organization.slug` must be globally unique and match `^[a-z0-9-]+$`. A taken slug → 400.

### BR-ORG-3: First Admin Email Unique in New Tenant
The first admin's email must be unique within the newly created tenant (trivially true at creation; enforced defensively).

### BR-ORG-4: New Tenant Defaults
A self-registered tenant starts with `subscription_tier = free`, `is_active = TRUE`, `parent_tenant_id = NULL`.

### BR-ORG-5: First Admin Role
The first admin is created with role `food_court_admin` when `tenant_type = food_court`, otherwise `tenant_admin`.

### BR-ORG-6: Password Complexity
`admin.password` must satisfy the platform password rule (≥8 chars, ≥1 uppercase, ≥1 digit, ≥1 special character) — the same validator used by `POST /auth/reset-password`. Weak password → 400.

### BR-ORG-7: Atomic Creation
Tenant + first-admin creation happens in a single transaction. If admin creation fails, the tenant is rolled back and not persisted.

---

## Email Domain Restriction Rules

### DOM-1: Domain Restriction Applies Only at Registration
`allowed_email_domain` is checked only during `POST /auth/register`.  
Users registered before the restriction was set are unaffected.

### DOM-2: Domain Restriction Format
The value must start with `@`, e.g. `@g.bracu.ac.bd`.  
Check: `email.endswith(tenant.allowed_email_domain)`.

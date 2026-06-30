# Module: Tenants

**Router:** `backend/app/routers/tenants.py`  
**Schemas:** `backend/app/schemas/tenant.py`  
**Last verified:** 2026-06-30

---

## Overview

Platform-level management of tenant organisations. Only `platform_admin` can access these endpoints. Creates, updates, activates, and suspends tenants. Also manages franchise outlet creation under a brand.

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

**Response `200`:** `TenantListResponse`

---

### `POST /api/v1/tenants/{tenant_id}/outlets`

Creates a franchise outlet under the given brand tenant.

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

## Email Domain Restriction Rules

### DOM-1: Domain Restriction Applies Only at Registration
`allowed_email_domain` is checked only during `POST /auth/register`.  
Users registered before the restriction was set are unaffected.

### DOM-2: Domain Restriction Format
The value must start with `@`, e.g. `@g.bracu.ac.bd`.  
Check: `email.endswith(tenant.allowed_email_domain)`.

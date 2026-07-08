# Module: Platform Admin Control Plane

**Router:** `backend/app/routers/platform.py`
**Related:** `backend/app/services/audit_service.py`, `backend/app/core/tier_limits.py`
**Last verified:** 2026-07-08
**RFC:** `decisions/rfcs/RFC-009-platform-admin-control-plane.md`

---

## Overview

This module owns the cross-tenant concerns that belong to `platform_admin` alone: the audit trail of
platform-admin actions, genuinely platform-wide (all-tenant-type) analytics, tenant impersonation,
and the canonical subscription-tier resource limits. Tenant lifecycle CRUD itself (create, update,
activate, suspend, hard delete, export) stays in `specs/modules/tenants.md` — this file owns only
what's new in RFC-009 plus the tier-limit table those other modules cross-reference.

Every endpoint in this module is `require_role(UserRole.platform_admin)` — there is no
tenant-scoping guard here, unlike every other module, because `platform_admin` is defined as
operating outside any single tenant's boundary.

---

## Guard Rule (PA-0)

**Every endpoint in this module requires the caller's role to be `platform_admin`.** No other admin
role (`super_admin`, `tenant_admin`, `outlet_admin`, `food_court_admin`) may call any `/platform/*`
endpoint, regardless of which tenant they belong to. Anyone else → `403`.

---

## API Endpoints

### `GET /api/v1/platform/audit-logs`

**Auth:** Required | **Roles:** `platform_admin`

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `tenant_id` | UUID \| null | null | Filter to logs targeting this tenant |
| `action` | str \| null | null | Filter to one `AuditAction` value |
| `skip` | int | 0 | Pagination offset |
| `limit` | int | 50 | Max 200 |

**Response `200`:**

```json
{
  "items": [
    {
      "log_id": "3fa85f64-...",
      "actor_id": "40df491b-...",
      "actor_email": "platform@scms.io",
      "action": "tenant_suspended",
      "target_tenant_id": "10000000-...",
      "target_tenant_name": "Testy Treat - Banani",
      "target_tenant_slug": "testy-treat-banani",
      "details": "{\"reason\": null}",
      "created_at": "2026-07-08T10:15:00Z"
    }
  ],
  "total": 1
}
```

Ordered newest-first (`created_at DESC`).

---

### `GET /api/v1/platform/analytics/overview`

**Auth:** Required | **Roles:** `platform_admin`

Genuinely cross-tenant-type platform overview — distinct from `GET /analytics/outlets`, which is a
franchise-outlet-only comparison gated to `super_admin`.

**Response `200`:**

```json
{
  "tenants_by_type": {
    "academic": 1,
    "corporate": 1,
    "independent_restaurant": 2,
    "franchise_brand": 1,
    "franchise_outlet": 2,
    "food_court": 2,
    "food_court_vendor": 2
  },
  "tenants_by_status": { "active": 10, "suspended": 1 },
  "signups_last_30_days": [
    { "date": "2026-07-01", "count": 1 }
  ],
  "orders_last_30_days": { "total_orders": 152, "total_revenue": "48250.00" }
}
```

`orders_last_30_days` aggregates across **all** tenants regardless of type — reuses the same
period-aggregation pattern as `routers/analytics.py::get_revenue_trend`, just without a tenant filter.

---

### `POST /api/v1/platform/tenants/{tenant_id}/impersonate`

**Auth:** Required | **Roles:** `platform_admin`

Mints a short-lived token scoped to `tenant_id`, for the calling platform admin's own user identity
(see RFC-009 §2.7 for why no synthetic user is needed). Writes one `impersonation_started` audit
entry (PA-1).

**Response `200`:**

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "tenant_slug": "testy-treat-banani",
  "expires_in_minutes": 15
}
```

**Business logic:**
1. Load target `Tenant` by `tenant_id` → `404` if not found.
2. `auth_service.create_access_token(user=current_user, tenant=target, expires_delta=timedelta(minutes=15), extra_claims={"impersonation": True})` (PA-4).
3. `record_audit(actor=current_user, action=IMPERSONATION_STARTED, target_tenant=target)` (PA-1).

**Errors:** `404 "Tenant not found"`.

---

## Subscription Tier Limits (PA-2)

Single source of truth: `backend/app/core/tier_limits.py::TIER_LIMITS`.

| Tier | `max_outlets` | `max_menu_items` | `max_staff` |
|---|---|---|---|
| `free` | 1 | 20 | 2 |
| `starter` | 3 | 100 | 10 |
| `professional` | 10 | 500 | 50 |
| `enterprise` | unlimited (`null`) | unlimited (`null`) | unlimited (`null`) |

- `max_outlets` is checked against a `franchise_brand` tenant's current count of `franchise_outlet`
  children, enforced in `POST /tenants/{tenant_id}/outlets` (see `modules/tenants.md`).
- `max_menu_items` is checked against a tenant's current `MenuItem` row count, enforced in
  `POST /menu/items` (see `modules/menu.md`).
- `max_staff` is checked against a tenant's current count of users whose role is in
  `FLOOR_STAFF_ROLES ∪ CLEANER_ROLES` (i.e. `staff`, `server`, `cleaner` — the roles provisioned via
  invite, not admin accounts), enforced in `POST /users/invite` (see `modules/users.md`).

**Rule PA-3:** Exceeding a limit on creation → `402 Payment Required`:

```json
{ "detail": "Tier limit reached: starter allows up to 3 outlets (currently 3)." }
```

The resource is **not** created; no partial state is left behind.

---

## Pydantic Schemas

### `AuditLogEntry`

| Field | Type |
|---|---|
| `log_id` | UUID |
| `actor_id` | UUID \| null |
| `actor_email` | str |
| `action` | str |
| `target_tenant_id` | UUID \| null |
| `target_tenant_name` | str \| null |
| `target_tenant_slug` | str \| null |
| `details` | str \| null |
| `created_at` | datetime |

### `AuditLogListResponse`

`{ items: AuditLogEntry[], total: int }`

### `PlatformAnalyticsOverview`

`{ tenants_by_type: dict[str, int], tenants_by_status: dict[str, int], signups_last_30_days: list[{date, count}], orders_last_30_days: {total_orders, total_revenue} }`

### `ImpersonationResponse`

`{ access_token: str, token_type: "bearer", tenant_slug: str, expires_in_minutes: 15 }`

---

## `AuditAction` values

`tenant_created` · `tenant_updated` · `tenant_tier_changed` · `tenant_activated` ·
`tenant_suspended` · `tenant_deleted` · `impersonation_started`

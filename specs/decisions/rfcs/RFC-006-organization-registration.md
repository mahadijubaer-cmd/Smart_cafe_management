# RFC-006: Public Organization Registration (Tenant Onboarding)

**Date:** 2026-07-01
**Author:** Mahadi Jubaer (22301162)
**Status:** Implemented
**Related spec files:** `modules/tenants.md` (POST /tenants/register, TenantRegister schema, BR-ORG-1…7), `modules/auth.md` (org-vs-user registration note), `frontend/workflows.md` (WF-10), `frontend/overview.md` (routing tree), `operations/testing.md` (test_org_registration.py)

---

## 1. Motivation

SCMS is a multi-tenant SaaS platform, but until now a new **organization** (tenant) could only be
created by a **platform admin** (`POST /tenants`, admin-gated) or by a seed script. There is no way
for a restaurant owner, cafeteria manager, or food-court operator to **onboard their own
organization** from the public site.

The customer-facing register page only creates a *user* under an *existing* tenant. It does not let
someone say "I run a restaurant — put it on the platform." This RFC adds a **self-serve
organization signup** where the owner selects their **tenant category** and creates the
organization plus its first admin account in one flow.

---

## 2. Proposed Design

### 2.1 Overview

Add a public, unauthenticated endpoint `POST /tenants/register` and a public page
`/register-organization`. The owner picks a **tenant category** (tenant type), enters organization
details and a first-admin account; the backend atomically creates the `Tenant` + the first admin
`User` and returns a JWT so the owner is logged straight into their new dashboard.

### 2.2 User-Facing Behaviour

A 3-step wizard at `/register-organization`:

1. **Choose category** — the owner selects one of the self-serve tenant types, each shown with a
   generic name and a one-line description of how that category functions (see `tenantTypes.ts`):
   Independent Restaurant, Corporate Cafeteria, Academic Cafeteria, Franchise Brand, Food Court.
2. **Organization details** — name (a URL slug is auto-suggested from the name and editable),
   city, contact email, brand colour, and — for academic/corporate — an optional allowed email
   domain. Slug availability is validated on submit.
3. **Admin account** — the first admin's full name, email, and password (same complexity rules as
   password reset).

On success the owner is auto-logged-in and redirected to `/{slug}/dashboard`.

Links to this page are added to the landing page, the customer login page, and the customer
register page ("Register your organization").

### 2.3 New or Changed API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/tenants/register` | **Public** | Create a new organization (tenant) + its first admin user; returns a JWT. |

**Request body (`TenantRegister`):**

```jsonc
{
  "organization": {
    "name": "Green Fork Bistro",          // 2–150 chars
    "slug": "green-fork",                  // 2–80 chars, ^[a-z0-9-]+$, unique
    "tenant_type": "independent_restaurant",
    "city": "Dhaka",                       // optional
    "contact_email": "owner@greenfork.com",// optional
    "brand_color": "#1A4D2E",              // optional, default #1A4D2E
    "allowed_email_domain": null            // optional; only meaningful for academic/corporate
  },
  "admin": {
    "full_name": "Owner Name",
    "email": "owner@greenfork.com",        // becomes the first admin login
    "password": "Owner@1234"               // min 8, 1 upper, 1 digit, 1 special
  }
}
```

**Response `201` (`Token`):** identical shape to `POST /auth/login` — `access_token`, `token_type`,
`user_id`, `tenant_id`, `tenant_type`, `tenant_slug`, `outlet_id` (null), `role`.

**Errors:** `400` slug taken · `400` non-self-serve type · `400` weak password · `422` validation.

### 2.4 Database Changes

**None.** Reuses the existing `tenants` and `users` tables. No new columns or tables.

New tenant defaults: `subscription_tier = free`, `is_active = true`, `parent_tenant_id = null`.
First admin defaults: `role = tenant_admin` (or `food_court_admin` when `tenant_type = food_court`),
`is_active = true`, `email_verified = true` (owner self-asserts during onboarding).

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| Organization signup wizard | `app/register-organization/page.tsx` | 3-step onboarding, auto-login on success |
| `OrgCategorySelector` | `components/auth/OrgCategorySelector.tsx` | Radio grid of self-serve tenant types with descriptions |
| `tenantTypes.ts` (existing) | `lib/tenantTypes.ts` | Source of generic type labels + descriptions (reused) |

### 2.6 Business Rules

Documented in `modules/tenants.md` → "Organization Registration Rules" as **BR-ORG-1 … BR-ORG-7**:

- **BR-ORG-1** Only self-serve types may self-register: `independent_restaurant`, `corporate`,
  `academic`, `franchise_brand`, `food_court`. `franchise_outlet` and `food_court_vendor` are
  **rejected** (400) — they must be created under a parent (`POST /tenants/{id}/outlets` or by a
  food-court admin) because they require a `parent_tenant_id`.
- **BR-ORG-2** `slug` must be globally unique and match `^[a-z0-9-]+$`.
- **BR-ORG-3** The first admin's `email` must be unique within the newly created tenant (always true
  on creation, but enforced defensively).
- **BR-ORG-4** New tenants start on the `free` tier, `is_active = true`, `parent_tenant_id = null`.
- **BR-ORG-5** First admin role = `food_court_admin` when `tenant_type = food_court`, else
  `tenant_admin`.
- **BR-ORG-6** Password must satisfy the platform complexity rule (≥8 chars, 1 uppercase, 1 digit,
  1 special) — same validator as `POST /auth/reset-password`.
- **BR-ORG-7** Creation is **atomic**: if admin creation fails, the tenant is not persisted (single transaction).

---

## 3. Alternatives Considered

- **Keep tenant creation admin-only, add a "request access" form.** Rejected — adds manual approval
  friction and doesn't demonstrate the self-serve SaaS model the thesis describes.
- **Auto-generate the admin invite instead of an inline password.** Rejected for onboarding — the
  owner should get an immediately usable account; staff invites (existing invite flow) still cover the
  invite path for additional admins.
- **Allow `franchise_outlet` / `food_court_vendor` self-signup.** Rejected — these require a
  `parent_tenant_id` and belong to an existing brand/food-court owner, so they stay parent-scoped.

---

## 4. Security & Isolation Notes

- The endpoint is public but only ever **creates** a brand-new isolated tenant; it cannot read or
  mutate any existing tenant's data.
- Slug uniqueness prevents hijacking an existing organization's URL namespace.
- The returned JWT carries the new tenant's `tenant_id`/`tenant_type`, so all subsequent requests
  are naturally row-isolated by the existing middleware and `get_tenant_context`.
- Abuse consideration (future work): rate-limit `POST /tenants/register` per IP (same slowapi
  pattern as `/otp/send`) to prevent bulk tenant spam. Noted as a follow-up, not blocking.

---

## 5. Testing

Documented in `operations/testing.md`; implemented in `backend/tests/test_org_registration.py` (8 tests, all passing):

1. `test_register_org_creates_tenant_and_admin` — 201, role `tenant_admin`, correct slug/type
2. `test_register_org_token_works_on_tenants_me` — returned JWT authenticates `/tenants/me` (tier `free`, active)
3. `test_register_org_duplicate_slug_rejected` — 400 (BR-ORG-2)
4. `test_register_org_non_self_serve_type_rejected` — `food_court_vendor` → 400 (BR-ORG-1)
5. `test_register_org_outlet_type_rejected` — `franchise_outlet` → 400 (BR-ORG-1)
6. `test_register_org_weak_password_rejected` — 8+ chars without complexity → 400 (BR-ORG-6)
7. `test_register_food_court_admin_role` — `food_court` → first admin `food_court_admin` (BR-ORG-5)
8. `test_register_org_admin_can_login` — created admin logs in via `POST /auth/login`

> Test-infra note: `conftest.py` gained a `@compiles(UUID, "sqlite")` hook and a
> `_strip_pg_only_server_defaults()` helper so the PostgreSQL-typed models create cleanly on the
> in-memory SQLite test database.

# RFC-008: Franchise Self-Service Outlet Provisioning

**Date:** 2026-07-05
**Author:** Mahadi Jubaer (22301162)
**Status:** Implemented
**Related spec files:** `modules/tenants.md` (outlet endpoints, BR-FRAN-1), `system/architecture.md`
(role terminology mapping), `frontend/overview.md` (new outlets page), `operations/testing.md`
(test_franchise_outlets.py)

---

## 1. Motivation

A gap analysis against the platform's product spec (2026-07-05) found that a franchise brand's own
admin cannot create new outlets. `POST /tenants/{tenant_id}/outlets` and
`GET /tenants/{tenant_id}/outlets` are gated to `platform_admin` only
(`backend/app/routers/tenants.py`, `_admin_only = Depends(require_role(UserRole.platform_admin))`),
with no check that the caller belongs to the brand at all. There is also no frontend page for outlet
management anywhere in the codebase.

This contradicts the product requirement that a Franchise Admin can "instantly provision new
branches, entities, or outlets" without going through the platform operator. Every new branch today
requires an out-of-band platform-admin action — a real operational bottleneck, not just a missing
nicety.

A secondary, smaller issue: the spec's document uses the term "Franchise Admin" for the role that
manages a whole brand's outlets. In code this role is `UserRole.super_admin` (see
`backend/app/routers/analytics.py::get_outlet_analytics`, docstring "Only accessible to super_admin
of a franchise_brand"). This mapping is correct but undocumented, which makes the spec and the code
hard to cross-reference. This RFC also records that mapping explicitly.

A third, cosmetic-only item raised by the same gap analysis — the product spec's "Specific Category
Restaurant" tenant formation — is addressed here too: **no new `TenantType` or schema change is
introduced**, since nothing in the actual business rules differentiates it from `franchise_brand`
(both are "one governance model, multiple outlets"). It remains a wording/description nuance for the
onboarding wizard copy, not an engineering gap, and is out of scope for this RFC.

---

## 2. Proposed Design

### 2.1 Overview

Replace the blanket `platform_admin`-only guard on the two outlet endpoints with a guard that also
accepts the brand's own `super_admin` / `tenant_admin`, scoped strictly to their own
`franchise_brand` tenant. Add a minimal outlets management page to the admin frontend, visible only
to franchise brand tenants.

### 2.2 User-Facing Behaviour

A `super_admin` (or `tenant_admin`) logged into a `franchise_brand` tenant sees a new **"Outlets"**
nav item in their admin sidebar. The page lists existing outlets (name, slug, city, active status)
and has an "Add outlet" form (name, slug, city, contact email). Submitting creates a new
`franchise_outlet` tenant immediately — no platform-admin approval step. Each listed outlet links to
`/{outlet_slug}/dashboard`, since an outlet is a fully independent tenant with its own menu, tables,
and QR codes once created.

Platform admins retain full access to every brand's outlets (support/ops use case), unchanged.

### 2.3 New or Changed API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/tenants/{tenant_id}/outlets` | `platform_admin` **or** (`super_admin`\|`tenant_admin` whose own tenant **is** `tenant_id` and is `franchise_brand`) | List child outlets — unchanged response shape |
| `POST` | `/api/v1/tenants/{tenant_id}/outlets` | same as above | Create a `franchise_outlet` under the brand — unchanged request/response shape |

No new endpoints; only the auth dependency changes. Request/response schemas (`OutletCreate`,
`TenantResponse`, `TenantListResponse`) are unchanged.

**New rule BR-FRAN-1:** A caller may manage (`GET`/`POST`) outlets for `tenant_id` if either:
- their role is `platform_admin`, OR
- their role is `super_admin` or `tenant_admin`, their JWT's `tenant_id` equals the path
  `tenant_id`, and their JWT's `tenant_type` is `franchise_brand`.

Anyone else gets `403`. (The existing `400` "Parent tenant is not a franchise_brand" check in
`create_outlet` is retained as a defense-in-depth check for the `platform_admin` path, where the
target might not be a franchise brand at all.)

### 2.4 Database Changes

None.

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| Outlets management page | `app/[tenant_slug]/(admin)/outlets/page.tsx` | List + create outlets; only rendered/linked when `ctx.tenant_type === 'franchise_brand'` |
| Nav item | `(admin)/layout.tsx` | Adds "Outlets" link, conditional on tenant type, same pattern as other type-gated nav items |

### 2.6 Role Terminology Mapping (documentation only, no code change)

| Product spec term | `UserRole` value | Scope |
|---|---|---|
| Franchise Admin | `super_admin` (also accepted: `tenant_admin`) | Whole `franchise_brand` tenant — all its outlets |
| Tenant Admin / Shop Admin | `tenant_admin` / `outlet_admin` | A single outlet, independent restaurant, cafeteria, or food court tenant |
| Global Admin | `platform_admin` | Cross-tenant, platform-wide |

This mapping is recorded in `specs/system/architecture.md` so the product spec's vocabulary and the
codebase's `UserRole` enum can be cross-referenced without guessing.

### 2.7 Business Rules

- **BR-FRAN-1** (new, see 2.3).
- Existing **BR-ORG-1** (only `franchise_brand` may self-register, not `franchise_outlet`) is
  unaffected — outlets are still only ever created via this endpoint, never via
  `POST /tenants/register`.

---

## 3. Alternatives Considered

- **Add a new `franchise_admin` UserRole distinct from `super_admin`.** Rejected — `super_admin`
  already plays exactly this role elsewhere (cross-outlet analytics), and introducing a second role
  with identical semantics would fragment existing RBAC checks (`ADMIN_ROLES`,
  `get_outlet_analytics`, etc.) for no behavioural gain. Documenting the mapping (2.6) achieves the
  same clarity without a migration.
- **Add a new `TenantType` for "Specific Category Restaurant."** Rejected — see Motivation; no
  business rule branches on it today, so it would be schema churn for a label.
- **Let any `tenant_admin`/`super_admin` create outlets under any brand if they simply guess a UUID.**
  Rejected as insecure — scoping to the caller's own `tenant_id` is required and is what BR-FRAN-1
  encodes.

---

## 4. Security & Isolation Notes

- The new guard is strictly *additive* to the existing `platform_admin` path — no existing access is
  removed.
- Cross-brand isolation: a franchise brand's admin can only pass the guard when the path `tenant_id`
  equals their own JWT `tenant_id`; they cannot list or create outlets for a different brand by
  supplying a different `tenant_id`, even if they know it. This closes the (previously moot, since
  no non-platform-admin could reach it at all) risk of tenant enumeration via this route.
- `create_outlet`'s existing `400` check that the target tenant really is a `franchise_brand` is
  retained, protecting the `platform_admin` path from creating an outlet under a non-brand tenant by
  mistake.

---

## 5. Testing

Implemented in `backend/tests/test_franchise_outlets.py`:

1. `test_brand_admin_can_list_own_outlets` — brand's `super_admin` → 200
2. `test_brand_admin_can_create_own_outlet` — brand's `super_admin` → 201, `tenant_type ==
   franchise_outlet`, `parent_tenant_id == brand.tenant_id`
3. `test_brand_tenant_admin_can_also_create_outlet` — brand's `tenant_admin` → 201 (both roles
   accepted per BR-FRAN-1)
4. `test_other_brand_admin_cannot_create_outlet_for_different_brand` — Brand B's admin targeting
   Brand A's `tenant_id` → 403
5. `test_non_franchise_tenant_admin_cannot_create_outlet` — a `tenant_admin` of a non-franchise
   tenant → 403 (their own `tenant_id` isn't `franchise_brand`)
6. `test_platform_admin_can_still_manage_any_brands_outlets` — unchanged platform-admin path → 201
7. `test_customer_cannot_create_outlet` — 403 (existing role-gating still holds for non-admin roles)

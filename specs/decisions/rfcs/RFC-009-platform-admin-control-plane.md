# RFC-009: Platform Admin Control Plane

**Date:** 2026-07-08
**Author:** Mahadi Jubaer (22301162)
**Status:** Accepted
**Related spec files:** `modules/platform.md` (new), `modules/tenants.md`, `modules/menu.md`,
`modules/users.md`, `system/data-model.md`, `system/security.md`, `frontend/overview.md`,
`operations/roadmap.md`

---

## 1. Motivation

The `platform_admin` role exists (tenant CRUD, a `subscription_tier` field) but does not yet fulfil
what "controls the whole platform" should mean for the only role with cross-tenant authority:

- The three existing platform-management frontend pages (`(platform)/admin/tenants`,
  `/admin/subscriptions`, `/admin/analytics`) are **not linked from any navigation** — reachable only
  by typing the URL directly. The capability exists but is undiscoverable.
- **No audit trail exists.** A platform admin can suspend, reactivate, or change the subscription
  tier of any tenant with zero record of who did it or when. For a role with unscoped cross-tenant
  write access, this is the single largest trust gap in the system.
- "Platform-wide analytics" (`GET /analytics/outlets`) is in fact a franchise-outlet comparison
  table, gated to `super_admin` — it does not aggregate across all seven `TenantType` values the way
  a genuine platform overview should.
- `subscription_tier` is stored on every tenant but **nothing reads it** — a `free`-tier tenant can
  create unlimited outlets, menu items, and staff, identically to `enterprise`. The field is
  decorative.
- There is no **impersonation** ("view as this tenant") path for a platform admin to debug a
  tenant's reported issue without that tenant's own credentials.
- There is no **offboarding** path beyond `suspend` — no hard delete, no data export before removal.

This RFC specifies all six gaps as one control-plane feature set, so they can be built, spec'd, and
tested together rather than as six uncoordinated patches.

---

## 2. Proposed Design

### 2.1 Overview

Add a new `/platform/*` router owning cross-tenant concerns (audit log, platform-wide analytics,
impersonation), a small tier-limit config consulted at the three points where unscoped growth
matters (outlets, menu items, staff), and finish wiring the existing tenant-management pages into
navigation with two new admin actions (hard delete, export).

### 2.2 User-Facing Behaviour

A `platform_admin` logged in now sees a **"Platform"** section in their admin sidebar (visible only
to this role, regardless of which tenant type their home tenant is) linking to Tenants,
Subscriptions, Analytics, and a new Audit Log page.

On the Tenants page, each row gains three actions:
- **Impersonate** — mints a short-lived, tenant-scoped session as that tenant; the whole app then
  shows a persistent banner ("Viewing as {tenant name} — Exit impersonation") until the platform
  admin clicks Exit, which restores their own session.
- **Export** — downloads a JSON snapshot of the tenant's core data (profile, users, menu, tables,
  order-count summary).
- **Delete** — hard-deletes the tenant. Disabled in the UI unless the tenant is already suspended;
  requires a confirmation dialog.

Any tenant that hits its subscription tier's resource cap (outlets for a franchise brand, menu items,
staff invites) gets a clear `402` with the limit and current count, both in the API response and
surfaced as a toast in the relevant admin page.

The Audit Log page lists every recorded platform-admin action — actor, action, target tenant,
timestamp — newest first, filterable by tenant and action type.

### 2.3 New or Changed API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/platform/audit-logs` | `platform_admin` | Paginated audit log, filterable by `tenant_id`, `action` |
| `GET` | `/api/v1/platform/analytics/overview` | `platform_admin` | Cross-tenant-type platform overview |
| `POST` | `/api/v1/platform/tenants/{tenant_id}/impersonate` | `platform_admin` | Mint a 15-minute tenant-scoped token, audit-logged |
| `DELETE` | `/api/v1/tenants/{tenant_id}` | `platform_admin` | Hard delete — requires tenant already suspended |
| `GET` | `/api/v1/tenants/{tenant_id}/export` | `platform_admin` | JSON data export |

Full schemas for each are in `specs/modules/platform.md` (new endpoints) and
`specs/modules/tenants.md` (the two tenant-scoped additions, kept in that file since they're CRUD
lifecycle operations on the existing `Tenant` resource, not a new cross-cutting concern).

### 2.4 Database Changes

One new table, `platform_audit_logs` — see `specs/system/data-model.md`. No changes to any existing
table. `subscription_tier` (already on `tenants`) gains enforced meaning but no schema change.

```sql
CREATE TABLE platform_audit_logs (
    log_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id            UUID REFERENCES users(user_id) ON DELETE SET NULL,
    actor_email         VARCHAR(150) NOT NULL,
    action              VARCHAR(50) NOT NULL,
    target_tenant_id    UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    target_tenant_name  VARCHAR(150),
    target_tenant_slug  VARCHAR(80),
    details             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`actor_id`/`target_tenant_id` are `SET NULL` (not `CASCADE`) so a log entry survives the actor's
account being deactivated or the target tenant being hard-deleted — the whole point of an audit log
is that it must outlive the things it records. `actor_email`/`target_tenant_name`/`target_tenant_slug`
are denormalized for exactly this reason.

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| Audit Log page | `app/(platform)/admin/audit-log/page.tsx` | Paginated table, tenant/action filters, `platform_admin`-only |
| Nav — Platform section | `[tenant_slug]/(admin)/layout.tsx` | New nav items, gated by role (not tenant type) — first role-gated nav in this file |
| Impersonation banner | `components/platform/ImpersonationBanner.tsx` | Persistent banner while `impersonation` JWT claim is true; Exit restores the stashed real token |
| Tenants page actions | `(platform)/admin/tenants/page.tsx` | Impersonate / Export / Delete buttons per row |
| Analytics page | `(platform)/admin/analytics/page.tsx` | Now also calls `/platform/analytics/overview` for the genuine cross-tenant-type view |

### 2.6 Business Rules

New rules, all defined in **`specs/modules/platform.md`** as the owning file (cross-referenced, not
duplicated, from `tenants.md`/`menu.md`/`users.md` at their enforcement points):

- **PA-1** — Every mutating platform-admin action on a tenant (create, tier change, activate,
  suspend, hard delete, impersonate) writes exactly one `platform_audit_logs` row before the response
  is returned. A failed/rolled-back action writes no row.
- **PA-2** — `TIER_LIMITS` is the single source of truth for per-tier resource caps
  (`max_outlets`, `max_menu_items`, `max_staff`). `enterprise` is unlimited (`null`) on all three.
- **PA-3** — Creating an outlet, menu item, or staff invite that would exceed the tenant's (or, for
  outlets, the franchise brand's) tier cap returns `402 Payment Required` with the limit and current
  count; the resource is not created.
- **PA-4** — An impersonation token is scoped to the target tenant, expires in 15 minutes, carries
  `impersonation: true` in its JWT payload, and is minted for the *platform admin's own user
  identity* (not a synthetic user) — see 2.7 below for why this is sufficient.
- **PA-5** — Hard-deleting a tenant (`DELETE /tenants/{id}`) requires `tenant.is_active == False`
  already (i.e. it must be suspended first) → else `400`. A snapshot of the tenant's name/slug/type is
  written to the audit log *before* the row is deleted (PA-1 applies here too).

### 2.7 Security Design Note: Why Impersonation Needs No New Auth Mechanism

`backend/app/core/dependencies.py::require_role()` checks the **caller's real, DB-loaded
`User.role`** (re-fetched every request via `get_current_user`) — never a role claim embedded in the
JWT. Separately, `TenantContextMiddleware` derives `tenant_id`/`tenant_type`/`tenant_slug` **purely
from JWT claims**, with no re-query of the user's own tenant. Consequently, minting a token via the
existing `auth_service.create_access_token(user=<the real platform admin>, tenant=<target tenant>)`
already scopes every subsequent request to the target tenant, while the caller's real identity and
role (`platform_admin`, which is a member of `ADMIN_ROLES` on every admin-gated route in the
codebase) are preserved unchanged. No synthetic user, no second role system, and no change to
`require_role`/`TenantContextMiddleware` is needed. The only two additions to
`auth_service.create_access_token` are an optional `expires_delta` override (already a parameter —
just needs to be passed a short value) and a new optional `extra_claims: dict` parameter to stamp
`impersonation: true` for the frontend banner and for audit-log detail.

**Known limitation, documented rather than solved here:** any endpoint gated to one *specific* admin
role instead of the `ADMIN_ROLES` group (e.g. a hypothetical `require_role(UserRole.tenant_admin)`
with no other roles) would reject an impersonating platform admin, since their real role is
`platform_admin`. An audit of every admin-gated endpoint for this pattern is out of scope for this
RFC; it is a follow-up if a specific page is found broken under impersonation.

---

## 3. Alternatives Considered

- **Synthetic "impersonation session" with its own token type / separate secret.** Rejected — adds a
  second auth code path to maintain and audit, for no behavioural gain over reusing
  `create_access_token` with the real user + target tenant (see 2.7).
- **Store tier limits as columns on `tenants` instead of a code constant.** Rejected for now — the
  limits are a small, rarely-changing product decision (three numbers per tier), not per-tenant
  configuration; a constant is simpler to reason about and test. If a tenant ever needs a
  limit override independent of its tier, that's a future RFC.
- **Soft "audit" via existing application logs only.** Rejected — process logs are not queryable per
  tenant, are not retained deliberately, and are not visible in the admin UI. A dedicated table with a
  UI is what makes the audit trail actually usable, not just theoretically present.
- **Enforce tier limits via a global request-count throttle instead of per-resource caps.** Rejected —
  the product need is "does this tenant have too many outlets/items/staff for what they're paying
  for," not a rate limit; per-resource counts are the correct check.

---

## 4. Open Questions

- [x] Does impersonation need a new JWT mechanism? — No, see 2.7.
- [x] Where do hard-delete/export live — new router or `tenants.py`? — `tenants.py`, since they're
  lifecycle operations on the existing `Tenant` resource; `platform.py` owns only genuinely new
  cross-cutting concerns (audit log, cross-tenant analytics, impersonation).

---

## 5. Implementation Checklist

**SPEC CHANGES FIRST — no code until all spec checkboxes are ticked.**

- [x] `specs/modules/platform.md` created (new)
- [x] `specs/modules/tenants.md` updated (hard delete, export)
- [x] `specs/modules/menu.md` updated (tier-limit cross-reference)
- [x] `specs/modules/users.md` updated (tier-limit cross-reference)
- [x] `specs/system/data-model.md` updated (new table)
- [x] `specs/system/security.md` updated (impersonation claim)
- [x] `specs/frontend/overview.md` updated (nav, new pages/components)
- [x] `specs/operations/roadmap.md` updated (Phase 24)
- [x] `specs/README.md` file-ownership map updated
- [ ] Alembic migration `0008_add_platform_audit_log.py`
- [ ] Backend implementation
- [ ] Tests written (`backend/tests/test_platform_admin.py`)
- [ ] Frontend implementation
- [ ] `CHANGELOG.md` updated

# RFC-001: Tenant Discovery & Registration Redesign

**Date:** 2026-06-30  
**Author:** Mahadi Jubaer  
**Status:** Accepted  
**Related spec files:** specs/modules/auth.md, specs/modules/tenants.md, specs/frontend/workflows.md

---

## 1. Motivation

Currently, the registration flow requires users to already know their organization's URL slug (e.g., `/bracu/register`). There is no public way to discover or search for an organization. The root URL (`/`) redirects to `/bracu/login` — hardcoded, breaking every other tenant's users.

Additionally, the registration form shows the same fields to all users regardless of tenant type, and allows self-registration as `staff` or `cleaner` roles — which should be admin-invited only.

**Problems:**
- New users have no way to find their organization without being told the exact URL
- The form is context-blind — a university student sees the same form as a food court diner
- Staff roles can be self-registered (security gap)
- No organization name or branding shown during registration

---

## 2. Proposed Design

### 2.1 Overview

Add a public discovery page (`/discover`) that lists all active tenants. Redesign the registration page to show organization branding and adapt its fields to the tenant type and selected profile type.

### 2.2 User-Facing Behaviour

**Discovery page (`/discover`):**
- Public — no auth required
- Search bar (fuzzy match on name)
- Filter chips: Academic, Corporate, Restaurant, Food Court
- Grid of `TenantCard` components showing: logo (or placeholder icon), name, type badge, city
- Each card has "Register →" and "Sign in →" links

**Registration page (`/[slug]/register`):**
- Step 0: On page load, fetch tenant details and show `TenantWelcomeBanner` (logo, name, "You're registering for {Name}")
- Step 1: `ProfileTypeSelector` — illustrated option cards based on tenant_type:
  - `academic` → "I'm a Student" / "I'm a Staff Member" (staff hidden from self-registration)
  - `corporate` → "I'm an Employee"
  - All others → "I'm a Customer" (only option)
- Step 2: Adaptive form
  - Student → Name, Email (domain validated), Password, Student ID (required)
  - Employee → Name, Email (domain validated), Password, Employee ID
  - Customer → Name, Email, Password
  - Role is derived from profile type selection — NOT a dropdown
- Step 3: OTP verification (existing)

**Root page (`/`):**
- Changed from hardcoded `/bracu/login` redirect to a proper landing page with:
  - Hero section, live tenant count stat
  - Search bar that leads to `/discover`

### 2.3 New API Endpoints

#### `GET /api/v1/tenants/public`
Auth: None  
Response:
```json
[
  {
    "name": "BRACU Cafeteria",
    "slug": "bracu",
    "tenant_type": "academic",
    "logo_url": null,
    "city": "Dhaka",
    "is_active": true
  }
]
```
Cache: Redis `cache:public_tenants` TTL = 300s  
Filter: Only `is_active = TRUE` tenants; excludes `food_court_vendor` types

#### `GET /api/v1/tenants/public/{slug}`
Auth: None  
Response: Single tenant public profile (same fields as above + `allowed_email_domain` for frontend domain hint)

### 2.4 Database Changes

None. The `tenants` table already has all required fields.

### 2.5 Frontend Changes

| File | Change |
|---|---|
| `src/app/page.tsx` | Replace hardcoded redirect with discovery landing page |
| `src/app/discover/page.tsx` | NEW — discovery page |
| `src/app/[tenant_slug]/(auth)/register/page.tsx` | Redesign to multi-step with profile type selector |
| `src/components/auth/TenantCard.tsx` | NEW |
| `src/components/auth/ProfileTypeSelector.tsx` | NEW |
| `src/components/auth/TenantWelcomeBanner.tsx` | NEW |
| `src/hooks/useTenantInfo.ts` | NEW — fetch public tenant data |

### 2.6 Business Rules

- **New rule BR-REG-1:** Staff and cleaner roles are not available in the public registration form. They must be added by tenant admins via the invite system (Phase 21).
- **Existing rule DOM-1** applies: email domain validated against `allowed_email_domain` if set.

---

## 3. Alternatives Considered

**Alternative: QR-code-only discovery** — Users scan a physical QR poster in the cafeteria. Rejected: doesn't help users who haven't been to the physical location.

**Alternative: Keep slug-first, just document slugs** — Rejected: poor UX for a platform that is supposed to attract new tenants organically.

---

## 4. Open Questions

- [x] Should `food_court_vendor` tenants appear in the discovery list? Decision: No — vendors are accessed via their food court parent.
- [x] Should platform tenant appear? Decision: No.
- [ ] Should the discovery list be paginated or show all? (All for now; paginate when > 50 tenants)

---

## 5. Implementation Checklist

- [x] specs/modules/tenants.md updated (planned endpoints added)
- [x] specs/frontend/workflows.md updated (WF-1 and WF-2 updated)
- [ ] `GET /tenants/public` endpoint implemented
- [ ] `GET /tenants/public/{slug}` endpoint implemented
- [ ] `/discover/page.tsx` built
- [ ] `/[slug]/(auth)/register/page.tsx` redesigned
- [ ] `TenantCard`, `ProfileTypeSelector`, `TenantWelcomeBanner` components built
- [ ] Root `page.tsx` updated
- [ ] Tests written
- [ ] CHANGELOG.md updated

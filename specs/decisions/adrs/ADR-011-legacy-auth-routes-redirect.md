# ADR-011: Bare `/login` and `/register` Redirect to `/discover` Instead of Staying Dead Forms

**Date:** 2026-07-12
**Status:** Implemented
**Deciders:** Mahadi Jubaer

---

## Context

`ADR-009` and `specs/frontend/overview.md` (Phase 2 note) both record that the legacy,
non-`[tenant_slug]` route tree — `app/(auth)/login/page.tsx` and `app/(auth)/register/page.tsx` —
was "intentionally left untouched" when the auth pages got their Phase 2 visual pass, deferring to
the duplicate-route-tree debt these two pages represent.

Investigating an unrelated report (a "Failed to load tenants" toast on the platform-admin console),
live browser testing turned up that these two pages are not merely stale — they are **completely
non-functional**:

- `app/(auth)/login/page.tsx` posts `{ email, password }` to `POST /auth/login`.
- `app/(auth)/register/page.tsx` posts `{ full_name, email, password, role, student_id }` to
  `POST /auth/register`.
- Neither form collects or sends `tenant_slug`. The backend has required `tenant_slug` on both
  endpoints since multi-tenancy landed (`auth_service.get_tenant_by_slug(credentials.tenant_slug, db)`
  in `app/routers/auth.py`) — every submission on either page gets a `422 Field required` and the
  frontend's generic catch-all (`toast.error('Unable to sign in...')` / `'Unable to create
  account...'`) masks the real cause as a vague failure.

These pages are not linked from anywhere in the app (`grep` for `href="/login"`, `href="/register"`
found nothing), but they are a reachable dead end: `ProtectedRoute.tsx`'s redirect fallback —
`const loginPath = tenantSlug ? `/${tenantSlug}/login` : '/login'` — sends a user here whenever a
protected route is hit without a known tenant slug in the store, and `/login` is also simply a URL
a real visitor might guess. Landing there previously meant a permanently broken form with no way
out except manually editing the address bar.

## Decision

Replaced both pages' bodies with a server-side `redirect('/discover')` (Next.js `next/navigation`).
`/discover` is the app's existing, working "find your organization" entry point — it already links
onward to `/register-organization` for creating a new org, and to each tenant's own
`/{slug}/login` for existing ones. No new UI was built; this routes the dead end to the destination
that already does the job correctly.

`specs/frontend/overview.md`'s Phase 2 note (previously: "Legacy non-`[tenant_slug]` duplicate auth
pages ... were intentionally left untouched") is updated to reflect this — see that file's Routing
Tree and Phase 2 note, both amended alongside this ADR.

## Rationale

Two options were considered:

1. **Add a `tenant_slug` field to these forms** so they work standalone — rejected. It would
   duplicate the tenant-scoped `[tenant_slug]/(auth)/login` and `[tenant_slug]/(auth)/register`
   pages' functionality (including their OTP 2FA step for admin roles), doubling the maintenance
   surface for a route nothing links to, which is exactly the debt `ADR-009` already flagged.
2. **Redirect to `/discover`** — chosen. Zero new UI, resolves the dead end for the one legitimate
   reachable case (`ProtectedRoute`'s unknown-tenant fallback), and matches the project's existing
   pattern of `/discover` as the canonical "I don't know my org" landing page.

## Consequences

**Positive:**
- `ProtectedRoute`'s unknown-tenant fallback path now resolves to a working page instead of a form
  that always 422s.
- Removes ~90 lines of dead, misleading form code (two files) that could not succeed under any
  input.

**Negative:**
- None identified — no code referenced these pages' rendered form content, only their route paths
  (both confirmed unlinked internally).

**Neutral / Trade-offs:**
- The duplicate-route-tree debt itself (`ADR-009`) is not resolved by this change, only the one
  broken leaf. The equivalent legacy pages that *do* still render real (if duplicated) content —
  e.g. `app/(admin)/menu-admin/page.tsx`, re-exported by `[tenant_slug]/(admin)/menu-management/`
  — are untouched and remain a separate, already-tracked cleanup.

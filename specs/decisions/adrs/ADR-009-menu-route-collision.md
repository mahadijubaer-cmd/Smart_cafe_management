# ADR-009: Fixed `(admin)/menu` vs `(student)/menu` Route Collision

**Date:** 2026-07-11
**Status:** Implemented
**Deciders:** Mahadi Jubaer

---

## Context

While verifying an unrelated feature (segment-scoped registration CTA on `/discover`), the entire
frontend started 500ing on every route:
```
You cannot have two parallel pages that resolve to the same path.
Please check /(admin)/menu/page and /(student)/menu/page.
```
Next.js route groups (`(admin)`, `(student)`) are invisible in the URL — both
`src/app/(admin)/menu/page.tsx` and `src/app/(student)/menu/page.tsx` resolved to the literal
bare path `/menu`. This is a pre-existing conflict baked into the root-level "legacy" route tree
(the `f63f0fa` commit that moved real page implementations into un-prefixed route groups, re-
exported by the `[tenant_slug]/(admin|customer)/*` stubs — see `frontend/overview.md`'s Form/Auth-
guard notes and prior ADRs for that pattern's background). It had been dormant because nothing had
forced Next's dev compiler to build both conflicting routes in the same pass until now — once
triggered, it broke the entire site, not just `/menu`.

## Decision

Renamed `src/app/(admin)/menu/` → `src/app/(admin)/menu-admin/` (file content unchanged) so it no
longer collides with `(student)/menu` at the URL level. Updated the one stub that re-exported it:
`src/app/[tenant_slug]/(admin)/menu-management/page.tsx` now points to
`@/app/(admin)/menu-admin/page`. Verified no other code referenced the bare `/menu` path expecting
the admin variant (`grep` for `href="/menu"` etc. — every reference was student/customer-side:
legacy login's `redirectByRole`, `(student)/layout.tsx` nav, `(student)/track/[orderId]/page.tsx`).

Did not touch `(student)/menu` — it correctly keeps the bare `/menu` path, matching every existing
reference to it.

## Consequences

**Positive:** site-wide 500s resolved; `/menu` now unambiguously resolves to the student/customer
menu page as every existing reference already expected.

**Negative:** this class of bug (route-group leaf-name collisions across the un-prefixed legacy
tree) can recur — any two route groups sharing the same leaf folder name will silently conflict
until something forces Next to compile both. No automated check currently guards against this;
worth a `next build` in CI (which would catch it at build time rather than via a live 500) if this
project adds CI.

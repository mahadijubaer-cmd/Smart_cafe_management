# ADR-006: Tenant-Scoped Layout Guards Must Wait for Store Hydration

**Date:** 2026-07-11
**Status:** Implemented
**Deciders:** Mahadi Jubaer

---

## Context

Live browser testing (Playwright, driving the real running app rather than the test suite) found
that authenticated admin users could be intermittently bounced back to `/{tenant_slug}/login` when
navigating directly to certain admin pages (`/bracu/menu-management`, `/bracu/reports`,
`/bracu/memo`, `/bracu/public-link`) even immediately after a successful login — while other pages
in the same session (`/bracu/dashboard`, `/bracu/inventory`, `/bracu/tables`, `/bracu/analytics`,
`/bracu/users`, `/bracu/settings`) loaded fine.

Root cause: the JWT lives in a Zustand store persisted to `localStorage`
(`src/store/useStore.ts`, `persist` middleware, key `scms-store`). `persist` rehydrates
asynchronously — on a fresh page load there's a window (a few event-loop ticks, longer under load or
slow chunk loading) where `useStore().token` reads as `null` even though a valid token is sitting in
`localStorage`, before rehydration finishes and flips `hasHydrated` to `true` (the store already
tracks this exact flag, via `onRehydrateStorage`).

`src/components/ProtectedRoute.tsx` already gates its redirect effect on `hasHydrated` correctly.
But none of the five tenant-scoped route-group layouts used it — each reimplemented an inline guard
that checked only `token`:

```typescript
useEffect(() => {
  if (!token) router.replace(`/${slug}/login`)
}, [router, slug, token])
```

Whether a given navigation tripped the bug depended on timing (how fast the store rehydrated
relative to when the effect ran), which is why it looked inconsistent across pages/reloads rather
than affecting every page every time — a classic hydration race, not a per-page bug.

**Affected files (before fix):**
- `src/app/[tenant_slug]/(admin)/layout.tsx`
- `src/app/[tenant_slug]/(cleaner)/layout.tsx`
- `src/app/[tenant_slug]/(staff)/layout.tsx`
- `src/app/[tenant_slug]/(customer)/layout.tsx`
- `src/app/[tenant_slug]/(food-court)/layout.tsx`

All five are affected identically — this is systemic across every role, not specific to admin.

## Decision

Every tenant-scoped layout's auth-guard effect must check `hasHydrated` before checking `token` (or
any other persisted field), and must not render (or redirect) until `hasHydrated` is `true` —
mirroring the already-correct `ProtectedRoute.tsx` pattern (see `frontend/overview.md`'s "Auth-guard
pattern" section for the canonical shape). Applied to all five layouts listed above.

`(food-court)/layout.tsx`'s secondary `tenantType !== 'food_court'` redirect reads `tenantType`,
which is also part of the persisted store (`partialize` includes it) — so it was subject to the
exact same race and is now gated inside the same `if (!hasHydrated) return` as the token check,
not left separate. `(customer)/layout.tsx`'s BR-SEG-1 segment redirect (a distinct `useEffect` that
only reads `tenantType`, no `token`) was left unchanged: it's not a login-drop bug (it redirects to
`/unauthorized`, not `/login`), and a transient false-positive there self-corrects on the next
render once `tenantType` populates, since it doesn't clear auth state or wipe the token.

We did not consolidate all five into a single shared `ProtectedRoute`-wrapping layout in this pass —
each layout also renders its own distinct nav/shell, and a larger refactor to unify them is a
separate, larger-scope change than fixing the specific race. Flagged here as a reasonable future
cleanup, not done now.

## Consequences

**Positive:**
- Authenticated users landing on any tenant-scoped page via hard refresh, direct URL, bookmark, or
  new tab no longer get spuriously logged out.
- Fix is minimal and consistent with an existing, already-correct in-repo pattern — no new
  abstraction introduced.

**Negative:**
- Each layout still duplicates the guard logic inline rather than sharing one implementation — the
  duplication itself wasn't the bug, but it is why the fix had to be applied five times instead of
  once. A follow-up could extract a `useAuthGuard(slug)` hook shared by all five layouts.

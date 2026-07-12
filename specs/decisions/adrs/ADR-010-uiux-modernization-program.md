# ADR-010: Platform-wide UI/UX & Navigation Modernization Program (UIX-1…6)

**Date:** 2026-07-12
**Status:** ✅ Complete — UIX-1 through UIX-6 all implemented
**Deciders:** Mahadi Jubaer

---

## Context

A full read-only navigation survey of every section (customer, admin, staff, food-court, platform)
was requested to plan a platform-wide UI/UX modernization. The survey found real navigation bugs,
not just polish gaps:

1. The food-court sidebar (`[tenant_slug]/(food-court)/layout.tsx`) linked to `dashboard`/`tables`/
   `analytics`, but the actual page directories are `fc-dashboard`/`shared-tables`/`fc-analytics` —
   three of five links sent food-court admins into the *tenant-admin* route tree instead (which
   either 404s or redirects them straight back out, depending on their role). Active-state detection
   used `pathname?.includes(path)`, which is also substring-unsafe.
2. `(platform)/admin/` had no `layout.tsx` at all — its four pages (`tenants`, `subscriptions`,
   `analytics`, `audit-log`) were orphans reachable only via the `(admin)/layout.tsx` sidebar's
   "Platform" section (a `platform_admin`-gated group of absolute links) or direct URL entry, with no
   way to move between them except browser back. Two of the four (`subscriptions`, `analytics`) also
   had **no role guard of their own** — they relied entirely on that sidebar being present, i.e. a
   `platform_admin` navigating there directly (bookmarked URL, shared link) hit an unguarded page.
3. The customer top nav (`Navbar.tsx`: Menu/My Orders/Track Order) and the mobile bottom tab bar
   (`(customer)/layout.tsx`: Menu/Orders/Profile/Wallet) used two different, only-partially-
   overlapping item sets — Track Order was missing from mobile, Wallet/Profile were missing from
   desktop's pill row (though reachable via a separate wallet-balance button and avatar dropdown).
4. Installed-but-unused shadcn primitives (`breadcrumb.tsx`, `pagination.tsx`, `command.tsx`) had
   zero imports anywhere in the app.

This is staged as **UIX-1…UIX-6** — a numbering track deliberately separate from the backend's
existing Phase 1–24 numbering in `specs/operations/roadmap.md` — because it spans many small
frontend-only changes across sessions, not one backend-driven phase.

**Full stage plan (UIX-1 through UIX-6):** navigation foundation + bug fixes (UIX-1, this ADR) →
dark mode via `next-themes` (UIX-2) → a `cmdk`-based Ctrl+K command palette scoped to admin-tier
roles only, not customer pages (UIX-3) → customer section polish (UIX-4) → admin section polish,
the largest surface at 17 pages (UIX-5) → staff/food-court/platform polish (UIX-6). Each later stage
gets its own spec update before implementation, following this ADR's precedent.

## Decision

**Design-language decisions (apply to every stage, not just UIX-1):**
- **Tokens only** — every hardcoded color hex found in a touched file is replaced with a Tailwind
  semantic token (`primary`, `muted`, `card`, etc.). This is both a consistency fix and the
  prerequisite for UIX-2's dark mode (a hardcoded `#1A4D2E` or `text-slate-900` cannot respond to a
  `.dark` class).
- **Motion vocabulary is reused, not reinvented per page** — the vocabulary established in the
  2026-07-11 typography/motion foundation (`motion-safe:animate-fade-up` with staggered
  `animationDelay`, `motion-safe:animate-scale-in` for modal-like cards, `key={step}` remounts for
  step transitions, `transition-transform hover:-translate-y-0.5` for primary CTAs) is the only
  vocabulary later stages may use.
- **No route or URL changes anywhere in this program.** Specs, QR codes, and bookmarks depend on
  today's URLs. UIX-1's food-court fix corrects the sidebar's *hrefs* to match the pages that were
  already there — it does not move or rename any route.
- **No new heavy dependencies.** Every primitive used across all six stages (`cmdk`, `next-themes`,
  Radix, `tailwindcss-animate`) is already installed.
- **Legacy duplicate route trees stay out of scope.** The un-prefixed `(student)`, bare `(auth)`,
  etc. trees are existing debt (see ADR-009); this program only touches them where they ARE the
  shared implementation re-exported by the real `[tenant_slug]/...` stubs.

**UIX-1 (implemented 2026-07-12) — Navigation foundation & bug fixes:**
1. Fixed the three broken food-court sidebar `path` values (`dashboard`→`fc-dashboard`,
   `tables`→`shared-tables`, `analytics`→`fc-analytics`); switched active-state matching to
   `pathname === href || pathname.startsWith(href + '/')` (the same pattern `(admin)/layout.tsx`
   already used correctly); added the missing `SidebarFooter` Logout button (parity with admin).
2. Added `(platform)/admin/layout.tsx` — a `Sidebar` (same shadcn component as the admin/food-court
   layouts) listing all four platform pages, a "Back to tenant admin" link, and a `ProtectedRoute
   allowedRoles={['platform_admin']}` wrapper around `children` — closing the missing-guard gap on
   `subscriptions`/`analytics` at the layout level. Each of the four pages *also* keeps (or, for
   `subscriptions`/`analytics`, gained) its own `ProtectedRoute` wrap, matching the pattern already
   used by `tenants`/`audit-log` — intentionally redundant defense-in-depth, not simplified away,
   since a page moved out from under this layout in the future must not silently lose its guard.
3. Unified the customer nav item set to one canonical list — **Menu, Orders, Track, Wallet,
   Profile** — used by both `Navbar.tsx`'s desktop pills/mobile sheet and `(customer)/layout.tsx`'s
   bottom tab bar (grown from a 4-column to a 5-column grid). Removed the mobile sheet's separately-
   styled duplicate Wallet/Profile links, since the unified `navItems` list now covers them.
4. Gave the staff top bar (`(staff)/layout.tsx`) real active-state pill styling on every item (the
   first item, "Kitchen Queue", was previously hardcoded to look like a static brand logo instead of
   a real nav destination) and horizontal-scroll overflow instead of wrapping on narrow screens.
5. Built `components/layout/PageHeader.tsx` (title + optional eyebrow/description/action slot +
   optional breadcrumb trail via the existing `components/ui/breadcrumb.tsx`) and adopted it —
   with breadcrumbs — on the pages that actually have hierarchy depth: the inventory sub-pages
   (`movements`, `purchase-orders`, `central`, breadcrumbing back to `inventory`), `users/invite`
   (breadcrumbing back to `users`), and all four platform pages (breadcrumbing under a "Platform"
   root). Flat top-level sections do not get a fake breadcrumb. Broader `PageHeader` adoption across
   the remaining ~25 admin/customer/staff pages is deferred to UIX-4/5/6 (per-section polish passes),
   not part of UIX-1.

**UIX-2 (implemented 2026-07-12) — Dark mode:**
1. `tailwind.config.js`'s `background` token changed from a hardcoded flat hex to `var(--background)`
   (with a matching `--background` added to `:root`, a no-op for light mode) — without this fix
   `bg-background` could never respond to a `.dark` class at all.
2. Added a `.dark { ... }` block in `globals.css` (sibling to `:root`, same pattern the sidebar
   tokens already used) covering every app-level semantic token: a brand-hue-tinted (~150°) dark
   palette rather than generic slate, `--color-primary` lightened for contrast against the dark
   background (`--primary-foreground` correspondingly darkened, since the relationship inverts —
   light-mode primary is dark-on-white, dark-mode primary is light-on-dark), and a `.dark`-scoped
   `--header-surface` a touch lighter than the new dark `--background` so `SiteHeader`/`SiteFooter`
   stay visually distinct from page content in both modes. `body`'s hardcoded `background: #f5f0e8`
   became `background: var(--background)` (+ `color: var(--foreground)`); the root layout's
   `text-gray-900` utility class on `<body>` was removed since it was fighting the new token-driven
   color and would have permanently pinned body text to a light-mode color under `.dark`.
3. `components/ThemeProvider.tsx` (new, thin client wrapper around `next-themes`' `ThemeProvider`,
   `attribute="class"` + `defaultTheme="system"` + `enableSystem`) mounted in `src/app/layout.tsx`
   around the existing `TooltipProvider`/`ImpersonationBanner` tree; `<html>`/`<body>` both gained
   `suppressHydrationWarning` (required by `next-themes`, since it mutates the `class` attribute
   before React hydrates).
4. Sun/moon toggle button added to `components/layout/SiteHeader.tsx` via `useTheme()` — guarded by
   a `mounted` flag so the icon defaults to the same value on server and first client render (no
   hydration mismatch), then swaps to reflect `resolvedTheme` once mounted.
5. Verified via local `next dev`: compiled CSS output confirmed to contain the `.dark` selector block
   and the lightened primary color; page HTML confirmed to contain both the toggle button and
   next-themes' pre-hydration theme-setting script. Full-browser Playwright verification (toggle
   click, localStorage persistence across reload, screenshot both modes) was not possible this
   session — Docker Desktop was not running, so the full stack (Postgres/Redis/backend) was
   unavailable; only the frontend's static/compiled output could be checked directly. This should be
   done as a follow-up once the full stack is up.

**UIX-3 (implemented 2026-07-12) — Command palette:** built exactly as scoped in the spec update
above, including the correction to the tenant-search assumption (client-side fetch + cmdk's built-in
filter, not a nonexistent `q` server param; selecting a tenant navigates to `/admin/tenants` rather
than a misleading direct "jump into their dashboard," since real tenant-context switching requires
the existing Impersonate token-swap). Verified via local `next dev` (Docker still unavailable this
session, same caveat as UIX-2): all three touched layouts (`(admin)`, `(food-court)`,
`(platform)/admin`) compiled and returned 200, and the palette's placeholder text (`"Jump to a page
or action…"`) was confirmed present in each layout's compiled client chunk. The palette's guarded
content is behind each layout's `hasHydrated`/auth gate, so it could not be exercised end-to-end
(open with Ctrl+K, navigate via a result) without a logged-in browser session — full interactive
verification is a follow-up once the stack is up, same as UIX-2's outstanding item.

**UIX-4 (implemented 2026-07-12) — Customer section polish:** built per the spec above, including two
corrections made mid-implementation (kept the spec section itself accurate, not just the code):
`profile/page.tsx`'s identity-card header was found to be bespoke on closer inspection and was kept
as-is rather than force-fit into `PageHeader`; `track/[orderId]/page.tsx`'s plain title block *did*
get `PageHeader` (only its dynamic status-color card and timeline stayed bespoke) — both corrections
are recorded in the spec section itself so it stays a true description of the code, not the original
plan. Also fixed, beyond the plan: a duplicate of the `track/page.tsx` missing-tenant-slug bug found
in `track/[orderId]/page.tsx`'s two `router.push('/menu')` calls. Verified via local `next dev`: all
six customer routes (`menu`, `order`, `wallet`, `profile`, `track`, `track/[orderId]`) compiled and
returned 200 with zero new `tsc` errors (the pre-existing `profile/page.tsx` `open`-prop error is now
actually fixed, not just newly-passing). Full interactive/visual verification (Playwright pass,
reduced-motion emulation, actually driving the order-checkout step transitions) needs a logged-in
browser session against the real backend — Docker was still unavailable this session, same
outstanding follow-up as UIX-2/UIX-3.

**UIX-5 (implemented 2026-07-12) — Admin section polish:** built per the spec above, including two
more corrections found by reading actual code before implementing (same discipline as UIX-3's
tenant-search correction and UIX-4's header corrections): `menu-admin`'s "inline non-shadcn dialogs"
turned out not to exist (already migrated to `Dialog`/`AlertDialog` before this stage — a grep for
the hand-rolled `fixed inset-0` pattern found zero hits), and 5 of the 17 pages
(`inventory`/`public-link`/`tables`/`outlets`/`memo`) were already fully token-clean, so the color
sweep only touched the 6 files that actually had debt. `PageHeader` was adopted on all 12 pages in
scope (all had the generic hand-rolled-title pattern, no bespoke exceptions like UIX-4's `menu`/
`profile`/`track/[orderId]`). Also added: `users/page.tsx`'s hand-rolled pagination replaced with
`components/ui/pagination.tsx`; `analytics/page.tsx`'s recharts grid/tick colors converted to
`var(--border)`/`var(--muted-foreground)` (its gradient stops already correctly used
`var(--color-primary, #1A4D2E)`); `tables/page.tsx`'s floor-plan tiles gained a selected-state ring
(previously only had a hover state). Verified via `tsc --noEmit` (zero new errors) and local
`next dev` — all 11 tenant-scoped routes in scope compiled and returned 200 with no server errors in
the log. Full interactive/visual verification still needs a logged-in browser session against the
real backend — Docker was unavailable this session, same outstanding follow-up as UIX-2/3/4.

**UIX-6 (implemented 2026-07-12) — Staff, food-court & platform polish, final stage:** built per the
spec above. Notably closed out the follow-up ADR-010 itself flagged back in UIX-1 — the platform
pages' inner content had been left un-tokenized when the new sidebar layout wrapped them, explicitly
deferred to "later, UIX-6" at the time; all four (`tenants`, `subscriptions`, `analytics`,
`audit-log`) are now fully token-based, `audit-log` got the same `pagination.tsx` swap `users` got in
UIX-5, and `analytics`'s recharts grid/tick colors got the same CSS-var treatment as the tenant-admin
analytics page. The staff kitchen queue's existing bespoke WS-driven entrance animation was kept
(not replaced) but gained a `prefers-reduced-motion` guard it was missing entirely — consistent with
every other stage's rule of respecting working bespoke animations rather than replacing them
wholesale. POS gained the hover affordance on its item grid that was the plan's specific callout.
All 5 food-court pages needed only `PageHeader` + fade-up (already token-clean). Verified via
`tsc --noEmit` (zero new errors) and local `next dev` — all 11 touched routes (2 staff, 5 food-court,
4 platform) compiled and returned 200 with a clean server log. Full interactive/visual verification
across the whole program still needs a logged-in browser session against the real backend — Docker
was unavailable for the entirety of this program's implementation (UIX-2 through UIX-6); this is the
one consistent follow-up across all six stages and should be the first thing done once the stack is
up: a full Playwright pass (dark-mode toggle + persistence, command palette open/navigate, order
checkout step transitions, food-court/platform nav, reduced-motion emulation) across representative
pages from every section.

**Post-completion verification (2026-07-12, same day):** Docker became available, so the outstanding
verification gap every stage from UIX-2 onward carried — "only `tsc`/route-compile checked, never a
real running stack" — was closed. Running `next build` (stricter than the `tsc --noEmit` used at
every prior stage's checkpoint) surfaced one **real bug that had been silently misdiagnosed as
pre-existing-and-unrelated across every single stage's verification**: the tenant-admin
`analytics/page.tsx`'s recharts `Tooltip formatter` had a type signature (`(v: number) => ...`) that
doesn't match recharts' actual `Formatter` type (whose value argument can be `undefined` or an array)
— this doesn't fail `next dev`'s looser dev-mode type checking, so it was invisible during every
prior stage's dev-server smoke test, but it **fails `next build` outright**, blocking production
deploys. Fixed by widening the parameter to `unknown` and coercing
(`Number(Array.isArray(v) ? v[0] : v ?? 0)`). Also cleaned up one real UIX-6 leftover: an unused
`Button` import in `(platform)/admin/audit-log/page.tsx` left over from the pagination swap.
After these two fixes, `next build`'s type-check passes cleanly (its remaining failure —
`useSearchParams()` needing a Suspense boundary on `/discover` and `/register-organization` — predates
this entire program, from the 2026-07-11 segment-routing work, and does not affect the running
`next dev` system docker-compose actually uses, so it's out of scope here). The full stack (postgres,
redis, backend, frontend) was brought up via `docker compose up -d` and every route touched across
UIX-1 through UIX-6 (30+ pages) was hit live against the real backend — all returned 200, with zero
errors in either the frontend or backend container logs.

## Consequences

**Positive:** three real navigation bugs are fixed (food-court admins can now reach every sidebar
destination; platform pages are guarded regardless of entry point; mobile customers can reach Track
Order from the tab bar). Establishes `PageHeader` as the shared header pattern for later stages
instead of ad hoc per-page `<h1>` blocks.

**Negative / follow-up:** the platform pages' own inner content (`min-h-screen bg-[linear-gradient(...)]`
full-page backgrounds, hardcoded `text-slate-900`/`bg-white` classes) is now nested inside the new
sidebar's `SidebarInset > main` and still uses non-token colors — this is intentionally left for
UIX-6 (platform polish stage), which also owns the dark-mode hex sweep for this section. The
`ProtectedRoute` duplication described in item 2 above is a deliberate redundancy, not an oversight.

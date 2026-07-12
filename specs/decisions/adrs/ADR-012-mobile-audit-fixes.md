# ADR-012: Mobile Viewport Audit — Category Management and Three Related Overflow/Consistency Bugs

**Date:** 2026-07-12
**Status:** Accepted
**Deciders:** Mahadi Jubaer

---

## Context

A bug report at a 400×832 phone viewport (`/al-test/menu-management`) showed the admin console's
functionality apparently missing on mobile. `ADR-010` (UIX-1…6) already did a platform-wide
navigation and polish pass, but that program's own scope notes (`specs/frontend/overview.md`) never
included a dedicated phone-viewport regression pass across every role's layout — this ADR is that
pass, done live (reading every layout/page, not assuming the UIX program covered it).

Audited: every role layout (tenant-admin, food-court, platform-admin, staff, cleaner, customer) and
the data-heavy admin pages (inventory, tables, users, reports, analytics, outlets, menu management).
Most of the platform is already correct at phone width — the Sidebar's mobile `Sheet` drawer works
via a reachable trigger, dialogs are width-fluid (`max-w-lg`, not fixed px), most form grids already
collapse to one column below `sm`, the staff top bar already got UIX-1 mobile handling
(`overflow-x-auto` tab row, `hidden sm:inline` logout label), the customer bottom nav and cart sheet
are already responsive, and shadcn's base `Table` primitive auto-wraps in a scroll container. None of
that needed touching. Four real, distinct bugs did not:

**1. Category management (create/rename/delete) is completely unreachable on mobile.**
`app/(admin)/menu-admin/page.tsx` (the page behind `/menu-management`) hides its category panel
entirely below `lg` (1024px — the whole phone range):
```
<aside className="hidden w-56 shrink-0 border-r border-border bg-card p-4 lg:block">
  <CategoryManager ... />
</aside>
```
The only mobile fallback is a bare `<Select>` for *picking* an existing category — no create, rename,
or delete affordance exists below `lg` at all. This is the exact bug the screenshot shows.
Additionally, `CategoryManager`'s edit/delete icon buttons are hover-only
(`opacity-0 group-hover:opacity-100`), which never reveals on a touch device — so even a naive "just
also show this component on mobile" fix would leave those actions undiscoverable.

**2. Inventory page (`[tenant_slug]/(admin)/inventory/page.tsx`) overflows at 375px** in two places:
a 3-button `PageHeader` action row with no wrap, and a `CardHeader` row pairing a title with a
320px-capped search `Input` that can't coexist at that width. Both are unwrapped `flex` rows with no
responsive fallback.

**3. The cleaner top bar (`[tenant_slug]/(cleaner)/layout.tsx`) has no mobile handling** — no
truncation on its title, no responsive hiding of the "Logout" label — unlike its sibling
`[tenant_slug]/(staff)/layout.tsx`, which already received this exact treatment in UIX-1.

**4. Three sidebar-based layouts double-render at 768–1023px.** The shared `Sidebar` primitive
(`components/ui/sidebar.tsx`) switches between its mobile `Sheet` drawer and fixed desktop sidebar at
`md` (768px, via `useIsMobile`'s threshold and the desktop container's own `hidden md:flex`). But
`[tenant_slug]/(admin)/layout.tsx`, `[tenant_slug]/(food-court)/layout.tsx`, and
`(platform)/admin/layout.tsx` all gate their mobile trigger `<header>` on `lg:hidden` (1024px)
instead of `md:hidden` — so in the 768–1023px band, both the fixed desktop sidebar and the "mobile"
trigger header render simultaneously.

## Decision

Fix all four, using only patterns already established in this codebase — no new UI primitives:

1. **Category management:** add a small icon-button `Sheet` trigger (shadcn `Sheet`, the same
   mobile-overlay primitive already used for the Sidebar drawer and `CartSidebar`'s mobile cart) next
   to the existing mobile `<Select>`, hosting a second `<CategoryManager>` instance with identical
   props for full CRUD. `CategoryManager`'s icon-button visibility becomes
   `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` — always visible below `sm` (touch range),
   hover-gated at `sm`+ (desktop `<aside>` only renders at `lg`+, so its behavior is unchanged).
2. **Inventory page:** `flex-wrap` on the button row; the title/search row stacks below `sm`
   (`flex-col gap-3 sm:flex-row ...`), search input goes `w-full sm:max-w-xs`. `flex-wrap` alone was
   insufficient — `components/layout/PageHeader.tsx`'s shared `action` wrapper is `shrink-0` with no
   width, so it sizes to its unwrapped content width regardless of the inner `flex-wrap`. Fixed at
   that shared source (`shrink-0` only from `sm:` up, `w-full` below it) rather than working around
   it locally, since any future multi-item `action` on any of the 13 pages using `PageHeader` would
   hit the same bug.
3. **Cleaner layout:** port the staff layout's exact mobile pattern — `truncate`/`min-w-0` title,
   `shrink-0` logout button, `hidden sm:inline` logout label.
4. **Breakpoint alignment:** the three layouts' mobile-header wrapper changes `lg:hidden` →
   `md:hidden`, matching the breakpoint that already governs the Sidebar primitive itself.

## Rationale

Every fix reuses an existing project convention rather than introducing a new one: `Sheet` is already
the mobile-overlay idiom here; the staff layout's truncate/shrink-0/hidden-label pattern is already
proven and just needed porting to its sibling; the breakpoint fix removes an inconsistency rather
than choosing a new value (picking `md` because that's what the underlying primitive already uses,
not an arbitrary choice). This keeps the fix set small, consistent, and low-risk — no new dependency,
no new component, no behavior change above the relevant breakpoint in any case.

## Addendum — a fifth bug found during verification

Screenshotting the desktop (1440px) regression case for issue 1 surfaced a fifth, unrelated,
pre-existing bug: on a tenant with a long name, the sidebar header's `⌘K` hint badge visually
overlapped the adjacent `menu-management` page's own `CATEGORIES` panel. Root cause was the exact
same structural pattern as issue 2's `PageHeader` bug — the header's `flex items-center
justify-between` row had no `w-full`, and its title `<span>` had `truncate` but no `min-w-0` on its
flex-item ancestor (flex items default to `min-width: auto`, which blocks `truncate` from ever
engaging), so a long tenant name pushed the whole row wider than the sidebar's actual rendered width,
carrying the `⌘K` badge past the sidebar's edge into the neighboring page content. Fixed identically
in all three sidebar layouts (`w-full` on the row, `min-w-0` on the title wrapper) — confirmed via
bounding-box measurement that the badge and the neighboring panel no longer overlap, and that a long
tenant name now correctly truncates with an ellipsis instead of forcing the row wider than its
container.

## Consequences

**Positive:**
- Full category CRUD is reachable on every viewport, not just desktop.
- No more off-screen buttons/inputs on the inventory page at phone width.
- Cleaner layout matches the same mobile-readiness bar as every other role's layout.
- No more redundant double-header in the tablet-width band across three consoles.

**Negative:**
- None identified — every change is additive Tailwind classes or a new `Sheet` instance reusing
  existing component/handler logic; no removed functionality, no changed API surface.

**Neutral / Trade-offs:**
- The command palette (⌘K) remains desktop/keyboard-only — audited and left as-is, since its
  contents duplicate the already-reachable visible nav (confirmed via the `visibleNav`-sourced
  `paletteItems` pattern each layout already uses), so nothing is hidden exclusively behind it. Not
  worth building a touch equivalent for a power-user shortcut with no functional gap.

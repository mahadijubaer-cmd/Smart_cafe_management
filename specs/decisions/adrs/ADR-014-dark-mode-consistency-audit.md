# ADR-014: Dark Mode Consistency Audit — Shared Primitives, Cleaner Section, and a Tailwind Content-Glob Bug

**Date:** 2026-07-22
**Status:** Accepted
**Deciders:** Mahadi Jubaer

---

## Context

A user report — "in many pages, the dark mode doesn't work properly, the toggle isn't visible at
all" — triggered a full re-audit. `ADR-010` (UIX-2) shipped the dark-mode *shell* (provider, toggle,
token infrastructure) on 2026-07-12, and `frontend/overview.md`'s UIX-4/UIX-5/UIX-6 sections and the
2026-07-16 QA pass both describe a series of per-section token sweeps that, read together, imply the
app should be fully dark-aware today. Live-browser testing showed that isn't true: the toggle itself
works correctly (confirmed via `document.documentElement.className` flipping `light`↔`dark` on
click), but several pages and shared primitives visibly stayed light.

Root-caused into two categories:

**1. Files never actually covered by any prior stage.** Re-reading UIX-2 through UIX-6 and the QA
pass line by line against the current codebase found real gaps in what those stages *claimed* vs.
what they *touched*:
- `components/ui/{card,alert-dialog,alert,switch}.tsx` — UIX-2 described shadcn primitives as
  "already using semantic tokens throughout `components/ui/*`," but `CardTitle`/`CardDescription`
  (`text-slate-900`/`text-slate-600`), `AlertDialogContent`/`AlertDialogTitle`/`AlertDialogDescription`
  (`bg-white`/`text-slate-900`/`text-slate-600`), `Alert`'s `default`/`success`/`warning` variants
  (`bg-slate-50`/`bg-emerald-50`/`bg-amber-50` with no `dark:` counterpart), and `Switch`'s unchecked
  track (`bg-gray-300`) were never actually swept. Since `Card`/`AlertDialog` alone are imported by
  40+ files, this is the single highest-leverage gap — it explains most of the "many pages" framing
  in the original report even though no individual page file was at fault.
- `(cleaner)/tables/page.tsx` (served at both the legacy `/tables` route and, via a one-line
  re-export, the real `[tenant_slug]/(cleaner)/cleaning-queue` route) — `ADR-012`'s mobile audit
  touched this file's *layout* (top-bar truncation) but no stage ever did its *color* token sweep.
  Confirmed live: the entire cleaner queue (headings, empty-state, "Completed Today" panel) stayed
  hardcoded light (`bg-white`, `text-slate-900/700/500`, a fixed light-only page gradient).
- `components/menu/CategoryTabs.tsx` + `lib/category.ts`, `components/admin/HourlyHeatmap.tsx`,
  `components/order/{TableGrid,TimeSlotPicker}.tsx`, `app/unauthorized/page.tsx` — none of these are
  named anywhere in UIX-2 through UIX-6 or the QA pass; they were simply missed by every prior
  survey, each carrying a small hardcoded-slate/white patch.
- `[tenant_slug]/(auth)` split-panel auth pages — `frontend/overview.md`'s own 2026-07-21 entry for
  `globals.css`'s `.light` escape-hatch class says "some surfaces (auth/onboarding cards) are
  hardcoded to a light card... Apply this class to the root of such a surface" — but grepping the
  codebase found **zero** call sites for `className="light"` anywhere. The escape hatch was
  documented and built but never actually wired to `SplitAuthPanel`, so the exact failure mode the
  comment warns about (muted-foreground/label text resolving to `.dark`'s palette on a card that
  stayed visually white) was live in production the whole time.
- `app/discover/page.tsx`'s `<main>` root — hardcoded `bg-slate-50`. `/discover` is not one of the
  three chromeless routes (`/`, `/register-organization`, `/[slug]/register`), so it has a working
  toggle in its header, but the page body never responded to it. Not mentioned in any prior stage's
  scope notes.
- **`track/[orderId]/page.tsx`'s per-status `Card` colors** — UIX-4 (`frontend/overview.md`,
  2026-07-12) explicitly said these were deferred: *"categorical status colors... giving each a
  dark-mode counterpart is real work... folded into UIX-6's dark-safe sweep, not this pass."* UIX-6's
  own text, when it revisits the identical pattern for the staff kitchen-queue page, instead just
  re-states the same "kept as-is" exception rather than delivering the promised dark counterpart —
  the deferred work was never actually done for either page. This ADR completes it for the
  **customer-facing `track/[orderId]` page only**; the staff kitchen-queue's equivalent
  `statusStyles` map is intentionally left untouched and still deferred (out of scope here — no user
  report named it, and touching two independent color maps in one pass raises this diff's risk for no
  reported benefit).

**2. A real, previously-undiagnosed build-config bug.** While verifying `CategoryTabs`' fix live
(`/bracu/menu`, toggling dark mode), two of five category pills picked up their new `dark:` classes
correctly (`Beverages`, `Homemade`) while three did not (`Breakfast`, `Lunch`, `Snacks`) — despite all
five being defined identically, as sibling entries in the same `lib/category.ts` map. Root cause:
`tailwind.config.js`'s `content` array only scans `src/{pages,components,app}/**` — it has never
included `src/lib/**`. Tailwind's JIT purge only emits a utility class into the built CSS if it finds
the literal class-name string somewhere in a scanned file's text; a class that exists *only* inside
`lib/category.ts` (never duplicated verbatim in a scanned component/page) is silently dropped, no
build warning. The two pills that happened to work only did so by coincidence — this same pass also
added `dark:bg-emerald-950/40`/`dark:bg-sky-950/40` inside `components/order/TableGrid.tsx` (a
scanned file), which generated those two specific utility classes globally, incidentally rescuing
`Homemade`/`Beverages`'s otherwise-identical classes in `category.ts`. This means **any** Tailwind
class defined only in a non-component/page `.ts` file in this codebase has been silently
non-functional since the `content` array was first written — `lib/category.ts` was the only file in
`src/lib/` using raw Tailwind color classes at audit time (confirmed by grep), but the config gap
itself is the durable bug, not just today's one file.

## Decision

1. **Fix the four shared `components/ui/*` primitives** at their source (one edit each fixes every
   importer): `CardTitle`/`CardDescription` → `text-foreground`/`text-muted-foreground`;
   `AlertDialogContent` → `bg-card text-card-foreground`; `AlertDialogTitle`/`Description` →
   `text-foreground`/`text-muted-foreground`; `Alert`'s `default` variant → `border-border bg-muted
   text-foreground`, `success`/`warning` variants keep their light emerald/amber but gain a
   `dark:` counterpart (`dark:bg-{color}-950/40 dark:text-{color}-200 dark:border-{color}-800` —
   translucent-dark rather than opaque, so status alerts still read as "the same hue, dark" rather
   than an unrelated color, matching the reasoning `globals.css` already uses for
   `--header-surface`); `Switch`'s unchecked track gains `dark:data-[state=unchecked]:bg-slate-700`.
2. **Token-sweep the cleaner queue page** (`(cleaner)/tables/page.tsx`, covering both routes that
   serve it): all `text-slate-*` → `text-foreground`/`text-muted-foreground`, `bg-white` →
   `bg-card`, the light-only page gradient → flat `bg-background` (same "no dark-specific gradient
   token exists, a flat themed background is the correct trade" call UIX-4 already made for the
   customer pages' decorative washes), completed-today's emerald cards gain the same
   `dark:bg-emerald-950/40` treatment as the `Alert` success variant above.
3. **Token-sweep the five previously-unsurveyed files**: `CategoryTabs.tsx`'s fallback color and
   item-count badge, `lib/category.ts`'s seven category colors (each gains a `dark:` triplet),
   `HourlyHeatmap.tsx`'s zero-intensity bar/legend swatch (`bg-slate-100` → `bg-muted`),
   `TableGrid.tsx`'s `statusStyles`/`zoneLabels`/badge/inline-gradient background (the last converted
   from a hardcoded `rgba(255,255,255,...)` gradient to `bg-gradient-to-b from-card to-muted`, which
   is theme-reactive since `card`/`muted` are CSS variables), `TimeSlotPicker.tsx`'s "Available"
   badge, `unauthorized/page.tsx`'s heading/body text.
4. **Wire the already-built `.light` escape hatch to `SplitAuthPanel.tsx`** (`className="light ..."`
   on its root) rather than inventing a new mechanism — this is the exact use case
   `globals.css`'s 2026-07-11-era comment already describes and was simply never connected to
   anything.
5. **Fix `/discover`'s `<main>`** from `bg-slate-50` to `bg-background`.
6. **Add dark variants to `track/[orderId]/page.tsx`'s `statusCardStyles`** (5 statuses, each
   `dark:bg-{color}-950/30 dark:border-{color}-800 dark:text-{color}-100`, `delivered`/`cancelled`
   collapsed to plain `bg-card`/`border-border` since they have no meaningful "success/warning" hue
   to preserve), plus the page's other hardcoded white overlays (`InfoChip`, the status-icon circle,
   the "Live signal" panel, the QR-code box) and removing a redundant literal-color override on the
   `Alert` success banner now that the primitive itself (fix 1) carries the right colors.
7. **Add `'./src/lib/**/*.{js,ts,jsx,tsx,mdx}'` to `tailwind.config.js`'s `content` array** — the
   structural fix for the purge bug, not a per-class workaround. Verified live: after this change and
   a container restart, all five category pills (not just the two that were accidentally rescued)
   render their dark variant correctly.

## Rationale

Every fix reuses a token/pattern this codebase already established — `text-foreground`/
`text-muted-foreground`/`bg-card`/`bg-muted`/`border-border` throughout, the `dark:bg-{hue}-950/40`
translucent-overlay convention for categorical status colors (first established implicitly by this
ADR, now the pattern for any future categorical color needing a dark counterpart), and the `.light`
class that already existed in `globals.css` waiting to be used. No new CSS variables, no new
component, no new dependency. Fixing the four shared primitives first, before any page-level sweep,
maximizes fix-to-line-changed ratio: four small edits cover the majority of pages the original report
was about, before any per-page work even starts. The Tailwind `content` glob fix is structural rather
than adding the missing classes as a safelist or duplicating them into a scanned file, because a
safelist/duplication fix only patches today's one offending file and leaves the same trap for the
next developer who adds a Tailwind class inside any `src/lib/*.ts` file.

## Consequences

**Positive:**
- The four shared UI primitives (`Card`, `AlertDialog`, `Alert`, `Switch`) are now dark-safe for
  every current and future importer — no more per-page patching needed for these components.
- The cleaner role's entire queue page, previously 100% light-locked, now fully respects the toggle.
- The `.light` escape hatch is finally load-bearing, closing a real (if narrow) bug where an
  auth-flow form's label/placeholder text could render at low-to-zero contrast against its
  intentionally-still-white card if a visitor had the site set to dark.
- The Tailwind content-glob fix prevents an entire class of *future* silent styling bugs for any
  color/variant map placed under `src/lib/`, not just `category.ts`.
- Verified end-to-end against the live local stack (Docker), not just read as a code diff: `/discover`,
  `/{slug}/cleaning-queue`, `/{slug}/menu`'s category tabs, `/{slug}/login`, and `/unauthorized` were
  each screenshotted in both themes before/after.

**Negative:**
- None identified — every change is either an additive `dark:`/token class or a config-file content
  glob addition; no removed functionality, no API surface change, no visual change in light mode
  (confirmed by re-screenshotting light mode after each fix).

**Neutral / Trade-offs:**
- The staff kitchen-queue page's own categorical `statusStyles` map (structurally identical to the
  customer `track/[orderId]` one fixed here) is left deferred, as UIX-6 originally scoped it — not
  reported broken, and bundling an unreported fix into this diff would widen review surface for no
  concrete benefit.
- `TableGrid.tsx`'s decorative radial-gradient background lost its subtle primary-hued vignette in
  the flatten-to-token conversion (now a plain two-stop `card`→`muted` gradient) — a minor visual
  simplification accepted in exchange for correct dark-mode behavior, same trade-off UIX-4 already
  made for the customer pages' own decorative washes.

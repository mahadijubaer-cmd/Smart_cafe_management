# Frontend Overview

**Framework:** Next.js 14 (App Router)  
**Language:** TypeScript 5.x  
**Last verified:** 2026-07-08

---

## Tech Stack

| Technology | Purpose | Notes |
|---|---|---|
| Next.js 14 | Framework (App Router) | `src/app/` directory |
| TypeScript | Type safety | Strict mode |
| Zustand | Client state | Persisted to localStorage |
| Axios | HTTP client | JWT injected via request interceptor |
| react-hook-form | Form management | — |
| zod | Schema validation (forms) | — |
| react-hot-toast | Toast notifications | — |
| date-fns | Date formatting | — |
| papaparse | CSV parsing | — |
| Tailwind CSS | Styling | Base styling layer |
| shadcn/ui | `components/ui/*` primitives | ✅ [2026-07-08] Adopted — see below |
| class-variance-authority | Variant styling for `components/ui/*` | — |
| tailwind-merge / clsx | `cn()` helper (`src/lib/utils.ts`) | — |
| @radix-ui/react-* (`slot`, `alert-dialog`, `switch`, `tooltip`, `label`, `dialog`, `dropdown-menu`, `select`, `tabs`, `popover`, `avatar`, `checkbox`, `radio-group`, `scroll-area`, `separator`, `progress`) | Accessible primitives under `components/ui/*` | — |
| cmdk, sonner, next-themes | Command palette / toast / theme primitives used by shadcn's `command.tsx`/`sonner.tsx` | `sonner` is separate from the app's existing `react-hot-toast` — both currently present, see note below |
| @dnd-kit | Drag-and-drop | ❌ Phase 16 — NOT YET INSTALLED |
| next/font/google (Manrope, Inter) | Typography | ✅ [2026-07-11] Adopted — see below |
| tailwindcss-animate | Motion (CSS-only, ~0kb JS) | ✅ [2026-07-11] Adopted — see below |
| next-themes | Dark mode (`ThemeProvider`, `attribute="class"`) | ✅ [2026-07-12] Adopted for UIX-2 — see "Dark mode" below (installed earlier, unused until now) |

> **shadcn/ui adoption (2026-07-08):** Started as a targeted reimplementation of
> `components/ui/{button,card,input,label,switch,alert,alert-dialog,tooltip}.tsx` on real shadcn/ui
> conventions (Radix UI primitives + `cva` + `cn()`), replacing the previous hand-rolled lookalikes,
> with every exported name/prop kept identical to the old versions **except `Tooltip`**, which now
> follows shadcn's `TooltipProvider`/`Tooltip`/`TooltipTrigger`/`TooltipContent` split (previously a
> single component with `content`/`children`/`side` props). `TooltipProvider` is mounted once in the
> root layout (`src/app/layout.tsx`), alongside `ImpersonationBanner`.
>
> The same day, the real `shadcn` CLI (`npx shadcn add ...`) was run directly against the repo,
> which (a) regenerated `button.tsx` and `label.tsx` to the canonical shadcn output (functionally
> equivalent to the manual reimplementation, but with the exact upstream class list/exports) and
> (b) added ~20 further primitives not yet used anywhere in the app: `avatar`, `badge`, `breadcrumb`,
> `checkbox`, `command`, `dialog`, `dropdown-menu`, `empty`, `field`, `form`, `pagination`, `popover`,
> `progress`, `radio-group`, `scroll-area`, `select`, `separator`, `sheet`, `sonner`, `table`, `tabs`,
> `textarea`. These are available for future pages but nothing currently imports them.
>
> The CLI-generated components reference `primary-foreground`/`accent-foreground` tokens that didn't
> exist yet (the initial migration only added `-foreground` pairs for `card`/`popover`/`secondary`/
> `muted`/`destructive`) — this was a real bug (invisible/low-contrast text on default buttons,
> checked checkboxes, selected dropdown/select items, badges) caught by grepping the new component
> set, not by running the CLI's own tests (it has none). Fixed by adding `--primary-foreground: #fff`
> and `--accent-foreground: #1e293b` to `globals.css` and restructuring `primary`/`accent` in
> `tailwind.config.js` from flat color strings to `{ DEFAULT, foreground }` objects — Tailwind resolves
> `bg-primary`/`text-primary`/`primary/20` to `.DEFAULT` automatically, so this is backward-compatible
> with the ~171 existing `primary`/`accent` usages across 56 files; no call-site changes needed.
>
> `tailwind.config.js` / `globals.css` gained the standard shadcn semantic color tokens (`secondary`,
> `muted`, `destructive`, `border`, `input`, `ring`, `card`, `popover`, `primary`, `accent`, each with a
> `-foreground` pair) as CSS variables, added **additively** — `background` is unchanged (flat hex).
>
> Components not yet migrated to a shadcn equivalent (e.g. inline dialogs in `(admin)/menu-admin/page.tsx`,
> the `skeletons.tsx` loading placeholders) remain hand-rolled Tailwind — this is a targeted migration
> of the `components/ui/` primitive set plus CLI-scaffolded extras, not a full design-system rewrite,
> and not everything under `components/ui/` is actually wired into a page yet.

> **Typography + motion foundation (2026-07-11, Phase 1 of the platform UI modernization):**
> before this, the app had no custom font at all (`body { font-family: Arial, Helvetica, sans-serif }`
> in `globals.css`) and almost no animation anywhere (13 files total used any `transition-`/`animate-`
> class). Added `next/font/google` in `src/app/layout.tsx` — **Manrope** for headings (wired via a
> global `h1`–`h6` rule in `globals.css`, plus Tailwind's `font-heading` utility for manual use) and
> **Inter** for body text (Tailwind's default `font-sans`, applied on `<body>`). Installed
> `tailwindcss-animate` (registered in `tailwind.config.js`'s `plugins`) — this is the standard shadcn
> companion plugin and, critically, is what actually drives the `animate-in`/`fade-in-0`/
> `slide-in-from-*` classes already present in `components/ui/{dialog,sheet,alert-dialog,dropdown-menu,
> popover}.tsx`; those classes existed in the markup since the 2026-07-08 shadcn adoption but had zero
> effect until this plugin was installed — every Radix-based popup was opening/closing with no
> transition at all until now. Also added two custom keyframes/utilities for reuse across future
> pages: `animate-fade-up` (opacity+translateY entrance, 0.5s) and `animate-scale-in` (opacity+scale
> entrance, 0.2s) — both should be composed with the `motion-safe:` variant (e.g.
> `motion-safe:animate-fade-up`) so `prefers-reduced-motion: reduce` disables them automatically,
> per the convention established in Phase 2 below.

> **Phase 2 — public + auth pages (2026-07-11):** applied the Phase 1 foundation to the first concrete
> page-level pass: `app/page.tsx` (landing), `app/discover/page.tsx`, `app/register-organization/page.tsx`,
> and `[tenant_slug]/(auth)/{login,register,forgot-password}/page.tsx`, plus the shared
> `components/auth/{TenantCard,OrgCategorySelector}.tsx`. Pattern used throughout: hero copy and
> primary CTAs get `motion-safe:animate-fade-up` with small staggered `animationDelay` values (80–320ms)
> for a cascading entrance; card grids (`/discover` results, `OrgCategorySelector` options) stagger
> per-item via `animationDelay: i * 60ms` (capped at 8 items) rather than per-page-fixed delays; modal-
> like `Card` containers (login/register/forgot-password) get `motion-safe:animate-scale-in`; and each
> multi-step form's step content div is given `key={step}` + `motion-safe:animate-fade-up` so switching
> steps (e.g. credentials → OTP) retriggers a fresh entrance transition instead of an instant snap.
> Primary CTA buttons across these pages gained `transition-transform hover:-translate-y-0.5` for a
> consistent hover-lift micro-interaction. Legacy non-`[tenant_slug]` duplicate auth pages
> (`app/(auth)/login`, `app/(auth)/register`) were intentionally left untouched at the time — see
> `ADR-009` and this file's routing-tree notes on the duplicate-route-tree debt. Phases 3+ (customer
> ordering flow, admin dashboard, staff/food-court, platform admin) are backlogged, not yet started.
>
> **Update (2026-07-12, see `ADR-011`):** those two pages turned out to be more than stale — neither
> form ever sent `tenant_slug`, which `POST /auth/login` / `POST /auth/register` have required since
> multi-tenancy landed, so every submission 422'd and they could never succeed. Both now
> server-redirect to `/discover` instead of rendering a dead form. See the Routing Tree below and
> `ADR-011` for full detail.
>
> **Update (2026-07-16, QA browser pass):** none of the email/password `<Input>`s across
> `register-organization`, `[tenant_slug]/(auth)/{login,register,forgot-password}`, and
> `(student)/profile`'s `ChangePasswordModal` set `autoComplete`. Chromium's own autofill was
> observed carrying a password typed into one form (e.g. registering a new organisation) forward
> into the next unrelated form opened in the same browser session (e.g. a customer registration on a
> different tenant), auto-populating fields the user never touched — flagged in-browser by a real
> console warning (`Input elements should have autocomplete attributes`). Added the correct semantic
> value to every such field: `username` for login-identifying emails, `current-password` for a
> password being verified, `new-password` for one being set/changed, `off` for a non-credential email
> (an org's contact address).

> **UIX-1 — Navigation foundation & bug fixes (2026-07-12, stage 1 of the platform-wide UI/UX
> modernization program — see `ADR-010`):** a full navigation survey across every section (customer,
> admin, staff, food-court, platform) found three real bugs, not just polish gaps, all fixed in this
> stage: (1) the food-court sidebar linked to nonexistent paths (`dashboard`/`tables`/`analytics`
> instead of the real `fc-dashboard`/`shared-tables`/`fc-analytics`) — see the routing-tree entry
> above; (2) `(platform)/admin/` had no layout/nav at all, and two of its four pages had no role
> guard of their own; (3) the customer top nav and mobile bottom tab bar used two different,
> partially-overlapping route sets. Full detail in `ADR-010`; routing-tree entries above are updated
> in place. Also built `components/layout/PageHeader.tsx` — a shared title/description/action/
> breadcrumb header, adopted (with breadcrumbs, via the existing but previously-unused
> `components/ui/breadcrumb.tsx`) on every page that has real hierarchy depth: the three inventory
> sub-pages, `users/invite`, and all four platform pages. Stages UIX-2 (dark mode) through UIX-6
> (staff/food-court/platform polish) are planned but not started — each will get its own spec update
> before implementation, per this project's spec-first convention.

> **Mobile viewport audit (2026-07-12, see `ADR-012`):** a dedicated phone-width (≤400px) regression
> pass — not covered by UIX-1…6's own scope — across every role's layout and the data-heavy admin
> pages found four real bugs, fixed: (1) `menu-management`'s category panel (`CategoryManager` —
> create/rename/delete) was `hidden ... lg:block` with no mobile equivalent beyond a plain category
> picker; now reachable via a `Sheet` triggered next to the mobile `<Select>`, and `CategoryManager`'s
> hover-only edit/delete icons are now always visible below `sm` (touch range) so they're tappable
> inside that Sheet; (2) the inventory page's `PageHeader` action row (3 buttons) and its "All Items"
> title/search row both overflowed at 375px, now wrap/stack responsively; (3) the cleaner layout's top
> bar had no truncation/label-hiding, unlike the sibling staff layout's already-shipped UIX-1 pattern
> — ported the same treatment; (4) the tenant-admin, food-court, and platform-admin layouts' mobile
> header wrapper used `lg:hidden` while the underlying `Sidebar` primitive switches mobile/desktop at
> `md` — caused a redundant double-header in the 768–1023px band, fixed by aligning both to `md`.
> Full detail in `ADR-012`.

---

## Routing Tree

```
src/app/
  page.tsx                           → Redirects to /{defaultSlug}/login
                                        ✅ [Phase 22] Becomes segment landing (Cafeteria /
                                        Restaurant cards → tenant directory filtered by segment) — RFC-007
  discover/page.tsx                  → ✅ [RFC-007] Public tenant directory (search by name/city).
                                        Surfaces a "Register your {cafeteria|restaurant}" CTA
                                        (added 2026-07-11) linking to `/register-organization?segment=…`.
                                        ✅ Reworked 2026-07-16: standard server-side pagination —
                                        `?segment=` is now a real backend filter param (was
                                        client-side getSegment() per the RFC-007 MVP shortcut) and
                                        the page passes `skip`/`limit` (page size 12) to
                                        `GET /tenants/public`, rendering the shared shadcn
                                        `pagination.tsx` controls ("Showing X–Y of Z" +
                                        Previous/Next, same pattern as `(platform)/admin/audit-log`).
                                        Page resets to 1 whenever `q` or `segment` changes; the
                                        response `total` (post-filter, pre-slice — see
                                        `modules/tenants.md`) drives the page count.
  register-organization/page.tsx     → ✅ [RFC-006] Public org onboarding wizard
                                        (choose category → org details → admin account → auto-login).
                                        Added 2026-07-11: optional `?segment=cafeteria|restaurant` query
                                        param pre-filters the category step's `OrgCategorySelector` to
                                        just that segment's self-serve types (corporate+academic, or
                                        independent_restaurant+franchise_brand+food_court) — see
                                        `OrgCategorySelector`'s `segmentFilter` prop. No param = all 5
                                        self-serve types shown, unchanged from before.

  > **✅ `useSearchParams()` + static routes need `<Suspense>` (fixed 2026-07-16, first real
  > `next build` of the prod image):** `/discover` and `/register-organization` are statically
  > prerendered at build time and both call `useSearchParams()` at the top of the page component —
  > Next.js 14 fails the build for this ("should be wrapped in a suspense boundary"). `next dev`
  > never runs static generation, so it went unnoticed until the production Docker image was first
  > built. Both pages now export a thin `<Suspense>` wrapper around an inner `…Content` component
  > holding the previous body. **Rule: any statically-rendered page (no dynamic segment in its
  > path) that reads `useSearchParams()` must use this wrapper pattern.** The other two callers
  > (`m/[public_slug]`, `[tenant_slug]/(auth)/register`) live under dynamic params and render
  > per-request, so they're unaffected.

  m/[public_slug]/                   → ✅ [Phase 22 — Implemented 2026-07-05] Public surface, no auth — RFC-007
    page.tsx                         → Public menu + cart + guest checkout (name+phone);
                                        `?mode=kiosk` = fullscreen locked kiosk variant
    track/[guestToken]/page.tsx      → Guest order tracking (live via public WS)

  > **✅ Dark mode fixed 2026-07-16 (QA browser pass):** both `m/[public_slug]` pages hardcoded
  > light-only Tailwind colors (`bg-slate-50` page background, `bg-white` sticky bars,
  > `text-slate-900` headings, `border-slate-200`, etc.) while simultaneously using the theme-aware
  > shadcn `Card` for item/ticket cards. With the site-wide dark toggle on, the cards flipped to
  > `bg-card` (dark) but the item-name headings inside stayed `text-slate-900` — unreadable
  > dark-on-dark — and the page body stayed light behind dark cards. Confirmed page-specific
  > (`/discover` and every token-based page render dark mode correctly). Fixed by replacing every
  > hardcoded slate/white class with the theme tokens the rest of the app uses: `bg-slate-50` →
  > `bg-muted/30` (page) / `bg-muted` (inset boxes), `bg-white` → `bg-background`/`bg-card`,
  > `text-slate-900`/`-800` → `text-foreground`, `text-slate-4/5/600` → `text-muted-foreground`,
  > `border-slate-100/200` → `border-border`. **Rule for these two files:** no raw palette color
  > classes — theme tokens only, same as every `[tenant_slug]` page. (The tenant `brand_color`
  > header is inline-styled from API data and is theme-neutral by design — unchanged.)

  (auth)/                            → Legacy, non-tenant-scoped duplicate route tree (ADR-009).
                                        ✅ [ADR-011, 2026-07-12] Both pages now `redirect('/discover')`
                                        server-side rather than rendering a form — neither ever sent
                                        `tenant_slug`, which the backend has required since
                                        multi-tenancy landed, so both 422'd on every submission.
                                        Reachable via `ProtectedRoute`'s unknown-tenant fallback.
    login/page.tsx                   → Redirects to /discover
    register/page.tsx                → Redirects to /discover

  [tenant_slug]/                     → Tenant-scoped routes
    layout.tsx                       → Loads tenant context from JWT
                                        ✅ [Phase 22] Also derives segment (`system/segments.md`)
                                        and hides/404s (customer) + register for restaurant tenants
    display/page.tsx                → ✅ [Phase 22] Signage: read-only auto-rotating menu board — RFC-007

    (auth)/
      login/page.tsx                 → Login form + admin OTP step
      register/page.tsx              → 2-step: form → OTP verify
      forgot-password/page.tsx       → ✅ [Implemented] OTP-based password reset (WF-9) — request
                                        OTP by email, then submit OTP + new password
    
    (customer)/                      → Roles: customer, student
      menu/page.tsx                  → Browse categories + items
      order/page.tsx                 → Cart review + checkout
      track/[orderId]/page.tsx       → Order status + QR + receipt
      wallet/page.tsx                → Balance + topup
      profile/page.tsx               → User profile
    
    (staff)/                         → Role: staff (also `server` at food-court tenants)
                                        ✅ [Corrected 2026-07-12] top bar, not a sidebar — 4 tabs,
                                        real active states + horizontal-scroll overflow (UIX-1)
      kitchen-queue/page.tsx          → Live order queue (WS-driven)
      dashboard/page.tsx              → Staff summary
      menu-availability/page.tsx      → Toggle item availability
      pos/page.tsx                    → Staff-entered POS order (pay-at-counter)

    (food-court)/                    → Role: food_court_admin (+ server/customer on shared items)
                                        ✅ [Corrected 2026-07-12] previously missing from this tree
                                        entirely — see ADR-010 (UIX-1)
      layout.tsx                     → Sidebar nav; guards on tenantType==='food_court'; fixed
                                        2026-07-12 — 3 of 5 links pointed at nonexistent paths
      fc-dashboard/page.tsx           → Food-court admin summary
      unified-menu/page.tsx           → Cross-vendor menu (food_court_admin/server/customer)
      deliver/page.tsx                → Delivery queue (food_court_admin/server)
      shared-tables/page.tsx          → Shared floor tables (food_court_admin/server)
      fc-analytics/page.tsx           → Food-court-wide analytics (food_court_admin)

    (cleaner)/                       → Role: cleaner
      cleaning-queue/page.tsx        → Cleaning assignments ✅ [Corrected 2026-07-12] was
                                        misdocumented as `tables/page.tsx`
    
    (admin)/                         → Admin roles
      dashboard/page.tsx             → Summary cards + charts
      users/page.tsx                 → ✅ Manage users: search/filter/paginate,
                                        activate/deactivate (fixed 2026-07-02 — see modules/users.md);
                                        header links to users/invite/
      users/invite/page.tsx          → ✅ Invite Staff: send by email+role, sent-invitations
                                        table now loads from GET /users/invite (persists across
                                        refresh — fixed 2026-07-02); ✅ [2026-07-12] the old plain
                                        "← Back to Users" link became a `PageHeader` + breadcrumb
                                        (Users › Invite)
      inventory/
        page.tsx                     → Item list
        items/page.tsx               → Re-exports `inventory/page.tsx` (same item-list page, no
                                        separate implementation)
        movements/page.tsx           → Movement log. ✅ [2026-07-12] `PageHeader` + breadcrumb
                                        (Inventory › Movements)
        purchase-orders/page.tsx     → PO management. ✅ [2026-07-12] `PageHeader` + breadcrumb
                                        (Inventory › Purchase Orders)
        central/page.tsx             → Central stock (franchise). ✅ [2026-07-12] `PageHeader` +
                                        breadcrumb (Inventory › Central Inventory)
      public-link/page.tsx           → ✅ [Phase 22 — Implemented 2026-07-05] Toggle public menu,
                                        edit public_slug, download table-QR PDF sheet — RFC-007
      outlets/page.tsx                → ✅ [Phase 23 — Implemented 2026-07-05] Franchise brand
                                        self-service: list + create franchise_outlet tenants.
                                        Nav item only rendered when tenant_type===franchise_brand
                                        (RFC-008)
      memo/page.tsx                   → Generate institutional memo PDFs (ref no., to/from,
                                        subject, multi-paragraph body, signatory) via `/memo`
      → ✅ [Phase 24 — RFC-009] "Platform" nav section (Tenants/Subscriptions/Analytics/Audit Log)
        rendered only when role===platform_admin — first ROLE-gated nav items in this layout
        (existing gates are all tenant_type-gated); see NavItem.allowedRoles
  
  (platform)/
    admin/
      layout.tsx                     → ✅ [2026-07-12, UIX-1] NEW — previously this section had no
                                        layout at all (see ADR-010). Sidebar with all four pages below
                                        + "Back to tenant admin" link, wraps `children` in
                                        `ProtectedRoute allowedRoles={['platform_admin']}` — this also
                                        closes the guard gap that `subscriptions`/`analytics` had
                                        (they now also carry their own `ProtectedRoute`, redundant
                                        with the layout's by design — see ADR-010 consequences)
      tenants/page.tsx               → Platform admin tenant CRUD — ✅ [Phase 24 — RFC-009] adds
                                        per-row Impersonate / Export / Delete actions
      subscriptions/page.tsx         → Tier changes per tenant. ✅ [2026-07-12] gained its own
                                        `ProtectedRoute` guard + `PageHeader` (previously unguarded
                                        except via the layout — see ADR-010). ✅ Fixed 2026-07-16
                                        (QA browser pass): `GET /tenants` returns
                                        `{items, total}` (`TenantListResponse`), but this page did
                                        `setTenants(res.data)` directly — crashed the whole page with
                                        `TypeError: tenants.map is not a function` on every load.
                                        `tenants/page.tsx`'s `loadTenants()` already had the correct
                                        defensive unwrap (`res.data.items ?? res.data`) for the same
                                        endpoint; subscriptions now uses the same pattern.
      analytics/page.tsx             → ✅ [Phase 24 — RFC-009] now also calls
                                        GET /platform/analytics/overview for the genuine
                                        cross-tenant-type view. ✅ [2026-07-12] same guard fix as
                                        subscriptions above
      audit-log/page.tsx             → ✅ [Phase 24 — RFC-009] NEW — paginated platform_audit_logs
                                        table, filterable by tenant/action, platform_admin-only
  
  unauthorized/page.tsx              → 403 fallback
```

**Components:** `components/platform/ImpersonationBanner.tsx` — ✅ [Phase 24 — RFC-009] NEW,
mounted at the root layout; reads the `impersonation` JWT claim and shows a persistent "Viewing as
{tenant} — Exit impersonation" banner. Impersonation flow: the Tenants page stashes the platform
admin's real token in `sessionStorage` before swapping the store token and navigating to
`/${targetSlug}/dashboard`; Exit restores the stashed token/context and returns to `/admin/tenants`.

> **✅ Fixed 2026-07-16 (QA browser pass):** Exit previously called `setToken(backup)` (a Zustand
> update) and then `router.replace('/admin/tenants')` (a Next.js soft navigation) while the browser
> was still sitting on the impersonated tenant's `/{slug}/(admin)/...` page. `[tenant_slug]/(admin)/
> layout.tsx` is still mounted at that instant and its own guard `useEffect` — which reacts to
> `token` — re-runs with the *old* pathname (`/{slug}/...`) but the *new*, already-swapped-back
> token (`tenant_slug: scms-platform` or whichever tenant the admin actually belongs to). That's a
> tenant-slug mismatch by the layout's own rule, so its `/unauthorized` redirect fires and reliably
> wins the race against the banner's own `/admin/tenants` navigation — every "Exit impersonation"
> click ended on `/unauthorized` instead. Fixed by using a hard navigation
> (`window.location.href = '/admin/tenants'`) for the exit instead of `router.replace` — a full
> document load tears down the impersonated page (and its guard) before the restored-token page ever
> mounts, so there's no component left to race.

`components/ui/tooltip.tsx`'s `TooltipProvider` is also mounted at the root layout (wrapping
`ImpersonationBanner`, `children`, and `ToastProvider`) — ✅ [2026-07-08, shadcn/ui adoption] required
by Radix's Tooltip primitive; any `Tooltip`/`TooltipTrigger`/`TooltipContent` usage anywhere in the
app relies on this single provider instance.

Default slug (redirected to on root): `bracu`

---

## Zustand Store (`src/store/useStore.ts`)

```typescript
interface Store {
  // Auth
  token: string | null;
  user: User | null;
  tenantSlug: string | null;
  tenantId: string | null;
  tenantType: TenantType | null;
  outletId: string | null;
  brandColor: string | null;
  
  // Cart
  cart: CartItem[];
  isCartOpen: boolean;
  
  // Wallet
  walletBalance: number;
  rewardPoints: number;
  
  // Notifications
  notifications: WsMessage[];
  
  // Hydration
  hasHydrated: boolean;
  
  // Actions
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setTenantContext: (ctx: TenantContext) => void;
  setTenantSlug: (slug: string) => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, qty: number) => void;
  clearCart: () => void;
  addNotification: (msg: WsMessage) => void;
  setWalletBalance: (balance: number) => void;
  setRewardPoints: (points: number) => void;
  setHasHydrated: (value: boolean) => void;
}
```

**Persistence:** Uses `zustand/middleware persist` with `localStorage` key `scms-store`.  
**Excluded from persistence:** `cart`, `notifications` (ephemeral session data).

### Auth-guard pattern: always gate on `hasHydrated` (see ADR-006)

`persist` reads `localStorage` asynchronously — on a fresh page load (hard refresh, direct URL nav,
new tab) there is a brief window where `token` reads as `null`/`undefined` even for an already
logged-in user, before rehydration completes and flips `hasHydrated` to `true`. Any auth guard that
checks `token` without first checking `hasHydrated` will spuriously redirect a legitimately
authenticated user to `/login` during that window.

**Every route guard MUST follow this shape** (canonical implementation:
`src/components/ProtectedRoute.tsx`):
```typescript
useEffect(() => {
  if (!hasHydrated) return        // don't act until the store has actually read localStorage
  if (!token) router.replace(loginPath)
  // ...role checks etc.
}, [hasHydrated, token, /* ... */])

if (!hasHydrated) return null     // don't render (or flash) protected content/redirects either
```
All five tenant-scoped route-group layouts —
`[tenant_slug]/(admin|cleaner|staff|customer|food-court)/layout.tsx` — implement this pattern as of
2026-07-11 (previously they checked `token` alone and were subject to the race; see ADR-006).

**Expired-token redirect loop (fixed 2026-07-11):** a second guard rule, discovered live — the JWT
lives in `localStorage` for 60 minutes, and two pages disagreed about what a *stale* token means:
the login page's auto-redirect checked only `token && role` (an expired JWT still decodes fine
client-side) and bounced the visitor to `/menu`, while `(customer)/layout.tsx`'s `/auth/me` sync got
a `401` and bounced back to `/login` **without clearing the dead token** — an infinite
`/login ↔ /menu` loop on every tenant card once the session aged past 60 minutes. Two rules now
apply, both mandatory for any future auth-redirect logic:
1. **Never auto-redirect on a token without checking `isTokenExpired()`** (`src/lib/auth.ts`) — the
   login page now clears an expired token via `clearAuth()` and stays put. It also stays on the
   form when the token belongs to a *different* tenant (`claims.tenant_slug !== slug`) instead of
   pushing a foreign session into this tenant's app.
2. **Any `401`-triggered redirect to login MUST `clearAuth()` first** — otherwise the login page
   still sees a token and the loop re-arms. `(customer)/layout.tsx`'s `syncUser` catch now does this.

**Admin layout never redirected on role/tenant mismatch (fixed 2026-07-16):** the login-page guard
above (rule 1) only ever covers the moment of arriving at `/login` — it says nothing about a session
that's already inside the app and navigates (via direct URL, not a rendered link) to a page it
doesn't belong on. Found via QA browser testing: `[tenant_slug]/(admin)/layout.tsx` checked only
`if (!token) router.replace(login)` — a `staff` role hitting `/bracu/users` by URL, or a valid
`bracu`-tenant session hitting `/unimart-hall/dashboard`, rendered the **full admin page shell**
(sidebar, header, page content) indefinitely, only failing at the individual data-fetch calls (403s
surfaced as toasts, dashboard widgets showing stale data from whatever tenant was last loaded — never
real cross-tenant data, since the API itself enforces `ctx.tenant_id` correctly, but still a broken
and misleading UI state). The layout now runs a second guard alongside the token check:
1. `claims.tenant_slug !== slug` (JWT's own tenant claim vs. the URL) → `router.replace('/unauthorized')`
   immediately — this is the layout-level counterpart to the login-page rule above.
2. The current pathname resolved against `NAV_DEFS` — if it matches an item the current
   `role`/`tenantType` doesn't pass (see `allowedRoles`/`allowedTypes` below), same redirect.
Both checks are cheap (JWT claims + a local array lookup, no network round-trip) and run in a
`useEffect` after `hasHydrated`, so they can't race the store-hydration issue from rule 1 above.

**Admin sidebar showed every admin page to `staff`/`cleaner` (fixed 2026-07-16, same QA pass):**
`NAV_DEFS` in the same file only gated `Inventory`/`Central Inventory`/`Outlets` by
`allowedRoles`/`allowedTypes` — every other item (Dashboard, Menu, Users, Public Link, Devices,
Kiosk Settings, Signage, Analytics, Reports, Memo, Settings) had no role gate at all, so a `staff`
account confirmed to have full kitchen-queue access via `/orders` also saw — and could navigate
into — the entire tenant-configuration surface, 403ing only once the page tried to fetch data. Added
`allowedRoles` to every genuinely admin-only item, mirroring backend `ADMIN_ROLES`
(`app/core/dependencies.py`: `outlet_admin`, `tenant_admin`, `food_court_admin`, `super_admin`,
`platform_admin`). `Orders` and `Tables` stay ungated — `GET /orders` explicitly allows
`WORK_ROLES` (staff + admins, `routers/orders.py`) and `GET /tables/` has no role restriction at all,
so both are legitimately staff-visible.

**`server` role could never open the page its own login redirect sends it to (fixed 2026-07-16,
same QA pass):** `getRedirectPath()` on the login page treats `staff` and `server` identically —
both land on `/{slug}/orders` (`STAFF_ROLES = ['staff', 'server']`). But that page is
`[tenant_slug]/(admin)/orders/page.tsx`, a re-export stub for the legacy
`(staff)/orders/page.tsx`, which wraps itself in `<ProtectedRoute allowedRoles={["staff", "admin"]}>`
— `"server"` was missing from that literal array. The outer `[tenant_slug]/(admin)/layout.tsx` guard
(above) correctly allows `server` through, since `Orders` is intentionally ungated there, but this
*inner*, independent `ProtectedRoute` guard still fires a moment later once its own `useEffect`
runs, bouncing to `/unauthorized` — after the page's data calls had already succeeded, so a `server`
account would see a flash of the real kitchen queue before losing it. Confirmed live with
`server1@unimart.hall`: `POST /auth/login` → 200, `GET /orders/` → 200 with real order data, then
redirected anyway. Fixed by adding `"server"` to the `allowedRoles` array. This wasn't food-court-specific
— the same dead end hits `server`-role staff on any tenant, since this is the one shared orders page.

**`useStore.user` was never populated for cleaner/staff/admin roles, only customer (fixed
2026-07-16, same QA pass):** `[tenant_slug]/(customer)/layout.tsx` fetches `/auth/me` and calls
`setUser()` in a `useEffect` keyed on `token` — this is what keeps the store's `user` object in sync
with whoever is actually logged in. No equivalent effect existed in
`[tenant_slug]/(cleaner)/layout.tsx`, `[tenant_slug]/(staff)/layout.tsx`, or
`[tenant_slug]/(admin)/layout.tsx`. Since the login page's `hydrateAndRedirect()` sets the token but
never calls `setUser()` either, `user` simply kept whatever value `zustand/persist` had last written
to `localStorage` — from a **previous** login, possibly a different account entirely, on any browser
profile that had ever logged into a non-customer role before. Confirmed live across three
consecutive different logins (cleaner → food-court admin → vendor admin → server) in the same
browser profile: all four showed the identical stale `user.user_id`, from a login several sessions
earlier. Concretely this broke `useWebSocket(user?.user_id || '', ...)` — every cleaner/staff/admin
WebSocket connection sent the wrong `user_id` in the URL, which the backend correctly rejects
(`routers/websocket.py`: `str(token_data.user_id) != user_id` → close before accept → uvicorn logs it
as a `403`), so **no non-customer role ever received live order/table/cleaning WebSocket events** —
staff/admin pages that claim to be "updated through websocket events" silently were not, and would
only reflect reality after a manual refresh. Anything else reading `user.*` (name, email) on these
pages would also have silently shown a previous account's data. Fixed by adding the same
`/auth/me` → `setUser()` sync effect (mirroring `(customer)/layout.tsx`'s) to all three layouts.

### Global header/footer: `SiteHeader` / `SiteFooter` (added 2026-07-11)

Before this change, `src/app/layout.tsx` had **no shared chrome at all** — no header, no footer,
anywhere in the app. Each section (`Navbar` for customers, the admin sidebar, auth pages) built its
own header independently and inconsistently, and the customer `Navbar` had a real bug: it hardcoded
the literal text `"BRACU Cafe"` regardless of which tenant was actually logged in (same bug existed
in `(student)/menu/page.tsx`'s heading).

Added two components, mounted once in the root layout (`src/app/layout.tsx`) so every route — public
pages, auth pages, every tenant-scoped section — gets them automatically:

- **`components/layout/SiteHeader.tsx`** — a sticky, blurred `h-14` bar (redesigned 2026-07-11 from
  an initial `h-9` flat strip) showing the **SCMS** platform wordmark in a rounded icon badge
  (linking to `/`). When the current route has a `[tenant_slug]` param, it also fetches that
  tenant's public info via the existing `useTenantInfo(slug)` hook (`GET /tenants/public/{slug}`,
  unauthenticated) and shows the org's real name + logo/color-avatar as a pill on the right, with a
  fade-in transition once that data resolves. A 3px bottom accent strip renders in the tenant's own
  `brand_color` (falling back to the platform's `#1A4D2E`) — the one element tying platform and
  org branding together visually. Shows platform-only styling (accent line in platform green, no
  pill) on non-tenant-scoped routes (`/`, `/discover`, `/register-organization`, `/m/[public_slug]`)
  since there's no tenant to attach to. **Surface color** (fixed same day, 2026-07-11): uses
  `bg-[hsl(var(--header-surface)/0.92)]`, a dark, desaturated shade of the brand green
  (`globals.css`'s `--header-surface: 145 45% 8%` — same hue/saturation as `--color-primary`,
  just much darker) — not Tailwind's `bg-slate-950`, which is blue-gray and clashed visibly against
  the green hero panels on login/register/discover.
- **`components/layout/SiteFooter.tsx`** — mirrors `SiteHeader`'s visual language (redesigned
  2026-07-11, same day as the header): the same `--header-surface` dark-green token as the header
  (opaque, no blur since the footer isn't sticky), the same SCMS icon-badge + wordmark on the left
  (linking to `/`), the same tenant name/logo pill (via `useTenantInfo`, same fade-in) on the right when
  tenant-scoped, and a 3px accent strip in the tenant's `brand_color` (platform green fallback) —
  but running along the **top** edge of the footer instead of the bottom, so the accent color
  bookends the page at both the header's bottom and the footer's top.

These sit **above** each section's existing functional nav (customer cart/wallet bar, admin sidebar,
staff/cleaner bars) rather than replacing them — this is global platform-identity chrome, not
in-app navigation, and the existing section-level navs still own their own navigation concerns.

**Real logo, favicon, and discover hero art (added 2026-07-21):** the icon badge was a placeholder
🍽 emoji, hand-duplicated independently in `SiteHeader`, `SiteFooter`, `Navbar`, and the admin
sidebar header — no shared component existed. Replaced with `components/layout/Logo.tsx`, an inline
SVG rendering the platform's chosen brand mark (a 2×2 tenant-tile grid with one tile picked out in
coral + a location pin — Concept B from the brand exploration, `desktop:SCMS-Brand-Assets/`),
parameterized by a `theme: 'light' | 'dark'` prop so the same component works on both the
`SiteHeader`/`SiteFooter` dark surface and `Navbar`/admin-sidebar's light theme-aware surface. Also
added: a real `public/brand/favicon.svg` (the previous `<link rel="icon" href="/favicon.ico">` in
`app/layout.tsx` pointed at a file that never existed in the repo — silently broken since the app's
inception) and `public/brand/hero-illustration.svg`, layered behind `/discover`'s green banner via an
absolutely-positioned `<img>` with the heading/search/CTA promoted to `relative z-10` above it.

**`SiteHeader`/`SiteFooter` brand link fixed from `/discover` to `/` (2026-07-21):** the Routing
Tree below shows `/` (`app/page.tsx`) became the real segment-landing home page as of Phase 22/
RFC-007 (Cafeteria/Restaurant picker) — `/discover` is one step further in, the tenant *directory*
you reach after picking a segment (or via the header's own link, previously circular when already
on `/discover`). The global brand mark now correctly returns to the true home page from anywhere in
the app, including from `/discover` itself. `Navbar.tsx`'s brand link (`/${slug}/menu`, a tenant's
own in-app home) is unaffected — that's section-level navigation, not the platform-identity link
this change concerns.

**Accent-word headings + marquee strip on `/` and `/discover` (added 2026-07-21):** motion/typography
ideas evaluated from an external reference site (arche-lab.org) and scoped deliberately narrow —
only the two public, pre-login marketing-style pages get this treatment, not the functional app.
Two additions, both CSS-only (no new JS dependency):

- **Accent word in the hero heading**: one word gets `italic text-[#E8734A]` (the platform's existing
  coral accent, matching `Logo.tsx`/brand assets — not the reference site's teal, to stay on SCMS's
  own established palette rather than visually borrowing someone else's). On `app/page.tsx` this is
  the static word "Cafe" in "Smart *Cafe* Management"; on `discover/page.tsx` it's the dynamic segment
  noun itself ("cafeteria"/"restaurant"/"organisation" — whichever the existing conditional heading
  logic renders).
- **`components/layout/MarqueeStrip.tsx`**: an infinite horizontal CSS marquee (new `marquee` keyframe
  + `animate-marquee` utility in `tailwind.config.js`, same pattern as the existing `fade-up`/`scale-in`
  entries) listing short platform-feature tags separated by a middot, content duplicated once so the
  loop is seamless. Rendered below the hero CTA row on both `/` and `/discover`. Gated with Tailwind's
  `motion-safe:` variant (falls back to a static, non-scrolling row for `prefers-reduced-motion`
  users) — the reference site's own marquee did not appear to do this, so this is a deliberate
  accessibility improvement over the source of the idea, not a straight port.

**Explicitly out of scope, and why:** the reference site also has a continuously animated canvas/SVG
line pattern behind its entire hero. Not adopted anywhere, including here — SCMS just shipped
kiosk/signage support (Phase 25) meant to render for hours on tablet-class hardware, where a
persistent full-viewport background animation is a real battery/GPU cost, and it would compete for
attention against task-focused ordering UI in a way a marketing site never has to worry about. No
Framer Motion/GSAP/Lottie was introduced either — the reference site itself doesn't use any of those
(verified via network-request inspection, not assumed), so there was never a case for adding a new
animation dependency here.

**Footer on fixed-sidebar pages (✅ fixed 2026-07-16 — sidebar must never cover the footer):**
the shadcn `Sidebar` is `fixed bottom-0 top-[--site-header-height]` (full viewport height below the
sticky header), so on the three dashboard layouts that use it — `[tenant_slug]/(admin)/layout.tsx`,
`[tenant_slug]/(food-court)/layout.tsx`, `(platform)/admin/layout.tsx` — the root layout's
full-width `SiteFooter` used to slide *under* the sidebar at page bottom, its left portion covered.
The standard dashboard resolution is that **the footer lives inside the content column**, to the
right of the sidebar, never spanning under it:

1. `useStore` gains a **non-persisted** `globalFooterSuppressed` flag + setter (not listed in
   `partialize`, so it never touches localStorage).
2. Each of the three sidebar layouts sets it `true` on mount / `false` on unmount, and renders
   `<SiteFooter inset />` inside `SidebarInset`, after `<main>`.
3. `SiteFooter` takes an `inset?: boolean` prop: the root layout's instance (no prop) returns
   `null` while the flag is set; an `inset` instance always renders. Same component both places —
   no duplicated markup.

Route-group note: this **cannot** be done by pathname matching — route groups don't appear in URLs
(`/{slug}/orders` (admin) and `/{slug}/menu` (customer) are structurally identical), so the flag is
the mechanism, set by the layouts that actually own a sidebar. **Scope note:** modal overlays
(cart drawer `CartSidebar`, `Sheet` slide-overs) intentionally keep covering the whole page
including the footer while open — that's standard modal behavior, explicitly out of scope for this
rule.

**Bug fixes bundled with this change:** `Navbar.tsx` and `(student)/menu/page.tsx` no longer
hardcode `"BRACU Cafe"` — both now pull the real tenant name via `useTenantInfo`, falling back to
generic `"Cafe"` only if that fetch hasn't resolved yet. The `[tenant_slug]/(admin)/layout.tsx`
sidebar also now shows the tenant's real `name` (was previously showing the raw URL slug, e.g.
`green-fork-1782902792`, instead of `"Green Fork Bistro"`).

### Shared page header: `PageHeader` (added 2026-07-12, UIX-1 — see ADR-010)

`components/layout/PageHeader.tsx` replaces the ~30 hand-rolled `<h1 className="text-3xl font-black
...">` blocks scattered across admin/platform pages with one component: `title` (required),
`description`/`eyebrow`/`action` (all optional), and `breadcrumbs` (an array of `{ label, href? }`,
rendered via the existing-but-previously-unused `components/ui/breadcrumb.tsx` when present — the
last item without `href` renders as the current-page crumb). As of UIX-1 it's adopted, with
breadcrumbs, only on pages with real hierarchy depth: the inventory sub-pages (`movements`,
`purchase-orders`, `central` — breadcrumbing back to `inventory`), `users/invite` (back to `users`),
and all four `(platform)/admin/*` pages (under a "Platform" root crumb). Broader adoption across the
remaining admin/customer/staff pages happens per-section in UIX-4/5/6, not all at once.

### Dark mode (UIX-2 — implemented 2026-07-12, see ADR-010)

**Token completion.** `globals.css`'s `:root` block currently defines every shadcn semantic token
(`--foreground`, `--card`, `--muted`, `--border`, etc.) as light-mode-only hex/rgba values, with one
exception already dark-aware: the sidebar tokens (`--sidebar-background` etc., inside
`@layer base { :root {...} .dark {...} }`) — these are the reference pattern to extend. Two gaps
block dark mode today:
1. **`background` in `tailwind.config.js` is a flat hardcoded hex** (`'#F5F0E8'`), not
   `var(--background)` like every other token — so `bg-background` cannot respond to a `.dark` class
   at all. UIX-2 converts it to `var(--background)` and adds a matching `--background: #F5F0E8;` to
   `:root` (a no-op for light mode, additive only).
2. No `.dark` overrides exist yet for any of the app-level tokens (only the sidebar's do). UIX-2 adds
   them to the same `@layer base { .dark {...} }` rule the sidebar tokens already live in — a dark,
   desaturated tint of the brand hue (~150°), not a generic slate, matching the reasoning already
   used for `--header-surface`'s light-mode fix (see the `SiteHeader`/`SiteFooter` note above):
   `background`/`card`/`popover`/`muted`/`border` all shift to low-lightness, brand-hue-adjacent
   values; `--color-primary` itself gets a `.dark`-scoped override to a *lighter* green (the light-mode
   `#1A4D2E` is too dark to read against a dark background) — `--primary-foreground` stays white,
   readable against both; `--header-surface` gets a `.dark` variant a touch lighter than the new dark
   `--background` so the header/footer remain visually distinct from page content in both modes, not
   just light mode. `.dark { color-scheme: dark; }` is set so native form controls (date pickers,
   scrollbars) also switch.

**Provider + toggle.** `next-themes` is already an installed dependency (added during the earlier
shadcn/`command.tsx` adoption, unused until now) and `tailwind.config.js` already has
`darkMode: ['class']` configured. UIX-2 wraps the app in `next-themes`' `ThemeProvider`
(`attribute="class"`, `defaultTheme="system"`, `enableSystem`) once in the root layout
(`src/app/layout.tsx`), alongside the existing `TooltipProvider`/`ImpersonationBanner`. A sun/moon
toggle button is added to `SiteHeader` (fits its existing pill/badge visual language) so it's reachable
from every page, tenant-scoped or not.

**Scope boundary — what UIX-2 does NOT do.** This stage ships the *shell* correctly dark-aware
(global background, `SiteHeader`/`SiteFooter`, shadcn primitives that already use semantic tokens
throughout `components/ui/*`, and any page from the 2026-07-11 typography/motion pass or UIX-1 that
already used tokens) — it does **not** sweep the ~30+ pages that still use hardcoded
`text-slate-900`/`bg-white`/`bg-[linear-gradient(...)]` classes (the platform pages, most admin
pages, several customer pages). Those pages will render with light-mode-only colors even when dark
mode is toggled on, until their section's later stage (UIX-4 customer, UIX-5 admin, UIX-6 staff/
food-court/platform) does its per-section token sweep — this is intentional sequencing, not a bug,
and is called out explicitly in ADR-010 so it isn't mistaken for an incomplete dark-mode rollout.
Recharts theme-aware colors are UIX-5's job, not UIX-2's.

### Command palette (UIX-3 — implemented 2026-07-12, see ADR-010)

**Scope:** Ctrl+K/⌘K palette mounted in exactly three layouts — `[tenant_slug]/(admin)/layout.tsx`,
`[tenant_slug]/(food-court)/layout.tsx`, `(platform)/admin/layout.tsx` — matching the plan's explicit
"admin tiers only" scope. Customer, staff, and cleaner layouts do **not** get it; this is not an
oversight, it's the stated scope from ADR-010.

**New `components/layout/CommandPalette.tsx`**, built on the existing-but-previously-unused
`components/ui/command.tsx` (cmdk). Props: `items: { label, href, icon? }[]` (required),
`quickActions?: { label, href, icon? }[]`, `tenantSearch?: boolean`. It owns only the open/close
state and the global `keydown` listener (`(metaKey || ctrlKey) && key === 'k'`) — it does **not**
compute its own nav list or duplicate any layout's role-filtering logic. Each of the three layouts
passes its **already-computed** visible nav array (the same `visibleNav`/`visiblePlatformNav`
arrays `(admin)/layout.tsx` builds for its own sidebar, `(food-court)/layout.tsx`'s `visibleNav`, and
`(platform)/admin/layout.tsx`'s `NAV_DEFS`) mapped to `{ label, href, icon }` — this is the "reuse the
existing NAV_DEFS arrays as the source of truth, don't duplicate them" requirement from the plan,
satisfied by passing the same list the sidebar already renders, not a second list.

**Quick actions:** admin layout adds one — "Invite user" → `/${slug}/users/invite` — a real deep link
to an existing page, not a modal trigger. No quick action deep-links directly into opening an
in-page modal (e.g. "new menu item" opening `menu-admin`'s add-item dialog) since that would require
new query-param-driven modal-open plumbing in far-flung pages, out of scope for a navigation palette.

**Platform tenant search — corrected from the original plan.** ADR-010's UIX-3 bullet assumed
`GET /tenants?q=...` already existed for platform admins to search by. It does not: the admin-scoped
`GET /tenants` (`routers/tenants.py::list_tenants`, ~line 327) only accepts `skip`/`limit` — the `q`
search param exists solely on the *public*, unauthenticated `GET /tenants/public` endpoint (used by
`/discover`), which platform admins should not be routed through. Rather than add a new backend
endpoint/param for this (out of scope for a frontend nav polish stage), the palette does one client-
side fetch of `GET /tenants?limit=100` when first opened in the platform layout, and relies on cmdk's
own built-in fuzzy-filter-by-rendered-text — no server-side search call per keystroke.

**Selecting a tenant result does NOT deep-link into that tenant's admin panel.** Actually viewing
another tenant's admin data requires the existing Impersonate flow (`(platform)/admin/tenants/page.tsx`)
swapping the JWT in the store — a bare `router.push('/{slug}/dashboard')` would show the *platform
admin's own* tenant data under a different URL (admin pages fetch by JWT tenant context, not the URL
slug), which would be actively misleading. So a matched tenant result navigates to
`/admin/tenants` (the existing management page, where Impersonate already lives) rather than
pretending to jump directly into that tenant's dashboard.

**Discoverability:** each of the three sidebars gets a small "⌘K" hint chip in its `SidebarHeader`.

### Customer section polish (UIX-4 — implemented 2026-07-12, see ADR-010)

**Scope:** the five customer surfaces — all thin re-exports of `(student)/{menu,order,wallet,profile,
track}/page.tsx` and `track/[orderId]/page.tsx` (the `[tenant_slug]/(customer)/*` files are one-line
`export { default } from '@/app/(student)/.../page'`), so every edit happens once in `(student)/*`
and both trees pick it up. Unlike UIX-1's admin/platform work, **this stage's token sweep is in
scope now** (not deferred) — a grep across all six files found extensive hardcoded color debt:
`text-slate-{400..950}`/`bg-slate-{50,100}`/`bg-gray-50` (dozens of occurrences across all five
pages) and `#1A4D2E` (18× in `wallet/page.tsx` alone, the worst offender the plan already called
out; also present in `menu`, `track`, `track/[orderId]`).

**Token mapping applied mechanically across all six files** (chosen because each maps to an
existing token value with zero light-mode visual change):
- `text-slate-900/950/800` → `text-foreground`; `text-slate-700/600/500/400` → `text-muted-foreground`
  (`--muted-foreground: #64748b` already equals slate-500 exactly).
- `bg-slate-50/100`, `bg-gray-50` → `bg-muted` (`--muted: #f1f5f9` already equals slate-100 exactly).
- `border-slate-100/200/300` and the `border-black/10` pattern already used throughout these files
  → `border-border` (`--border: rgba(0,0,0,0.1)` already equals `border-black/10` exactly in light
  mode; in dark mode it becomes `rgba(255,255,255,0.1)`, which `border-black/10` could never do).
- `text-[#1A4D2E]` / `bg-[#1A4D2E]/N` / `border-[#1A4D2E]/N` / `hover:bg-[#1A4D2E]` /
  `focus:ring-[#1A4D2E]/N` → the equivalent `primary` utility (`text-primary`, `bg-primary/N`,
  `border-primary/N`, `hover:bg-primary/90`, `focus:ring-primary/N`).

**Explicit exceptions — NOT swept, by design:**
- **`wallet/page.tsx`'s balance hero card** keeps its hardcoded `linear-gradient(135deg,#14351f...
  #2d6a3d)` inline style and matching `#79a55e` progress-bar gradient. This is a fixed brand-green
  "hero" treatment (same reasoning as `SiteHeader`/`SiteFooter` keeping their own accent styling
  regardless of theme) — it is not meant to invert in dark mode, it's meant to always look like
  money/brand green. Same for the wallet quick-topup preset buttons' selected-state green.
- **The full-page decorative background washes** (`bg-[linear-gradient(180deg,#f5f0e8_0%,#ffffff_32%,
  #eef5ee_100%)]` and near-identical variants in `menu`, `order`, `wallet`, `track`) become plain
  `bg-background` — the three-stop cream→white→pale-green wash has no correct dark-mode equivalent
  without a second, dark-specific gradient token, which is out of scope for this stage; a flat
  themed background is the correct trade here, not a partial fix.
- **`track/[orderId]/page.tsx`'s per-status color badges** (`bg-yellow-50 border-yellow-300`,
  `bg-blue-50`, `bg-orange-50`, `bg-green-50`, etc. for pending/confirmed/preparing/ready/delivered)
  are categorical status colors, not brand tokens — they stay as-is. Giving each a dark-mode
  counterpart is real work (5 statuses × light/dark) folded into UIX-6's dark-safe sweep, not this
  pass, to keep this stage's diff reviewable.
- **`menu/page.tsx`'s hero banner and `track/[orderId]/page.tsx`'s WS-driven timeline** already have
  bespoke, higher-quality animation/visual treatment than a generic page would — they are NOT
  wrapped in a generic `PageHeader` (see below) and their existing custom keyframes
  (`menu-item-enter`, `cart-fab-bounce`, `hero-food-strip`) are kept, not replaced with the shared
  `animate-fade-up` vocabulary — only gaining a `motion-safe:` guard, since they currently ignore
  `prefers-reduced-motion` entirely (a real accessibility gap the plan's motion vocabulary was
  designed to prevent, that these bespoke animations predate and missed).

**`PageHeader` adoption:** `wallet`, `track` (the plain order-ID-entry landing page), and
`track/[orderId]`'s top title block all get it — each was the generic `<h1>`+description hand-rolled
pattern `PageHeader` was built to replace (for `track/[orderId]`, the connection-status badge + "Back
to Menu" button move into `PageHeader`'s `action` slot). `order`'s header keeps its own step-indicator
row (not hierarchy-breadcrumb material). `profile`'s header turned out, on closer inspection, to be a
custom avatar+name identity card, not a generic title block — kept as-is (a correction from this
section's first draft, made before writing the code). `menu`'s animated hero banner and
`track/[orderId]`'s dynamic status-color Card + timeline (the actual bespoke/status-driven UI, below
its now-`PageHeader`-ized title) keep their existing treatment per the exceptions above.

**Motion vocabulary applied:**
- `order/page.tsx`'s 4-step checkout gains `key={activeStep}` + `motion-safe:animate-fade-up` on the
  step content `Card` (currently no transition at all between steps — the auth pages' pattern from
  the 2026-07-11 pass, not yet applied here).
- `profile/page.tsx` gains a loading skeleton — the plan's explicit callout ("only surveyed page
  missing one"): while `storeUser` is null (before `(customer)/layout.tsx`'s `syncUser` resolves),
  render skeleton blocks instead of a form with empty values.

**Bugs found and fixed while touching these files (not polish, real defects):**
1. **`profile/page.tsx`'s `ChangePasswordModal` is rendered without its required `open` prop**
   (`<ChangePasswordModal onClose={...} />` — `open` is a required prop per its own signature). This
   is the exact pre-existing `tsc` error this project's typecheck has carried since before UIX-1
   (`Property 'open' is missing...`). Fixed by passing `open={showChangePw}`.
2. **`track/page.tsx`'s "Track Order" button navigates to the bare `/track/{id}` path**, missing the
   tenant slug prefix — every real route is `/{tenant_slug}/track/{orderId}`, so this button silently
   404s today. Fixed to `router.push(`/${slug}/track/${trimmed}`)`.
3. **Same bug class, found while implementing this stage, in `track/[orderId]/page.tsx`**: both the
   "Back to Menu" button and the post-"Mark Meal Done" redirect called `router.push('/menu')` with no
   tenant slug — same silent-404 defect as #2. Fixed both to `router.push(`/${tenantSlug}/menu`)`
   using the store's `tenantSlug`.
4. **Same bug class again, found via QA browser testing 2026-07-16, in `components/menu/CartSidebar.tsx`**
   (a component shared by `(student)/menu/page.tsx`, and therefore both the `(student)/menu` and
   `[tenant_slug]/(customer)/menu` re-export trees): "Proceed to Order →" called
   `router.push('/order')` unconditionally — every tenant-scoped checkout landed on the bare legacy
   `/order` route instead of `/{tenant_slug}/order`. Unlike #2/#3, this one didn't 404 (the legacy
   `/order` page still renders — see the routing tree's legacy-route notes), so the checkout still
   *worked*, but the nav footer and every in-page link went un-prefixed for the rest of the session,
   and — the more serious half of this bug — landing on `/order` mounted `(student)/layout.tsx`
   **on top of** `[tenant_slug]/(customer)/layout.tsx` still being in the tree, so `<CartSidebar />`
   rendered **twice** (once from each layout, both `fixed`-positioned at identical coordinates,
   confirmed via `document.querySelectorAll` returning two "My Cart" headings) — a genuine duplicate
   in the DOM, not just a routing cosmetic. Fixed two ways together: (a) `CartSidebar` now reads
   `tenantSlug` from the store and pushes `` `/${tenantSlug}/order` `` when present, falling back to
   `/order` only for the legacy non-tenant tree; (b) removed `(student)/menu/page.tsx`'s own inline
   `<CartSidebar />` render entirely — both of its hosting layouts (`(student)/layout.tsx` and
   `[tenant_slug]/(customer)/layout.tsx`) already render one each, so the page-level one was pure
   duplication in every context this shared page can mount in, not just the mixed-tree case. See also
   `modules/orders.md` OR-13 for a same-day, same-QA-pass fix to what this checkout flow's tracking
   page actually displays.

### Admin section polish (UIX-5 — implemented 2026-07-12, see ADR-010)

**Scope:** the 17-page admin surface. Five pages are re-export stubs pointing at a top-level
`(admin)/*` route group (`dashboard`, `users`, `reports`, `analytics`, `menu-management` →
`(admin)/menu-admin`) — same one-line `export { default } from ...` pattern as the customer section,
so those edits land once in `(admin)/*` and the tenant-scoped stub picks it up automatically.
`orders/page.tsx` re-exports `(staff)/orders/page` — that implementation is staff-owned and stays out
of this stage; it's UIX-6's. The four inventory sub-pages (`movements`, `purchase-orders`, `central`)
and `users/invite` already got `PageHeader` + breadcrumbs in UIX-1 and are not touched again here.

**Two corrections to the original plan, found by reading the actual code before implementing (same
discipline as UIX-3's tenant-search correction):**
1. **`menu-admin`'s "inline non-shadcn dialogs" don't exist anymore.** The plan's UIX-5 bullet named
   this as a gap, but `components/admin/MenuItemForm.tsx` already uses `Dialog`/`DialogContent`/
   `DialogHeader`/`DialogFooter` properly, and the delete-confirmation already uses `AlertDialog` —
   both correctly since before this session (a grep for the hand-rolled `fixed inset-0` pattern across
   `menu-admin` and its components found zero matches). No migration needed; this line item is a no-op.
2. **A grep across all 12 remaining real admin page implementations for color debt found the surface
   is smaller than assumed**: `inventory/page.tsx`, `public-link/page.tsx`, `tables/page.tsx`,
   `outlets/page.tsx`, and `memo/page.tsx` are already fully token-clean (zero `slate-*`/hardcoded-hex/
   `bg-white` hits) — likely built or touched after the shadcn token migration. Only
   `(admin)/{analytics,dashboard,menu-admin,reports,users}/page.tsx` and
   `[tenant_slug]/(admin)/settings/page.tsx` carry real debt, so the token sweep in this stage is
   scoped to those six files, not all seventeen.

**Token sweep (six files above):** same mapping established in UIX-4 —
`text-slate-{900,950,800}`→`text-foreground`, `text-slate-{700,600,500,400}`→`text-muted-foreground`,
`bg-slate-{50,100,200}`→`bg-muted`, `border-slate-*`/`border-black/N`→`border-border`,
`bg-white`→`bg-card`, `#1A4D2E`/`text-[#1A4D2E]` etc.→the `primary` utility. `analytics/page.tsx`
additionally has two recharts-specific hardcoded colors (`stroke="#e2e8f0"` on `CartesianGrid`,
`fill: '#94a3b8'` on both axis ticks) that become `var(--border)` / `var(--muted-foreground)` — the
chart's area-gradient stops already correctly use `var(--color-primary, #1A4D2E)` (a pre-existing,
correct pattern from before this stage), so only the grid/tick colors needed fixing, not the whole
chart. `recharts`' `isAnimationActive` is on by default and already provides the chart's mount
animation — no extra motion is added on top of it (per the plan's explicit "don't double-animate").

**`PageHeader` adoption:** all 12 pages in scope get it — every one surveyed has the same generic
hand-rolled `<h1 className="text-{2xl,3xl} font-black ...">` this component was built to replace (no
customer-section-style bespoke exceptions were found here). `tables/page.tsx`'s live/editor `Tabs`
toggle and `users/page.tsx`'s existing header actions move into `PageHeader`'s `action` slot.

**Skeleton→content fade-up:** each page's loaded-content root gets one `motion-safe:animate-fade-up`
wrapper (applied once per page, not per element) so data "arrives" instead of popping in after its
loading skeleton — the same pattern already used for `profile/page.tsx`'s sections in UIX-4.

**Users page pagination:** the hand-rolled `Previous`/`Next` `Button` pair is replaced with
`components/ui/pagination.tsx`'s `Pagination`/`PaginationContent`/`PaginationItem`/
`PaginationPrevious`/`PaginationNext` (installed via the original shadcn CLI run, never imported
anywhere until now).

**Tables/floor-plan tiles:** `LiveTableGrid`'s tiles already have a hover state
(`hover:opacity-90 hover:ring-2 hover:ring-ring`) but no *selected* state — clicking a tile opens
`TableDetailPanel` with no visual feedback on which tile is open. Adds a `ring-2 ring-primary
ring-offset-2` (plus a small `hover:-translate-y-0.5` lift, matching the shared vocabulary) when
`table.table_id === selectedTableId`.

**Dark-safe:** fully covered by the token sweep above — no separate pass needed, since the six
touched files' hex/slate debt was the only dark-mode gap in this section (the other 11 pages were
already token-clean per the correction above).

### Staff, food-court & platform polish (UIX-6 — implemented 2026-07-12, see ADR-010)

**Scope — final stage of the program.** Three sections, following the same survey-before-code
discipline as every prior stage:

**Staff (2 real pages, behind stub re-exports same as UIX-5's admin group):**
`[tenant_slug]/(staff)/kitchen-queue/page.tsx` → `(staff)/orders/page.tsx`;
`[tenant_slug]/(staff)/pos/page.tsx` → `(staff)/pos/page.tsx`. (`menu-availability` was already
token-clean per an UIX-5-time check and needs no further work here beyond `PageHeader`.)
- `orders/page.tsx` (kitchen queue) **already has a bespoke WS-driven entrance animation** for
  incoming orders (an `entered` state + `translate-y`/`opacity` transition classes, not the shared
  `animate-fade-up`/`animate-scale-in` utilities) — this is kept, not replaced, per the same
  precedent as `menu`'s hero animations in UIX-4: it already works and is bespoke to this page's
  real-time nature. Its only gap is that it ignores `prefers-reduced-motion` entirely; the transition/
  transform classes gain a `motion-safe:` prefix so reduced-motion users see new orders appear
  instantly instead of sliding in. The per-status column card colors (`statusStyles`: amber/sky/
  violet/emerald/slate/rose) are categorical, not brand tokens — kept as-is, same exception class as
  `track/[orderId]`'s status badges (UIX-4) and `fc-analytics`'s occupancy pie colors (below). The one
  real token gap is the special-notes `Badge` hardcoding `bg-slate-900 text-white` instead of a
  semantic pairing — becomes `bg-foreground text-background`. Standard token sweep otherwise
  (`slate-*`→tokens, `bg-white`→`bg-card`, page background gradient→`bg-background`), plus
  `PageHeader`.
- `pos/page.tsx` has **zero hover state on its item-grid tiles** — the plan's explicit callout. Gains
  `transition hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5` matching the vocabulary
  used on `TenantCard`/inventory rows elsewhere. Standard token sweep + `PageHeader`. The palette from
  UIX-3 already covers "keyboard-friendly" navigation for admin tiers, but `staff` is not one of the
  three roles the palette is scoped to (see UIX-3's spec) — POS itself doesn't gain a palette; it
  gains real per-item hover affordance instead, which is the concrete gap the plan actually named.

**Food-court (5 pages, all already token-clean):** a repeat grep found `fc-dashboard`, `unified-menu`,
`deliver`, `shared-tables` fully clean, and `fc-analytics` clean except its `PieChart` segment colors
(`available`/`occupied`/`reserved`/`cleaning` → green/rose/amber/slate hexes) — categorical occupancy
colors, not brand tokens, same exception class as the staff kitchen-queue status colors above; kept
as-is. All 5 have the same generic hand-rolled `<h1>` this program's `PageHeader` was built to
replace — adopted on all 5, with a `motion-safe:animate-fade-up` wrapper on each page's loaded-content
root (same one-wrapper-per-page pattern as UIX-5).

**Platform (4 pages) — closes a gap this program itself created and documented.** ADR-010's UIX-1
section explicitly flagged this as a known follow-up: once the new `(platform)/admin/layout.tsx`
sidebar wrapped these pages, their own inner content (`min-h-screen bg-[linear-gradient(...)]` full-
page backgrounds, hardcoded `text-slate-*`) was left untouched, "intentionally left for UIX-6." A
fresh grep confirms real debt in **all four**: `tenants`, `subscriptions`, `analytics`, `audit-log`.
Standard token sweep + page-background-gradient→`bg-background` across all four.
`analytics/page.tsx`'s recharts grid/tick colors (`#64748b`/`#f1f5f9`) get the same treatment as the
tenant-admin analytics page did in UIX-5 (`var(--muted-foreground)`/`var(--border)`).
`audit-log/page.tsx`'s hand-rolled `Previous`/`Next` `Button` pair is replaced with
`components/ui/pagination.tsx` — the plan's explicit callout, same swap `users/page.tsx` got in
UIX-5. All four already have `PageHeader` from UIX-1 (built alongside the new platform layout) — no
further header work needed, just the color/pagination fixes above.

**Program-wide dark-safe sweep:** with this stage's token conversions, every page touched across
UIX-1 through UIX-6 is now token-based; the categorical/status-color exceptions documented across
UIX-4/5/6 (order-tracking statuses, kitchen-queue columns, table statuses, occupancy pie segments)
are the only remaining hardcoded hues in the app, and each is a deliberate, load-bearing semantic
color rather than dark-mode debt. This closes ADR-010's dark-mode scope for the whole program.

### Form convention: every `<form>` MUST specify `method="post"` (see ADR-008)

React (`onSubmit={handleSubmit(...)}`) intercepts submission only once hydrated. Before hydration
completes, a user submitting a form falls through to the browser's native behavior — an unspecified
`method` defaults to `GET`, which puts every field value (including passwords) into the URL, browser
history, and server logs. Every `<form>` element must specify `method="post"` as a zero-behavior-
change, defense-in-depth fallback; this does not alter React's normal handling, only the rare
native-fallback path. Applied to all 17 forms in the codebase as of 2026-07-11 (see ADR-008).

---

## API Client (`src/lib/api.ts`)

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
});

// Request interceptor: inject JWT
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('scms-store');
  if (stored) {
    const state = JSON.parse(stored);
    const token = state?.state?.token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;
```

**Key facts:**
- No `X-Tenant-Slug` header is sent — tenant context comes from JWT only
- No response interceptor (no automatic 401 redirect)
- Token read from `localStorage` key `scms-store` → nested `state.token`

---

## Auth Utilities (`src/lib/auth.ts`)

```typescript
interface JwtPayload {
  sub: string;           // user_id
  role: UserRole;
  tenant_id: string;
  tenant_type: TenantType;
  tenant_slug: string;
  outlet_id: string | null;
  exp: number;
  jti: string;
  impersonation?: boolean;  // ✅ [Phase 24 — RFC-009] true only on impersonation tokens
}

function getRoleFromToken(token: string): UserRole | null
function getClaimsFromToken(token: string): JwtPayload | null
function isTokenExpired(token: string): boolean
```

---

## TypeScript Types (`src/types/index.ts`)

### `TenantType`
```typescript
type TenantType =
  | 'franchise_brand'
  | 'franchise_outlet'
  | 'corporate'
  | 'academic'
  | 'independent_restaurant'
  | 'food_court'
  | 'food_court_vendor';
```

### `UserRole`
```typescript
type UserRole =
  | 'platform_admin'
  | 'super_admin'
  | 'outlet_admin'
  | 'tenant_admin'
  | 'food_court_admin'
  | 'staff'
  | 'cleaner'
  | 'server'
  | 'student'
  | 'customer'
  | 'admin';  // legacy alias — maps to customer in permission checks
```

### `User`
```typescript
interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  tenant_id: string;
  outlet_id: string | null;
  employee_id: string | null;
  wallet_balance: number;
  reward_points: number;
  email_verified: boolean;
  is_active: boolean;
  created_at: string;
}
```

### `MenuItem`
```typescript
interface MenuItem {
  item_id: string;
  category_id: number;    // integer, not UUID
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_homemade: boolean;
  prep_time_mins: number;
}
```

### `Order`
```typescript
interface Order {
  order_id: string;
  user_id: string;
  table_id: number | null;    // integer, not UUID
  time_slot: string;
  status: OrderStatus;
  total_amount: number;
  discount_amount: number;
  payment_status: string;
  payment_method: string | null;
  special_notes: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}
```

### `TableMap`
```typescript
interface TableMap {
  table_id: number;       // integer, not UUID
  table_number: string;
  zone: string;
  capacity: number;
  status: TableStatus;
  position_x: number | null;
  position_y: number | null;
}
```

### `WsMessage`
```typescript
interface WsMessage {
  type: string;           // e.g. "ORDER_PLACED", "LOW_STOCK"
  [key: string]: unknown; // additional fields per event type
}
```

### `CartItem`
```typescript
interface CartItem {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string | null;
}
```

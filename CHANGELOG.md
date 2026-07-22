# Changelog

All notable changes to the SCMS project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added — Payment gateway integration, Stage 1: data model + admin config (2026-07-22, see RFC-011/ADR-015)

Per-tenant SSLCommerz + native bKash payment gateway integration, previously listed on the roadmap as
"genuinely blocked on real merchant credentials" — both gateways publish public sandbox credentials
usable without a real business, which unblocks full build-and-test now. This stage: data model,
credential encryption, and admin configuration only — no consumer checkout changes yet (Stages 2–4).

- New tables `tenant_payment_gateways` and `gateway_transactions` (async gateway session lifecycle);
  `wallet_transactions` **actually implemented** for the first time — it was documented in
  `specs/system/data-model.md` since before this RFC as the wallet system's "authoritative audit
  trail" but no migration or model ever created it, and `PaymentService.topup()` never wrote to it.
  Retrofitted onto the existing top-up path now, before any gateway complexity.
- New `backend/app/core/crypto.py` (Fernet, new `ENCRYPTION_KEY` setting) encrypts only the
  genuinely secret sub-fields of a tenant's gateway credentials at rest — fails loudly if
  `ENCRYPTION_KEY` is unset, deliberately unlike this codebase's existing "quietly degrade" pattern
  for optional integrations (B2/mail/Brevo), since silently storing a merchant password in plaintext
  isn't an acceptable degraded mode.
- New admin page `payment-settings` (mirrors the existing `public-link` page's pattern) and
  `GET/PUT/DELETE /payment-gateways/me`, `GET /payment-gateways/available` endpoints.
- No subscription-tier gating (available to every tier) and no changes to the existing
  `wallet`/`simulation` payment paths — confirmed decisions, not oversights.

### Fix — Dark mode consistency audit (2026-07-22, see ADR-014)

User-reported "dark mode doesn't work on many pages" traced to two categories of gap, not one
scattered set of bugs: shared UI primitives never actually swept despite prior stages claiming
completeness, and a Tailwind `content` glob that silently dropped classes defined only in
`src/lib/*.ts` files.

- `components/ui/{card,alert-dialog,alert,switch}.tsx` — the four shared primitives (imported by
  40+ files) had hardcoded `text-slate-900`/`bg-white`/`bg-slate-50`/`bg-gray-300`; switched to
  theme tokens, with `Alert`'s `success`/`warning` variants gaining a translucent `dark:` variant.
- `(cleaner)/tables/page.tsx` (served at both `/tables` and `cleaning-queue`) — full color token
  sweep; the cleaner role's queue page was previously 100% light-locked in dark mode.
- `CategoryTabs.tsx` + `lib/category.ts`, `HourlyHeatmap.tsx`, `TableGrid.tsx`,
  `TimeSlotPicker.tsx`, `unauthorized/page.tsx`, `track/[orderId]/page.tsx`'s status-color cards,
  `discover/page.tsx`'s main background — each had a small hardcoded-slate/white patch never
  covered by any prior UIX stage.
- `SplitAuthPanel.tsx` now actually uses the `.light` CSS escape hatch that `globals.css` has
  documented since 2026-07-21 but that was never wired to any element.
- **Root-cause build bug**: `tailwind.config.js`'s `content` array never scanned `src/lib/**`, so
  Tailwind's JIT purge silently dropped any class defined only inside a `src/lib/*.ts` file (found
  via `lib/category.ts`'s category-color map only partially rendering dark variants). Fixed by
  adding `'./src/lib/**/*.{js,ts,jsx,tsx,mdx}'` to the content array — prevents the same silent-drop
  trap for any future Tailwind class placed under `src/lib/`.

Full detail in `specs/decisions/adrs/ADR-014-dark-mode-consistency-audit.md`.

### Fix — Production deployment blockers in the prod compose path (2026-07-16)

Preparing the single-VM public deployment surfaced that `docker-compose.prod.yml` had never been
run end-to-end. Four defects fixed (detail in `specs/operations/deployment.md` "Production compose
contract"):

- **Deployed frontend pointed at `localhost` no matter what.** `NEXT_PUBLIC_*` vars are inlined at
  `next build` time, but the prod compose passed them only as runtime env while the image serves a
  bundle built without them. Now passed as Docker `build.args` into the `builder` stage.
- **Prod `NEXT_PUBLIC_WS_URL` had a stray `/ws` suffix** → would yield `/ws/ws/{id}` and 403 every
  WebSocket connect. Removed (the hook appends `/ws/{id}` itself, matching the dev compose).
- **`next build` failed on the three `__tests__` files** (jest globals, no jest types) — now
  excluded via `tsconfig.json`.
- **`next build` failed prerendering `/discover` and `/register-organization`** — both statically
  generated pages call `useSearchParams()` without a `<Suspense>` boundary, a hard error in
  Next.js 14 static generation (never hit by `next dev`). Both now export a thin Suspense wrapper
  around the page body.
- **The `runner` image stage failed on a missing `frontend/public/` directory** (the Dockerfile
  copies it; the repo never had one) — added with a `.gitkeep`.
- **Hardening:** Postgres no longer publishes 5432 to the host; pgAdmin binds to loopback only.
- `.env.example` fixed: removed `PLATFORM_NAME`/`MEDIA_DIR` (pydantic rejects unknown keys — a
  copied example crashed backend startup), added `BREVO_API_KEY` and `FRONTEND_URL`. Also removed
  the stray root `package.json`/`package-lock.json` (accidental root `npm install`; broke Vercel
  root-directory detection).

### Changed — Discover pagination + footer never covered by sidebars (2026-07-16)

- **`/discover` now has standard server-side pagination.** `GET /tenants/public` gains
  `skip`/`limit`/`segment` query params (segment resolved server-side via `SEGMENT_MAP`,
  superseding the RFC-007 client-side-filter MVP shortcut); `total` is post-filter/pre-slice.
  Redis caching reworked to versioned per-page keys (`tenants:public:v{N}:…`, invalidation by
  `INCR`ing the version). The discover page renders shadcn pagination controls (page size 12,
  "Showing X–Y of Z"), resetting to page 1 on search/segment change. Spec: `modules/tenants.md`,
  `frontend/overview.md`.
- **Fixed sidebars no longer cover the global footer.** The three fixed-sidebar dashboard layouts
  (tenant admin, food court, platform admin) now suppress the root layout's full-width `SiteFooter`
  (non-persisted store flag) and render `<SiteFooter inset />` inside their content column — the
  standard dashboard pattern. Modal drawers/sheets intentionally unchanged. Spec:
  `frontend/overview.md`.

### Fix — Dark-mode contrast bug on the public guest surface, found via P3 QA pass (2026-07-16)

The only bug found across the entire P3 (cross-cutting/resilience) tier — session/token handling,
tenant isolation, WebSocket reconnection, error/404 states, responsive layout, and kiosk i18n all
passed. Detail in `frontend/overview.md` (`m/[public_slug]` section).

- **Guest menu and guest tracking pages were unreadable in dark mode.** Both `m/[public_slug]`
  pages hardcoded light-only colors (`bg-slate-50` page, `bg-white` sticky/total bars,
  `text-slate-900` item names) while their cards used the theme-aware shadcn `Card` — so in dark
  mode the cards flipped dark but the headings inside stayed near-black (dark-on-dark), with a
  light page body behind dark cards. Replaced every hardcoded neutral with the theme tokens the
  rest of the app uses (`text-foreground`, `text-muted-foreground`, `bg-muted/30`, `bg-background`,
  `bg-card`, `border-border`); semantic status colors (emerald "Paid" badge, live dot) kept as-is.

### Fix — Four bugs found via P2 platform/kiosk/signage/QR QA pass (2026-07-16)

Found while testing the platform admin console, device/kiosk/signage flows, and QR/PDF generation.
Detail in `frontend/overview.md`, `modules/signage.md` SGN-6, and `modules/qr-pdf.md`.

- **"Exit impersonation" always landed on `/unauthorized`.** The banner swapped the token back via
  Zustand `setToken()` and then did a `router.replace('/admin/tenants')` — but the impersonated
  tenant's `[tenant_slug]/(admin)/layout.tsx` was still mounted and its own guard reacted to the
  token swap first (tenant-slug mismatch against the still-current URL), winning the redirect race.
  Fixed with a hard `window.location.href` navigation instead, which tears down the old page before
  the restored-token page ever mounts.
- **Platform Subscriptions page crashed outright** (`TypeError: tenants.map is not a function`).
  `GET /tenants` returns `{items, total}`; the page did `setTenants(res.data)` directly instead of
  the `res.data.items ?? res.data` unwrap the sibling Tenants page already used for the same
  endpoint.
- **Signage full-screen preview randomly failed to load**, bouncing preview → login → dashboard.
  Its auth guard was missing the `hasHydrated` check every other guarded layout has; this route's
  unusually heavy bundle (~2,400 modules) widens the pre-hydration window enough to reliably lose
  the race in practice — and real signage hardware (lower-spec, always-on displays) is if anything
  more exposed to this than a typical admin browser.
- **Order-confirmation QR emails never sent.** `email_qr_attachment` bypassed the app's
  Brevo-preferred provider selection and always used SMTP with the unfilled `.env.example`
  placeholder credentials. QR generation itself (file + DB row) was never affected — only delivery.
  Fixed by routing through a new `send_qr_attachment_email()` in `app/config/email.py` (same
  provider selection as OTP/invite emails); `qr_codes.emailed`/`emailed_at`, previously dead
  columns no code path wrote to, are now set on a genuine successful send.

### Fix — Three bugs found via P1 food-court/notifications QA pass (2026-07-16)

Found while testing food-court fulfillment and the notification inbox. Detail in
`modules/orders.md` OR-14, `modules/food-court.md` FC-5, and `frontend/overview.md`.

- **`server`-role staff could never open the orders page their own login sends them to.** The
  legacy `(staff)/orders/page.tsx` (reused via re-export for every tenant's `/orders`) wraps itself
  in `<ProtectedRoute allowedRoles={["staff", "admin"]}>`, omitting `"server"` even though the login
  redirect treats `staff` and `server` identically. Fixed by adding `"server"` to the allowed list.
- **A food-court vendor's own admin could self-mark orders `delivered`, bypassing the shared-staff
  pickup model.** `PATCH /orders/{id}/status` had no food-court-vendor special case, so any
  `WORK_ROLE` — including a vendor's own `tenant_admin` — could jump an order straight to
  `delivered` from the ordinary kitchen queue, sidestepping the `server`-role-only
  `PATCH /food-court/orders/{id}/deliver`. Fixed by rejecting the `delivered` transition on that
  generic endpoint for `food_court_vendor` tenants.
- **`useStore.user` was never populated for cleaner/staff/admin roles — only customer/student.**
  Confirmed live: the same stale `user_id` (from a much earlier login) followed a browser profile
  across cleaner, food-court admin, vendor admin, and server logins in a row. This silently broke
  every non-customer WebSocket connection (wrong `user_id` in the URL → rejected by the backend) —
  no cleaner/staff/admin page ever received a live order/table/cleaning update. Fixed by adding the
  same `/auth/me` → `setUser()` sync effect the customer layout already had to the cleaner, staff,
  and admin layouts.

### Fix — Two bugs found via P1 browser QA pass (2026-07-16)

Found while testing the admin console and cleaner module. Backend suite still 224/225 passing
(same pre-existing unrelated OTP failure). Detail in `modules/inventory.md` INV-8 and
`modules/cleaners.md`.

- **Every inventory item creation failed with a false-positive 400.** `create_inventory_item`
  validated `inv_category_id` against the tenant unconditionally, including when it was `None` (its
  own documented default) — and the admin "Add Item" form has no category picker, so it was always
  `None`. `InventoryCategory.inv_category_id == None` never matches a row, so every creation was
  rejected. Fixed by skipping validation when `inv_category_id is None`, matching the guard the
  `PUT` update endpoint already had.
- **"Assign Cleaner" button in the table admin panel always failed.** It called
  `POST /cleaners/logs/`, a route that was never implemented (and was documented in the spec with a
  request shape — `cleaner_id` — the UI never sent). The real system has no manual-assignment
  capability at all: cleaners are auto-assigned, load-balanced, when a customer marks their order
  complete (`PATCH /orders/{id}/complete` → `CleanerService.assign_cleaner`). Removed the dead
  button/handler, rewrote `modules/cleaners.md` to document the real `/cleaners/assignments*`
  routes, and fixed the post-login redirect for the `cleaner` role (was sending cleaners to
  `/tables`, a page they can't act on; now sends them to `/cleaning-queue`).

### Fix — Five bugs found via full-site browser QA pass (2026-07-16)

Found by driving the app end-to-end in a real browser (login → order → payment → staff fulfillment)
rather than trusting the API test suite alone. Full backend suite still 224/225 passing (same
pre-existing unrelated OTP failure) after all fixes. Detail in `modules/orders.md` OR-13,
`modules/tenants.md` (`PATCH /tenants/me/settings`), and `frontend/overview.md`.

- **Order items/tables displayed as raw UUIDs/IDs, not names.** `OrderItemResponse` had no item
  name and `OrderResponse` had no table label — every order-tracking surface (guest, authenticated
  customer, staff kitchen queue) rendered `item_id`/`table_id` directly. Added guarded
  `menu_item`/`table_number` fields (never trigger a lazy-load `MissingGreenlet`) and eager-loaded
  them at every response-building call site across `order_service.py`, `routers/orders.py`,
  `routers/public.py`, `routers/device_api.py`.
- **Guest-ordering "live" state could be silently wrong.** The admin Public Link page showed the
  guest menu URL and offered a QR-sheet download based only on whether a slug was set, ignoring the
  actual `public_menu_enabled` toggle — an admin could believe guest ordering was live (and hand out
  QR codes) while it was actually off.
- **Checkout routed to the bare `/order`, not `/{tenant_slug}/order`,** and mounted the cart sidebar
  twice in the DOM. Root cause: `CartSidebar` hardcoded `/order`, and `(student)/menu/page.tsx`
  rendered its own `<CartSidebar />` on top of the one its hosting layout already renders.
- **No redirect on role/tenant mismatch.** `[tenant_slug]/(admin)/layout.tsx` only checked for a
  missing token — a `staff` session hitting an admin-only URL, or any session hitting a different
  tenant's admin URL, rendered the full admin shell indefinitely (data calls correctly 403'd, but
  the page never redirected). Now redirects to `/unauthorized` on either condition, and the sidebar
  nav itself is now role-gated to match.
- **Password autofill leaked across unrelated forms** (missing `autocomplete` attributes) on
  register/login/forgot-password/change-password forms.

### Fix — WebSocket routing bug and cross-connection event duplication (2026-07-15)

Found by precisely re-testing the Phase 25 device WebSocket channel after the fact (live WS
connections, not just REST) rather than trusting the REST contract alone:

- **`/ws/device` was completely unreachable.** `routers/websocket.py` registered `/ws/{user_id}`
  before `/ws/device`; Starlette matches WebSocket routes in registration order, not by
  specificity, so the single-segment dynamic route silently swallowed every device connection
  attempt (it tried to JWT-decode the opaque device token and rejected with HTTP 403). No
  signage/kiosk device had ever actually received a live `PLAYLIST_UPDATED` / `KIOSK_CONFIG_UPDATED`
  / `DEVICE_REVOKED` / order event over WS. Fixed by declaring `/ws/device` first.
- **Every event was delivered once per currently-open connection on the tenant, not once per
  event.** Each WebSocket connection ran its own `subscribe_and_forward` task with its own Redis
  subscription to the same channel; Redis fans a publish out to every subscriber, so N
  simultaneously connected clients (e.g. a paired kiosk + signage display — exactly the normal
  RFC-010 deployment shape) each received every event N times. Rewrote
  `services/ws_pubsub.py` around a ref-counted registry: one Redis subscription and one listener
  Task per unique channel, shared by every local connection interested in it, instead of one per
  connection. `subscribe()`/`unsubscribe()` replace `subscribe_and_forward`/
  `subscribe_and_forward_many` across all three WS endpoints (`/ws/{user_id}`, `/ws/device`,
  `/ws/public/orders/{guest_token}`). Confirmed via live WS clients: single connection → exactly 1
  delivery; two devices on one tenant → exactly 1 delivery each (was 2); two different staff users
  logged in simultaneously → exactly 1 delivery each (this half of the bug predates RFC-010 and
  affected the plain staff dashboard WS too, just unnoticed since it only manifests as harmless
  wasted redundant sends until a non-idempotent handler is added). Full backend suite still
  224/225 passing (same pre-existing unrelated OTP failure) after the rewrite.

### Added — Phase 25.2–25.6: Kiosk ordering, signage runtime, admin customization + live preview (RFC-010) (2026-07-15)

Completes the device-terminal program started in Phase 25.1: self-service kiosk ordering,
unattended signage displays, and the admin-facing customization UI for both — all bound to
the same data-source-agnostic renderer components used by the live devices (RFC-010 §2.5).

- **Kiosk (25.3)**: `menu_service.build_public_menu()` extracted from `routers/public.py` so
  `/public/{slug}/menu` and `GET /device/menu` share one cost-stripped, allergen-aware builder.
  `POST /device/orders` reuses the guest-order path with no table number, a per-tenant daily
  pickup number (Redis `INCR`, 48 h TTL), and a 10/min/device rate limit. `app/kiosk/` renders
  `KioskExperience` (attract → browse → detail → cart → order-number) with a 60 s idle timeout,
  a ≥20 s WCAG 2.2.1 warning, large-text/high-contrast toggles, and an EN/BN chrome toggle.
- **Signage (25.4)**: `GET /device/playlist` (SGN-3 resolution: explicit assignment → outlet
  default → tenant default), `GET /device/trending` (Redis-cached 10 min top-seller query),
  `GET /device/orders/board` (SGN-7: pickup numbers + status only, never guest identity),
  `WS /ws/device` broadcasting `PLAYLIST_UPDATED` / `KIOSK_CONFIG_UPDATED` / `DEVICE_REVOKED`.
  `app/signage/` renders `SignageRenderer` (menu board, promo image, announcement, order status
  board, trending items, offers) with schedule-window filtering, a localStorage cache for offline
  playback, and a burn-in mitigation shuffle. Legacy `[tenant_slug]/display/page.tsx` (JWT-gated,
  no offline support) replaced with a deprecation notice pointing at the new paired flow.
- **Admin customization + live preview (25.5)**: `routers/signage.py` (playlist/slide CRUD,
  reorder, `PLAYLIST_UPDATED` on every mutation) and `routers/kiosk_config.py` (resolved
  tenant/outlet config, WCAG 1.4.3 accent-contrast check against white button text, publishes
  `KIOSK_CONFIG_UPDATED`) both expose preview endpoints that mirror the device payload shapes
  exactly, so `(admin)/kiosk-settings` and `(admin)/signage` can bind the *real* `KioskExperience`
  / `SignageRenderer` components to unsaved draft state for a true live preview before saving.
  Each editor also has a full-screen preview route (`/kiosk-preview`, `/signage-preview/[id]`).
  Devices admin page gained a per-signage-device playlist assignment control.
- **Hardening (25.6)**: full spec-marker flip (`❌ [Phase 25]` → `✅`) across all RFC-010-touched
  specs now that every phase has shipped and been verified against the live Docker stack.
- Verified live end-to-end against the Docker stack (not just the SQLite test suite): device
  pairing → kiosk order placed (`pickup_number` assigned) → signage order board shows it under
  "Preparing" → staff status transitions move it to "Ready" in real time → trending reflects the
  seeded sale once its 10-minute cache expires → admin playlist create/add-slide/reorder/preview
  round-trips exactly as the editor UI drives it → per-device playlist assignment resolves correctly.

### Added — Phase 25.1: Device registry, pairing, device-token auth (RFC-010 / ADR-013) (2026-07-15)

Backend foundation for kiosk terminals and digital signage displays. Specs first:
`specs/decisions/rfcs/RFC-010-device-terminals.md`, `specs/decisions/adrs/ADR-013-device-token-auth.md`,
new module specs `devices.md` / `kiosk.md` / `signage.md`, plus updates to `data-model.md`,
`security.md` (§8a device credentials + PCI scoping), `websocket.md`, `public-surface.md`,
`orders.md` (OR-12), `menu.md` (BR-MENU-4), `roadmap.md` (Phase 25).

- New `backend/app/models/device.py`: `devices`, `signage_playlists`, `signage_slides`,
  `kiosk_configs` (JSON columns use `JSON().with_variant(JSONB)` so the SQLite test DB keeps working).
- Migration `0009_add_devices_and_signage.py` — also adds `orders.pickup_number` and
  `menu_items.allergens` / `dietary_tags` (EU FIC 14 closed vocabulary).
- `core/dependencies.py`: `get_current_device()` (X-Device-Token → SHA-256 hash lookup with 60 s
  Redis cache, throttled `last_seen_at`) + `require_device_type()`.
- `routers/devices.py` (admin, `ADMIN_ROLES`): register/list/patch devices, issue 6-digit single-use
  pairing codes (Redis GETDEL, TTL 600 s), revoke (immediate — nulls hash, drops auth cache,
  publishes targeted `DEVICE_REVOKED`), delete.
- `routers/device_api.py` (device-facing): `POST /device/pair` (unauthenticated, 5/min/IP) redeems a
  code for an opaque `scmsd_{k|s}_…` token (plaintext shown once; re-pairing rotates) +
  `GET /device/me` heartbeat/profile with resolved kiosk config (outlet overrides tenant, defaults filled).
- `services/device_service.py`: token lifecycle, kiosk-config + signage-playlist resolution (SGN-3).
- Tests: `backend/tests/test_devices.py` — 11 tests covering DEV-1…DEV-5, DEV-7 (pairing happy path,
  single-use/expired codes, rotation, revocation, cross-tenant invisibility, role gating, rate limit).
  Verified live: register → pair → `/device/me` → revoke → 401 against the Docker stack.

### Fix — Mobile viewport audit: category management unreachable, inventory overflow, cleaner nav, double header (2026-07-12)

See `ADR-012` for the full record. Found by a dedicated phone-width (≤400px) regression pass across
every role's layout and the data-heavy admin pages, prompted by a bug report at `/menu-management`.

**1. Category management (create/rename/delete) was completely unreachable on mobile.**
`app/(admin)/menu-admin/page.tsx`'s category panel (`CategoryManager`) was `hidden ... lg:block`,
with only a plain category-picker `Select` below that breakpoint — no create/rename/delete affordance
existed on any phone-width screen. Added a `Sheet` (the same mobile-overlay primitive already used
for the Sidebar drawer and `CartSidebar`) triggered by an icon button next to the mobile `Select`,
hosting a second `CategoryManager` instance for full CRUD. Also fixed `CategoryManager`'s rename/
delete icon buttons, which were hover-only (`opacity-0 group-hover:opacity-100` — never reveals on
touch): now `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`, always visible below `sm`, unchanged
hover-gated behavior at `sm`+ where the desktop `<aside>` (itself `lg:block` only) lives.

**2. Inventory page overflowed at 375px in two places.** `[tenant_slug]/(admin)/inventory/page.tsx`'s
`PageHeader` action row (3 buttons: Purchase Orders / Movements / Add Item) had no `flex-wrap`, and
the "All Items" `CardHeader` paired a title with a 320px-capped search `Input` in a non-wrapping row —
neither fit a phone screen. Added `flex-wrap` to the button row and made the title/search row stack
vertically below `sm` with a full-width input. Root-caused one level deeper than the local page: adding
`flex-wrap` alone didn't work at first, because `components/layout/PageHeader.tsx`'s own `action` wrapper
was `shrink-0` with no width — a `shrink-0` flex item with no width constraint sizes to its *unwrapped*
content width, so the inner `flex-wrap` never actually had less space than it needed and never
triggered. Fixed at the source in `PageHeader.tsx` (`shrink-0` now only applies from `sm:` up; `w-full`
below it), benefiting any future page with multi-item actions, not just this one — verified live with
Playwright (button right edge was past the 375px viewport before this fix, fully inside it after).

**5. (found during verification, same root cause as #2) A long tenant name pushed the sidebar's `⌘K`
hint past the sidebar's edge, overlapping neighboring page content** — confirmed live on `/menu-management`
at 1440px with a long auto-generated tenant name. Same missing-width-constraint pattern: the `SidebarHeader`
title row had no `w-full`, and its title `<span>`'s `truncate` never engaged because the flex-item
ancestor had no `min-w-0` (flex items default to `min-width: auto`, which blocks `truncate`). Fixed
identically in all three sidebar layouts (`[tenant_slug]/(admin)`, `[tenant_slug]/(food-court)`,
`(platform)/admin`) — confirmed via bounding-box measurement that the badge and neighboring content no
longer overlap, and the tenant name now truncates with an ellipsis as intended.

**3. The cleaner layout's top bar had no mobile handling** — no truncation on the title, no responsive
hiding of the "Logout" label — unlike its sibling `[tenant_slug]/(staff)/layout.tsx`, which already
got this exact treatment in UIX-1 (`ADR-010`). Ported the same pattern: `truncate`/`min-w-0` title,
`shrink-0` logout button, `hidden sm:inline` logout label.

**4. Three sidebar-based layouts double-rendered in the 768–1023px band.** The shared `Sidebar`
primitive switches between its mobile `Sheet` drawer and fixed desktop sidebar at `md` (768px), but
`[tenant_slug]/(admin)/layout.tsx`, `[tenant_slug]/(food-court)/layout.tsx`, and
`(platform)/admin/layout.tsx` all gated their mobile trigger `<header>` on `lg:hidden` (1024px)
instead — so both the fixed desktop sidebar and the mobile trigger header rendered simultaneously in
that range. Fixed by aligning all three to `md:hidden`, matching the breakpoint the underlying
`Sidebar` primitive already uses.

**Audited, no action needed:** dialogs (already width-fluid), most form grids (already collapse to
1 column below `sm`), the `purchase-orders`/`movements`/`outlets` pages (already card-list/responsive-
grid based), the staff top bar (already has UIX-1 mobile handling), the food-court sidebar (same
working `Sheet` pattern as tenant-admin), the customer bottom nav and `CartSidebar` (already a bottom
sheet on mobile), and the command palette (⌘K is inert on touch, but duplicates the already-reachable
visible nav, so nothing is hidden exclusively behind it).

### Fix — Post-onboarding admin sweep across every restaurant category, plus a header/sidebar overlap (2026-07-12)

Found by registering a fresh organization of each self-serve tenant type (independent restaurant,
corporate, academic, franchise brand, food court) through the real UI with Playwright, logging in as
the new admin, and crawling every admin page for console/page errors and failed API calls — not just
reading code.

**1. Food-court admins got a wall of silent 403s on Inventory, Purchase Orders, and Inventory
Movements.** `[tenant_slug]/(admin)/inventory/{page,purchase-orders/page,movements/page}.tsx` each
guarded access with `ProtectedRoute allowedRoles={[..., 'admin']}`. `'admin'` is a legacy alias that
`ProtectedRoute` expands to `ADMIN_ROLES`, which includes `food_court_admin` — silently re-admitting
the exact role the explicit list was written to exclude. The backend already correctly rejects
`food_court_admin` from `/inventory/*` per `specs/modules/inventory.md` ("food court parent tenant
has no inventory of its own"), so the page rendered but every fetch inside it 403'd. Removed the dead
`'admin'` alias from all three `allowedRoles` arrays (it can never appear in a real JWT — the backend
`UserRole` enum has no `'admin'` value) and hid the Inventory nav entry from `food_court_admin` in
`[tenant_slug]/(admin)/layout.tsx`, whose `visibleNav` filter previously only checked `allowedTypes`
and silently ignored `allowedRoles` entirely — fixed to check both. Per `WORKFLOW.md`'s bug-fix rule,
the spec was already correct here; only the code needed fixing.

**2. The Outlets page fired its API call before checking tenant type.** Any non-franchise admin who
reached `[tenant_slug]/(admin)/outlets` (hidden from nav, but reachable via direct URL/back-button)
got a spurious "Failed to load outlets" toast from a `GET /tenants/{id}/outlets` call the backend
always rejects with 403 for non-franchise tenants, even though the page itself correctly renders
"Outlets are only available to franchise brands." Fixed by skipping the fetch entirely when
`tenantType !== 'franchise_brand'`.

**3. Input text was invisible in "always-light" auth/onboarding cards under system dark mode.**
`register-organization`, both `[tenant_slug]/(auth)/{login,register}`, and both legacy
`(auth)/{login,register}` pages hardcode their `Card` to `bg-white`/`bg-white/92`, but their `Input`
fields read theme-reactive CSS variables (`bg-background`, `text-foreground`, etc.). With the OS/
browser in dark mode, `next-themes` applies `.dark` to `<html>`, so those variables resolved to the
dark palette (near-black) inside a card that stayed white — black-on-black text. Added a `.light`
CSS class (`globals.css`) that pins the full light-mode variable set regardless of an ancestor
`.dark`, applied to the `Card` on all five affected pages.

**4. The global sticky header clipped the top of every sidebar-based console.** `SiteHeader` (root
layout, every page) is `sticky top-0`, 59px tall, but the shared `Sidebar` primitive
(`components/ui/sidebar.tsx`) used `fixed inset-y-0 h-svh` for its desktop container — pinned to the
true viewport top, ignoring the header's space in the document flow, so the header (higher z-index)
visually covered the sidebar's first ~59px on every page that uses it: `[tenant_slug]/(admin)`,
`[tenant_slug]/(food-court)`, and `(platform)/admin`. Added a `--site-header-height: 59px` CSS
variable and changed the sidebar container to `top-[--site-header-height] bottom-0
h-[calc(100svh-var(--site-header-height))]`. Verified zero overlap on all three affected layouts.

**5. The bare `/login` and `/register` pages could never succeed.** See `ADR-011` — neither form ever
sent `tenant_slug`, which the backend has required since multi-tenancy landed, so every submission
422'd. Both now redirect to `/discover`. `specs/frontend/overview.md`'s Phase 2 note and Routing Tree
updated accordingly (this was a behaviour change, not a pure bug fix, so the spec-first workflow
applies retroactively here — see `ADR-011` for the full record).

**Not a bug (ruled out during this sweep):** a "Failed to load tenants" toast on the platform-admin
console traced back to a flaw in the *test script*, not the app — a Playwright `browser.newPage()`
reused shared `localStorage` across two supposedly-independent test sessions, so a stale
lower-privileged token leaked into what was meant to be a fresh platform-admin session, and `GET
/tenants` correctly 403'd for it. Verified clean (200, real data, zero console errors) with an
isolated session and a validly-scoped `platform_admin` token.

### Fix — Cafeteria-admin sweep: cross-tenant category leak in menu/inventory, and a table-status crash (2026-07-08)

Found by exercising the `bracu` (academic/cafeteria-segment) admin's full admin surface end-to-end
against the live Docker stack (dashboard, menu, inventory, tables, users, settings, public-link,
analytics/reports, notifications) — not just reading code.

**1. Menu items could be linked to another tenant's category, and a bad `category_id` crashed with
a raw 500.** `POST /menu/items`, `PUT /menu/items/{item_id}`, and `PATCH /menu/items/{item_id}` only
relied on the DB's `menu_items_category_id_fkey` foreign key to guard `category_id`. That FK catches
a *nonexistent* `category_id` (as an unhandled `IntegrityError` → `500`, not a clean `400`) but
cannot catch a `category_id` that exists and just belongs to a *different* tenant — Postgres has no
way to know that's wrong for this endpoint. Confirmed exploitable: logged in as the `bracu`
tenant_admin, `POST /menu/items` with a `category_id` belonging to a different demo tenant returned
`201` and created a real cross-tenant-linked menu item. Fixed with a new
`_validate_category_id()` helper in `app/routers/menu.py` that checks the category exists, is
active, and belongs to the caller's effective tenant (the brand tenant for franchise outlets/brand
admins, same scoping `GET /menu/categories` already uses) before every create/update — `400
"category_id does not exist for this tenant"` otherwise. See `BR-MENU-1` in `specs/modules/menu.md`.

**2. Same class of bug in inventory items' `inv_category_id`.** `POST /inventory/items` and
`PUT /inventory/items/{item_id}` had the identical gap (FK is `ON DELETE SET NULL`, so a
cross-tenant `inv_category_id` would silently succeed). Fixed with the analogous
`_validate_inv_category_id()` helper in `app/routers/inventory.py`. See `INV-8` in
`specs/modules/inventory.md`.

**3. `PATCH /tables/{table_id}/status` with an invalid status string crashed with a raw 500.**
`TableUpdateStatus.status` (`app/schemas/table.py`) was typed as a bare `str`, so an invalid value
(e.g. `"banana_status"`) passed request validation and only got rejected by Postgres's
`tablestatus` enum column — as an unhandled `asyncpg.exceptions.InvalidTextRepresentationError` →
`500`. Retyped the field to the existing `TableStatus` enum (`app/models/table.py`) so FastAPI
rejects it with a clean `422` before it reaches the DB. No data corruption occurred pre-fix (the
failed transaction rolled back), but confirmed the crash via `docker logs scms_backend`. See
`BR-TABLE-1` in `specs/modules/tables.md`.

**4. Spec corrections (no code change) found along the way in `specs/modules/tables.md`:**
`PUT /tables/{table_id}`, `PATCH /tables/layout`, and `DELETE /tables/{table_id}` were all marked
"Phase 16 — Not yet implemented," but all three are fully implemented in
`app/routers/tables.py` (and `FloorPlanEditor.tsx` already calls all three) — stale documentation,
not a dead-endpoint bug. Also, `PATCH /tables/{table_id}/status` was documented as open to
`staff`/`cleaner`/`server` in addition to admin roles, but the router has only ever allowed
`ADMIN_ROLES` — also stale documentation, not a code bug: those roles have their own dedicated
flows for every status transition (`cleaner` via `PATCH /cleaners/logs/{id}/complete`, `occupied`
set automatically by `order_service` on order placement, `reserved` via the customer's own
`POST /tables/reserve`), so this raw endpoint is an admin-only manual override. Spec updated to
match actual code in both cases.

**Verified working correctly, no bug found:** users list/search/toggle, staff invite flow
(persists across refresh), RBAC (staff correctly 403's on `GET /users`), all 6 analytics endpoints
(dashboard/reports/analytics pages) match spec response shape exactly, settings round-trip
(brand_color, org profile, homemade/strict-inventory toggles correctly gated to `academic` tenant
type), category deletion correctly blocked by linked items, and BR-SEG-3 (cafeteria public-link is
read-only — guest-checkout toggle and QR-sheet download correctly hidden for cafeteria tenants,
backend `create_public_order` gate independently enforces it regardless of `guest_checkout_mode`).

- `backend/app/routers/menu.py` — new `_validate_category_id()`; called from `create_menu_item`,
  `update_menu_item` (PUT), `patch_menu_item` (PATCH)
- `backend/app/routers/inventory.py` — new `_validate_inv_category_id()`; called from
  `create_inventory_item`, `update_inventory_item`
- `backend/app/schemas/table.py` — `TableUpdateStatus.status` retyped `str` → `TableStatus` enum
- `specs/modules/menu.md` — new `BR-MENU-1`
- `specs/modules/inventory.md` — new `INV-8`
- `specs/modules/tables.md` — new `BR-TABLE-1`; corrected stale "Phase 16 — not yet implemented"
  markers and the `PATCH /status` role list to match actual code

### Fix — Two legacy test files never actually ran, plus a real order_id UUID bug they exposed (2026-07-08)

`backend/tests/test_auth.py` and `backend/tests/test_orders.py` each defined their own local
`db_session` fixture (predating multi-tenancy) instead of using the shared one in `conftest.py` —
neither received the Postgres-server-default-stripping fix conftest's fixture has, so their
`CREATE TABLE` DDL failed outright on SQLite (`uuid_generate_v4()`). Both also assumed a
pre-multitenant world: no `tenant_id`, a `UserRole.admin` value that no longer exists, and
register/login payloads missing the now-required `tenant_slug`. Rewrote both files against the
shared conftest fixtures and the current API contract.

Fixing `test_orders.py` surfaced a real, previously-undiscovered inconsistency in the application
code itself: `OrderService.update_status` correctly parses the path-string `order_id` into a real
`uuid.UUID` before querying (`Order.order_id` is a native UUID column), but `orders.py::get_order`,
`orders.py::cancel_order`, `orders.py::complete_meal`, and `OrderService.complete_meal` all
compared the raw string directly. This never surfaced against production Postgres/asyncpg (which
tolerates a plain string for a UUID column), but is a genuine type-correctness bug and broke
outright under the SQLite test harness every other test file in this suite already relies on.
Fixed by adding the same `uuid.UUID(str(order_id))` parse (404 on `ValueError`) at all four sites,
via a new shared `_parse_order_id()` helper in `orders.py` — matching the pattern
`update_status` already established.

- `backend/tests/test_auth.py` — rewritten against `conftest.py` fixtures + current auth contract
- `backend/tests/test_orders.py` — rewritten against `conftest.py` fixtures + current order contract;
  also fixed a `student_client`/`staff_client` fixture bug where both mutated the *same* shared
  `async_client.headers` dict, so whichever resolved last silently won for both roles
- `backend/app/routers/orders.py` — new `_parse_order_id()` helper; used in `get_order`,
  `cancel_order`, `complete_meal`
- `backend/app/services/order_service.py` — `complete_meal` now parses `order_id` before querying,
  and uses the already-loaded `order.order_id` (not the raw string) for the cleaner-assignment and
  reward-log calls

Full suite: 201 passing, only the single pre-existing flaky `test_otp.py::test_max_attempts_invalidates_code` remains (confirmed non-deterministic — passed on its own in the same session).

### Changed — Adopt real shadcn/ui for `components/ui/*` primitives (2026-07-08)

`components/ui/{button,card,input,label,switch,alert,alert-dialog,tooltip}.tsx` were previously
hand-rolled lookalikes (template-string classes, no Radix underneath). Reimplemented on real
shadcn/ui conventions — Radix UI primitives + `class-variance-authority` + `cn()` — gaining real
focus-trap/Escape/scroll-lock on `AlertDialog` and accessible keyboard/ARIA behavior on `Switch`/
`Tooltip`. See `specs/frontend/overview.md` (Tech Stack) for the full token/provider details.

- All exported component names/props kept identical to the previous versions **except `Tooltip`**,
  which now follows shadcn's `TooltipProvider`/`Tooltip`/`TooltipTrigger`/`TooltipContent` split.
- `frontend/src/lib/utils.ts` — new, `cn()` helper
- `frontend/components.json` — new, shadcn CLI config (for future `npx shadcn add <name>`)
- `frontend/tailwind.config.js`, `frontend/src/app/globals.css` — additive new semantic color
  tokens (`secondary`, `muted`, `destructive`, `border`, `input`, `ring`, `card`, `popover`);
  existing `primary`/`accent`/`background` tokens unchanged
- `frontend/src/app/layout.tsx` — mounts `TooltipProvider`
- `frontend/src/components/order/TableGrid.tsx` — updated to the new Tooltip trigger/content API
- `frontend/package.json` — added `class-variance-authority`, `tailwind-merge`,
  `@radix-ui/react-{slot,alert-dialog,switch,tooltip,label}`

**Follow-up (same day): real `shadcn` CLI run + missing-token fix.** The `shadcn` CLI was then run
directly against the repo, regenerating `button.tsx`/`label.tsx` to canonical upstream output and
adding ~20 unused-for-now primitives (`avatar`, `badge`, `dialog`, `dropdown-menu`, `select`, `tabs`,
`table`, etc. — see `specs/frontend/overview.md` for the full list). This surfaced a real bug: the
CLI-generated components reference `primary-foreground`/`accent-foreground` tokens that the initial
migration never added (it only covered `card`/`popover`/`secondary`/`muted`/`destructive`), which
would have rendered invisible/low-contrast text on default buttons, checked checkboxes, and selected
dropdown/select items. Fixed by adding `--primary-foreground`/`--accent-foreground` CSS variables and
restructuring `primary`/`accent` in `tailwind.config.js` into `{ DEFAULT, foreground }` objects
(backward-compatible with all existing `bg-primary`/`text-primary`/`primary/20`-style usages).

- `frontend/tailwind.config.js` — `primary`/`accent` restructured to `{ DEFAULT, foreground }`
- `frontend/src/app/globals.css` — added `--primary-foreground`, `--accent-foreground`
- `frontend/src/components/ui/{button,label}.tsx` — CLI-regenerated (functionally equivalent)
- `frontend/src/components/ui/{avatar,badge,breadcrumb,checkbox,command,dialog,dropdown-menu,empty,field,form,pagination,popover,progress,radio-group,scroll-area,select,separator,sheet,sonner,table,tabs,textarea}.tsx` — new, CLI-scaffolded, not yet imported anywhere
- `frontend/package.json` — added `@radix-ui/react-{avatar,checkbox,dialog,dropdown-menu,popover,progress,radio-group,scroll-area,select,separator,tabs}`, `cmdk`, `sonner`, `next-themes`

### Added — Platform Admin Control Plane (Phase 24, RFC-009, 2026-07-08)

Platform admin gains: an audit trail of every tenant mutation it performs, enforced subscription-tier
resource limits (outlets/menu items/staff), tenant impersonation for support, hard-delete + JSON
export for offboarding, and navigation links to the previously URL-only platform pages. See
`specs/decisions/rfcs/RFC-009-platform-admin-control-plane.md` and new `specs/modules/platform.md`.

- `backend/app/models/models.py` — new `PlatformAuditLog` model
- `backend/alembic/versions/0008_add_platform_audit_log.py` — new migration
- `backend/app/services/audit_service.py` — new, `record_audit()` + `AuditAction`
- `backend/app/core/tier_limits.py` — new, `TIER_LIMITS` + `check_tier_limit()`
- `backend/app/routers/platform.py` — new, audit-logs/analytics-overview/impersonate endpoints
- `backend/app/routers/tenants.py` — `DELETE /{id}` (hard delete), `GET /{id}/export`, audit-log
  calls on create/tier-change/activate/suspend, tier-limit check on outlet creation
- `backend/app/routers/menu.py` — tier-limit check on item creation
- `backend/app/routers/invitations.py` — tier-limit check on staff invite
- `backend/app/services/auth_service.py` — `create_access_token` gains optional `extra_claims`
- `backend/tests/test_platform_admin.py` — new
- `frontend/src/lib/auth.ts` — `JwtPayload.impersonation`
- `frontend/src/app/[tenant_slug]/(admin)/layout.tsx` — role-gated "Platform" nav section
- `frontend/src/app/(platform)/admin/audit-log/page.tsx` — new
- `frontend/src/app/(platform)/admin/tenants/page.tsx` — Impersonate/Export/Delete actions
- `frontend/src/app/(platform)/admin/analytics/page.tsx` — genuine platform-wide overview
- `frontend/src/components/platform/ImpersonationBanner.tsx` — new

### Added — Franchise self-service outlet provisioning (Phase 23, 2026-07-05)

A franchise brand's own admin (`super_admin`/`tenant_admin`) can now create and list their own
outlets directly (`GET`/`POST /tenants/{tenant_id}/outlets`), without a platform-admin
intermediary. Access is strictly scoped to the caller's own brand (`BR-FRAN-1`); platform-admin
access to any brand's outlets is unchanged. New frontend page `[tenant_slug]/(admin)/outlets`. See
RFC-008.

### Fix — Guest order vendor attribution disappeared after the first response (2026-07-05)

Found by actually running the app end-to-end in Docker (not just the test suite) against a
food-court tenant: `GET /public/orders/{guest_token}` (tracking) and `POST .../pay` returned
`vendor_id`/`vendor_name` as `null`, even though the create response had them populated correctly.

**Root cause:** `order_service.create_food_court_guest_order` set a transient Python attribute
(`order._vendor_name`) on the freshly-created ORM objects, and `public.py`'s response builder read
it back. That only worked within the same request — any later request (tracking, pay, the guest
WebSocket's re-fetch) queries fresh `Order` rows from the DB with no such attribute, silently
dropping vendor attribution.

**Fix:**
- **`app/routers/public.py`** — `_group_response()` is now `async` and takes `db`; it looks up each order's own tenant via `Tenant.tenant_id.in_(...)` and only attaches `vendor_id`/`vendor_name` when that tenant is actually a `food_court_vendor` — derived fresh every time, not cached on the object.
- **`app/services/order_service.py`** — Removed the now-dead `_vendor_name` transient attribute assignment in `create_food_court_guest_order`.

Also created **`backend/alembic.ini`** (was missing entirely — Alembic had never actually been
runnable in this project; `docker compose` only ever used `Base.metadata.create_all()` at startup,
which doesn't add columns to already-existing tables). Applied migrations `0006` and `0007` to the
running dev database via `alembic stamp 0005` + `alembic upgrade head` (non-destructive — preserves
existing seed/demo data).

### Phase 22 follow-up — Cafeteria-segment read-only public menu (2026-07-05)

RFC-007's Phase D listed "cafeteria-segment optional public menu (read-only)" as explicitly out of
MVP scope, alongside a real payment gateway and kiosk hardware integration. Unlike those two, this
one needed no external resource — just a rule relaxation — so it's now done. **This completes
RFC-007**; the only two remaining items are genuinely blocked on merchant credentials and physical
card-reader hardware, not on more engineering time.

#### Backend
- **`app/routers/tenants.py`** — Removed the restaurant-segment-only gate on `public_menu_enabled` in `PATCH /tenants/me/settings`. Any tenant may now enable a public menu.
- **`app/routers/public.py`** — `POST /{public_slug}/orders` now rejects with `400` when the resolved tenant's segment is not `restaurant` (BR-SEG-3) — menu/info stay segment-agnostic.
- **`app/schemas/public.py`** — `PublicTenantInfoResponse` gains `tenant_type` so the frontend can derive the segment without a second call.
- **`tests/test_public_surface.py`** — 2 new tests: cafeteria menu is browsable but ordering is 400; cafeteria admin can enable `public_menu_enabled`. 28 tests total, all passing.

#### Frontend
- **`types/index.ts`** — `PublicTenantInfoResponse` gains `tenant_type`.
- **`app/m/[public_slug]/page.tsx`** — Hides add-to-cart/checkout entirely when the tenant isn't restaurant-segment; header copy adapts ("Browse our menu — log in to your account to order").
- **`[tenant_slug]/(admin)/public-link/page.tsx`** — No longer gated to restaurant segment; shows segment-appropriate copy and hides the checkout-mode toggle / QR-sheet download for cafeteria tenants (browsing only, no tables to print QRs for in that flow).
- **`[tenant_slug]/(admin)/layout.tsx`** — "Public Link" nav item no longer restricted by tenant type.

#### Spec
- **`specs/system/segments.md`** — NEW BR-SEG-3 (cafeteria public menu is read-only); capability matrix updated.
- **`specs/modules/public-surface.md`** — Overview and order-create endpoint doc updated with the segment gate.
- **`specs/modules/tenants.md`**, **`specs/operations/roadmap.md`**, **`specs/decisions/rfcs/RFC-007-...md`** — Updated to reflect RFC-007 as fully implemented except the two externally-blocked items.

### Phase 22 follow-up — Food-court multi-vendor guest carts (2026-07-05)

RFC-007 §Phase D. A food court's vendors are separate tenants, so a guest cart spanning multiple
stalls needed to become multiple orders. After discussing the tradeoff with the user (single-vendor
checkout only vs. a true multi-vendor cart), implemented the latter: the cart is split into one
`Order` per vendor, all sharing one `guest_token` — a "guest session".

#### Backend
- **`app/models/order.py`** — `orders.guest_token` is no longer `UNIQUE` (indexed instead) — a guest session can span sibling orders across vendor tenants.
- **`alembic/versions/0007_food_court_guest_sessions.py`** — NEW migration: drops `uq_orders_guest_token`, adds `ix_orders_guest_token`.
- **`app/services/order_service.py`** — NEW `create_guest_order_session()` (dispatches single-vendor vs. food-court), `create_food_court_guest_order()` (derives each item's vendor server-side from `menu_items.tenant_id`, splits into per-vendor orders sharing one `guest_token`, one DB transaction), `get_guest_order_group()` (replaces `get_guest_order`, returns all sibling orders), `resolve_public_owner_tenant()` (recovers the food-court parent — or the tenant itself — via the shared table's `tenant_id`, since `public_slug`/`guest_checkout_mode` only ever live on the parent). `pay_guest_order_online()` now pays every non-cancelled sibling order in one call.
- **`app/routers/public.py`** — Menu endpoint now branches on `tenant_type=food_court` (unified multi-vendor menu, grouped by vendor); order-create/tracking/pay/QR endpoints all operate on the group and return the new `GuestOrderGroupResponse` shape (`{guest_token, total_amount, orders: [...]}`) — this is a breaking response-shape change from the prior single-order shape, updated consistently on both ends.
- **`app/schemas/public.py`** — NEW `PublicMenuItem` (adds `vendor_id`/`vendor_name`), `PublicFoodCourtVendor`, `GuestOrderGroupResponse`; `GuestOrderResponse` gains `vendor_id`/`vendor_name`.
- **`app/services/ws_pubsub.py`** — NEW `subscribe_and_forward_many()` — a guest WebSocket now subscribes to every sibling order's tenant channel at once (a food-court session spans multiple vendor channels).
- **`app/services/websocket_manager.py`** — `broadcast_to_tenant()` now matches purely on `target_guest_token` when present, bypassing the tenant_id filter — a guest connection isn't tenant-scoped the way staff connections are, since its sibling orders can belong to different tenants.
- **`app/routers/websocket.py`** — Guest WS endpoint resolves all sibling orders' tenant IDs and subscribes to all of them.
- **`tests/test_public_surface.py`** — Updated all guest create/tracking/pay assertions for the new group response shape; added 4 new food-court tests (unified menu grouping, cart splits into per-vendor orders with independent staff visibility, one online payment pays both vendor tickets, cross-food-court item injection rejected with 404) — 26 tests total, all passing.

#### Frontend
- **`types/index.ts`** — NEW `PublicFoodCourtVendor`, `PublicMenuItem`, `GuestOrderGroup`; `GuestOrder` gains `vendor_id`/`vendor_name`.
- **`app/m/[public_slug]/page.tsx`** — Vendor tabs (in addition to category tabs) when the menu response includes `vendors`; checkout always posts one flat cart regardless of vendor mix (the backend splits it); success screen lists one line per resulting ticket with its own vendor name and subtotal.
- **`app/m/[public_slug]/track/[guestToken]/page.tsx`** — Renders one "ticket" card per sibling order (own status timeline, own items) plus a shared grand total and live/reconnecting indicator — works identically for single-vendor and food-court sessions.

#### Spec
- **`specs/system/data-model.md`** — Documented the `guest_token` uniqueness relaxation.
- **`specs/modules/public-surface.md`** — NEW "Food Courts: Guest Sessions" section; rewrote the order-create/tracking/pay/QR endpoint docs around `GuestOrderGroupResponse`; PUB-6 redefined as a session capability; NEW PUB-8 (server-side vendor re-derivation); fixed the table-QR payload doc (no `outlet_slug` — was never actually implemented that way).
- **`specs/modules/payments.md`** — WAL-5 updated: online payment now pays the whole guest session, not one order.
- **`specs/decisions/rfcs/RFC-007-segment-split-guest-ordering.md`** — Added the design-fork decision to §3 Alternatives Considered and a new status update.
- **`specs/operations/roadmap.md`** — Phase 22 entry updated with the food-court work; removed "food-court multi-vendor guest cart" from the not-yet-implemented list.

### Phase 22 — Segment Split & Guest QR Ordering (2026-07-05)

RFC-007: derives a `cafeteria`/`restaurant` segment from existing `tenant_type` (no new column) and
adds a public, unauthenticated guest-QR ordering surface for restaurant-segment tenants with
pay-at-counter checkout. Spec landed first (see below), then backend + frontend implementation in
the same day.

#### Backend
- **`app/core/segments.py`** — NEW: `SEGMENT_MAP`, `get_segment()`, `is_restaurant_segment()`.
- **`app/models/order.py`** — `orders.user_id` now nullable; added `order_source` (`customer_app|staff_pos|guest_qr|kiosk`), `guest_token`, `guest_name`, `guest_phone`, `chk_order_identity` constraint; new `OrderStatus.pending_confirmation`.
- **`app/models/tenant.py`** — Added `public_menu_enabled`, `public_slug`, `guest_checkout_mode` (+ check constraint).
- **`alembic/versions/0006_add_guest_orders.py`** — NEW migration for the above.
- **`app/routers/auth.py`** — `POST /auth/register` returns `400` for restaurant-segment tenants (BR-SEG-1).
- **`app/routers/public.py`** — NEW `/api/v1/public` router: `GET /{public_slug}/menu` (price-only, Redis-cached 60s), `GET /{public_slug}/info`, `POST /{public_slug}/orders` (Redis rate limit 5/min/IP+table, per-table pending cap of 3), `GET /orders/{guest_token}` (`Cache-Control: no-store`, lazy 20-min auto-expiry).
- **`app/services/order_service.py`** — `create_guest_order()`, `create_staff_pos_order()`, `mark_paid_at_counter()`; `update_status()` now accepts `pending_confirmation → confirmed/cancelled` (staff confirmation gate).
- **`app/routers/orders.py`** — `POST /orders/staff-pos` (staff POS entry, attributed to the staff account, `status=confirmed` immediately); `PATCH /orders/{id}/mark-paid`.
- **`app/routers/websocket.py`**, **`app/services/websocket_manager.py`** — NEW `/ws/public/orders/{guest_token}` guest tracking channel; `broadcast_to_tenant` now also routes by `target_guest_token`.
- **`app/services/qr_service.py`**, **`app/routers/qr.py`** — Table QR now encodes `/m/{public_slug}?t={table_number}` when the tenant has public ordering enabled; NEW `GET /qr/table-sheet/pdf` (one page per table).
- **`app/services/pdf_service.py`** — NEW `generate_table_qr_sheet_pdf()`.
- **`app/schemas/public.py`** — NEW: `GuestOrderCreate/Response`, `PublicMenuResponse`, `PublicTenantInfoResponse`.
- **`app/schemas/order.py`**, **`app/schemas/tenant.py`** — `OrderResponse` gains `order_source`/`guest_name`/`guest_phone`/nullable `user_id`; `StaffPosOrderCreate`; `TenantSettingsUpdate`/`TenantResponse` gain the public-surface fields.

#### Frontend
- **`lib/segments.ts`** — NEW, mirrors backend segment derivation.
- **`app/page.tsx`**, **`app/discover/page.tsx`** — Segment landing cards → segment-filtered discovery.
- **`[tenant_slug]/(customer)/layout.tsx`**, **`(auth)/register/page.tsx`** — Redirect away for restaurant-segment tenants (BR-SEG-1).
- **`app/m/[public_slug]/page.tsx`** — NEW: public menu, cart, guest checkout, `?mode=kiosk` (90s idle-reset).
- **`app/m/[public_slug]/track/[guestToken]/page.tsx`** — NEW: guest order tracking (polling).
- **`[tenant_slug]/display/page.tsx`** — NEW: signage, auto-rotating categories.
- **`[tenant_slug]/(admin)/public-link/page.tsx`** — NEW: toggle public menu, edit slug, download table-QR PDF sheet.
- **`(staff)/pos/page.tsx`** (+ tenant-scoped re-export) — NEW: staff POS order entry.
- **`(staff)/orders/page.tsx`** — "Guest" badge, handles `pending_confirmation`.
- **`types/index.ts`** — `OrderStatus` gains `pending_confirmation`; new `GuestOrder*`/`PublicMenuResponse`/`PublicTenantInfoResponse` types; `Tenant` gains public-surface fields.

#### Tests
- **`tests/test_public_surface.py`** — NEW: 16 tests — guest lifecycle, price/inventory stripping, cross-tenant slug isolation, rate-limit rejection, per-table pending cap, staff confirmation gate, mark-paid (guest + staff POS + rejected for `customer_app`), table QR + PDF sheet, BR-SEG-1 both directions.

#### Repo hygiene
- **`.gitignore`** — Anchored the Python-template `lib/`/`lib64/` rules to the repo root (`/lib/`, `/lib64/`) — they were unintentionally matching `frontend/src/lib/`, so that entire directory had never been tracked by git.

#### Spec (canonical — `specs/`)
- **`specs/decisions/rfcs/RFC-007-segment-split-guest-ordering.md`** — Status: Draft → Implemented; checklist ticked.
- **`specs/system/segments.md`**, **`specs/modules/public-surface.md`**, **`specs/system/data-model.md`**, **`specs/modules/orders.md`**, **`specs/modules/payments.md`**, **`specs/modules/tenants.md`**, **`specs/modules/qr-pdf.md`**, **`specs/frontend/overview.md`**, **`specs/system/overview.md`** — All "❌ Not yet implemented" phase markers flipped to "✅ Implemented 2026-07-05".
- **`specs/operations/roadmap.md`** — Phase 22 marked done with the final file list.

**Not implemented yet (explicit follow-up, out of MVP per RFC-007):** online guest payment (`guest_checkout_mode='online'`); cafeteria-segment optional public menu; kiosk card-reader integration.

### Phase 22 follow-up — Success screen QR + live guest tracking via WS (2026-07-05)

Closed two gaps against the original Sprint 7.5 frontend spec ("success screen with tracking link +
on-screen QR", "guest tracking page (live via WS)") that the first implementation pass had left as
polling-only / redirect-without-a-screen.

#### Backend
- **`app/services/qr_service.py`** — NEW `generate_url_qr_bytes(url)`.
- **`app/routers/public.py`** — NEW `GET /public/orders/{guest_token}/qr` — base64 PNG of the guest's own tracking URL, resolved server-side from the order's tenant (no `public_slug` param needed from the client).
- **`tests/test_public_surface.py`** — 1 new test (404 for unknown token QR) + QR assertion added to the existing guest-lifecycle test — 17 tests total, all passing.

#### Frontend
- **`app/m/[public_slug]/page.tsx`** — Order placement now shows a success screen (checkmark, on-screen QR, "Track my order" / "Back to menu") instead of redirecting straight to the tracking page. Kiosk idle-reset also clears the success screen.
- **`app/m/[public_slug]/track/[guestToken]/page.tsx`** — Now opens a real WebSocket to `/ws/public/orders/{guest_token}` (auto-reconnect after 4s), re-fetching full order state on every message; a 20s poll remains as a safety net. Shows a "Live / Reconnecting…" indicator.

#### Spec
- **`specs/modules/public-surface.md`** — Documented the new QR endpoint and the WS-primary/poll-fallback tracking behaviour.
- **`specs/decisions/rfcs/RFC-007-segment-split-guest-ordering.md`** — Added the QR endpoint (and the staff-POS/mark-paid/QR-sheet endpoints from the prior pass, which had been implemented but not yet listed in the endpoint table) to §2.3.

### Phase 22 follow-up — BR-SEG-1 login gap + simulated online guest payment (2026-07-05)

Closed the last two known gaps in RFC-007: (1) the S1 hook only blocked *registration* on
restaurant-segment tenants, not login for a pre-existing customer account; (2) `guest_checkout_mode`
accepted `'counter'` only — `'online'` was rejected with a hardcoded `400` pending "Phase 2". Phase 2
starts now, implemented as a **simulated** payment (mirrors the existing authenticated
`PaymentMethod.simulation` — always succeeds, no real gateway call). A genuine SSLCOMMERZ/card
integration remains a separate future task requiring real merchant credentials.

#### Backend
- **`app/routers/auth.py`** — `POST /auth/login` now returns `403` for `customer`/`student` roles on restaurant-segment tenants (BR-SEG-1).
- **`app/routers/tenants.py`** — Removed the hardcoded `400` block on `guest_checkout_mode='online'`.
- **`app/services/order_service.py`** — NEW `pay_guest_order_online()` — sets `payment_status='paid'`, `payment_method='simulation'`; rejects if the tenant is still `counter`-only, already paid, or cancelled.
- **`app/routers/public.py`** — NEW `POST /public/orders/{guest_token}/pay`; publishes `ORDER_PAID` (`target_guest_token`).
- **`app/schemas/public.py`** — `GuestOrderResponse` gains `payment_status`/`payment_method`; `PublicTenantInfoResponse` gains `guest_checkout_mode` (so the guest menu page knows whether to offer online payment, without auth).
- **`tests/test_public_surface.py`** — 5 new tests: login blocked/allowed for restaurant segment, online payment success + double-pay rejection + rejected when counter-only, admin can toggle `guest_checkout_mode` — 22 tests total, all passing.
- **Regression fix:** the login-block change broke two pre-existing `test_tenant_isolation.py` tests that used the `beta` (restaurant-segment) tenant's *customer* account purely as a second-tenant fixture for tenant-scoping checks — switched them to the `beta` admin account (tenant-scoping is role-agnostic, so the check is equivalent).

#### Frontend
- **`app/m/[public_slug]/page.tsx`** — Success screen now shows a "Pay online now" button when the venue has `guest_checkout_mode='online'`, and reflects paid/pending state.
- **`app/m/[public_slug]/track/[guestToken]/page.tsx`** — Shows "(paid)" vs "(pay at counter)" on the total.
- **`[tenant_slug]/(admin)/public-link/page.tsx`** — NEW counter/online toggle, with a note that online is a simulated gateway for now.
- **`types/index.ts`** — `GuestOrder` gains `payment_status`/`payment_method`; `PublicTenantInfoResponse` gains `guest_checkout_mode`.

#### Spec
- **`specs/system/segments.md`** — BR-SEG-1 now documents the login-side block explicitly.
- **`specs/modules/payments.md`** — NEW WAL-5 (simulated online guest payment); WAL-4 tightened to the pay-at-counter path only.
- **`specs/modules/public-surface.md`** — Documented `POST /public/orders/{guest_token}/pay`.
- **`specs/modules/websocket.md`** — NEW `ORDER_PAID` event (12 event types total).
- **`specs/modules/tenants.md`**, **`specs/operations/roadmap.md`**, **`specs/decisions/rfcs/RFC-007-...md`** — Updated to reflect `guest_checkout_mode='online'` as implemented (simulated), not rejected.

**Still not implemented (explicit, out of scope for this thesis):** a real payment-gateway integration; cafeteria-segment optional public menu; kiosk card-reader integration; food-court multi-vendor guest cart.

### Fix — Admin "Manage Users" page was calling nonexistent backend endpoints (2026-07-02)

Found during a documentation-vs-code verification pass: the admin "Users" sidebar page called `GET /users` and `PATCH /users/{id}/toggle`, but no backend router registered either route — every admin got a silent "Unable to load users" failure. The "Invite Staff" page (which did work) also had no link from anywhere in the admin UI, and its sent-invitations list was tracked only in frontend session state, so it reset on every page refresh.

#### Backend
- **`routers/users.py`** — NEW: `GET /api/v1/users` (list users scoped to caller's tenant, admin roles only) and `PATCH /api/v1/users/{user_id}/toggle` (flip `is_active`; 404 if user belongs to a different tenant; 400 if an admin tries to toggle their own account).
- **`routers/invitations.py`** — Added `GET /api/v1/users/invite` (list invitations sent for the caller's tenant, admin roles only) so sent invitations persist instead of living only in frontend session state.
- **`main.py`** — Registered the new `users` router.

#### Frontend
- **`(admin)/users/page.tsx`** — `RoleBadge` and the role-filter dropdown now cover the full current `UserRole` set (previously only recognized the legacy `student | staff | cleaner | admin` roles). Added an "Invite Staff" header button linking to `users/invite` (only rendered when a `tenant_slug` route param is present).
- **`[tenant_slug]/(admin)/users/invite/page.tsx`** — Sent-invitations table now loads from `GET /users/invite` on mount and after every send/resend, instead of only holding invites sent during the current session. Added a "← Back to Users" link.

#### Tests
- **`tests/test_users_admin.py`** — NEW: 7 tests — tenant-scoped listing, customer role forbidden (403), toggle flips `is_active`, self-toggle blocked (400), cross-tenant toggle returns 404 (not leaked), invite list persists and is tenant-scoped.

#### Spec (canonical — `specs/`)
- **`specs/modules/users.md`** — Rewrote to match the actual implementation: single `PATCH /{user_id}/toggle` (not separate activate/deactivate routes), documented `GET /users`, documented `GET /users/invite`, corrected the invitable-roles list to include `outlet_admin`.
- **`specs/frontend/overview.md`** — Added `users/page.tsx` and `users/invite/page.tsx` to the routing tree with the fix notes.

### RFC-006 — Public Organization Registration / Tenant Onboarding (2026-07-01)

#### Backend
- **`POST /api/v1/tenants/register`** — NEW public endpoint: creates a new organization (tenant) and its first admin user in one atomic transaction, then returns a `Token` (auto-login). Enforces BR-ORG-1..7: self-serve tenant types only (`independent_restaurant`, `corporate`, `academic`, `franchise_brand`, `food_court`), unique slug, password complexity, `food_court` → first admin is `food_court_admin` else `tenant_admin`, new tenant defaults (`free` tier, active, no parent).
- **`schemas/tenant.py`** — Added `OrgRegisterDetails`, `OrgRegisterAdmin`, `TenantRegister`, and the `SELF_SERVE_TENANT_TYPES` constant.

#### Frontend
- **`register-organization/page.tsx`** — NEW: 3-step onboarding wizard (choose category → organisation details → admin account). Auto-suggests a URL slug from the org name; auto-logs-in on success and redirects to `/{slug}/dashboard`.
- **`components/auth/OrgCategorySelector.tsx`** — NEW: radio grid of the 5 self-serve tenant types with generic labels + descriptions (from `lib/tenantTypes.ts`).
- **`page.tsx`, `[tenant_slug]/(auth)/register/page.tsx`** — Added "Register your organisation" entry links.

#### Tests
- **`tests/test_org_registration.py`** — NEW: 8 tests covering all BR-ORG rules and end-to-end login.
- **`tests/conftest.py`** — Added a `@compiles(UUID, "sqlite")` hook and `_strip_pg_only_server_defaults()` so the PostgreSQL-typed models can be created on the in-memory SQLite test DB (previously broke the entire suite in the Python 3.11 Docker image).

#### Spec (canonical — `specs/`)
- **`specs/decisions/rfcs/RFC-006-organization-registration.md`** — NEW design doc (Status: Implemented).
- **`specs/modules/tenants.md`** — Documented `POST /tenants/register` endpoint, the `TenantRegister` / `OrgRegisterDetails` / `OrgRegisterAdmin` schemas, and business rules BR-ORG-1..7.
- **`specs/modules/auth.md`** — Added a note distinguishing org registration (`POST /tenants/register`) from user registration (`POST /auth/register`).
- **`specs/frontend/workflows.md`** — Added WF-10 Organization Registration.
- **`specs/frontend/overview.md`** — Added `register-organization/` to the routing tree.
- **`specs/operations/testing.md`** — Documented `test_org_registration.py` + the SQLite/UUID conftest note.

### Phase 17 — Admin Analytics Dashboard (2026-07-01)

#### Frontend
- **`(admin)/analytics/page.tsx`** — NEW: Full analytics dashboard with period selector (Today / This Week / This Month). Fetches summary, hourly heatmap, top-items, revenue trend, outlet comparison, and inventory value in parallel using `Promise.allSettled`. Outlet comparison row is hidden unless role is `super_admin` or `platform_admin`.
- **`components/admin/HourlyHeatmap.tsx`** — NEW: 24-column bar strip (hour 0–23). Sparse API data is expanded to all 24 hours with 0-fill. Color scale: gray → amber → orange → rose. Tooltip on hover.
- **`components/admin/TopItemsChart.tsx`** — NEW: Horizontal `recharts` BarChart of top 10 items by quantity. Bar color uses `--color-primary` CSS variable. Custom tooltip shows quantity + revenue.
- **`components/admin/OutletComparisonTable.tsx`** — NEW: Sortable table (Outlet / Orders / Revenue / Customers) with totals row. Defaults to revenue descending. Only rendered for `super_admin`.
- **`(admin)/layout.tsx`** — Renamed "Analytics" nav item (was pointing to `/reports`) → now points to `/analytics`. Old reports page moved to "Reports" nav item with `Download` icon.
- **`(admin)/dashboard/page.tsx`** — Added "View full analytics →" `Link` in Sales Trend card header.

#### Spec
- **`specs/modules/analytics.md`** — Documented period selector mapping, role-adaptive widget table.
- **`specs/frontend/overview.md`** — Added `analytics/page.tsx` to routing tree.

### Phase 16 — Admin Tables Page + Floor Plan Editor (2026-07-01)

#### Backend
- **`POST /api/v1/tables/`** — Create a new table (was missing from router despite being in spec).
- **`PUT /api/v1/tables/{table_id}`** — Full metadata update (table_number, zone, capacity, position_x/y). Validates position bounds (TR-2) via Pydantic `Field(ge=0, le=11/7)`.
- **`PATCH /api/v1/tables/layout`** — Batch layout save: validates cross-tenant ownership (403), duplicate `(position_x, position_y)` in batch (TR-3, 400), updates all rows in a single transaction.
- **`DELETE /api/v1/tables/{table_id}`** — Delete table with TR-1 guard: rejects with 400 if any order with status in `(pending, confirmed, preparing, ready)` references the table.
- **`schemas/table.py`** — Added `TableCreate`, `TableUpdate`, `TableLayoutItem`, `TableLayoutBatch`.
- **`config/email.py`** — Made `ConnectionConfig` lazy-initialized to fix module-load failure when `MAIL_FROM` is a `.local` domain in test environments.

#### Frontend
- **`(admin)/tables/page.tsx`** — NEW: Tables management page with `live` / `editor` toggle. Live mode shows zone-filtered color-coded table grid with click-to-detail; editor mode shows `FloorPlanEditor`.
- **`components/admin/FloorPlanEditor.tsx`** — NEW: 12×8 CSS grid with `@dnd-kit` drag-and-drop. Draggable table cards snap to grid cells. Per-table popover for inline edit (table_number, zone, capacity) and delete with confirmation. "+ Add Table" creates a table at the first empty cell.
- **`components/admin/TableDetailPanel.tsx`** — NEW: Slide-over panel showing table status (with dropdown to change), details (zone, capacity, position), and actions (Assign Cleaner, Edit in Layout).
- **`components/admin/ZoneFilter.tsx`** — NEW: Horizontal scrollable tab strip for zone filtering.
- **`hooks/useTableLayout.ts`** — NEW: State hook managing position/meta edits, dirty tracking, save (`PATCH /tables/layout`), and reset.
- **`(admin)/layout.tsx`** — Added "Tables" nav item with `Table2` icon (between Orders and Inventory).
- **`frontend/package.json`** — Added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

#### WebSocket
- Live mode reacts to `TABLE_UPDATE` events from the WebSocket store to update table status in real-time without polling.

#### Tests
- **`tests/test_tables_admin.py`** — NEW: 9 tests covering all new endpoints and business rules (TR-1, TR-2, TR-3, cross-tenant isolation).

### Phase 15 — Admin Settings + Tenant Customization (2026-06-30)

#### Backend
- **`GET /api/v1/tenants/me`** — Returns the full tenant record for the calling admin's own organisation (`tenant_admin`, `outlet_admin`, `food_court_admin`).
- **`PATCH /api/v1/tenants/me/settings`** — Self-service settings update: name, logo_url, brand_color, address, city, phone, contact_email, allowed_email_domain, homemade_enabled, inventory_strict_mode. Invalidates Redis public cache on save.
- **`POST /api/v1/tenants/me/logo`** — Multipart logo upload (PNG/JPEG/WebP, max 2 MB). Saves to `/media/logos/{tenant_id}.{ext}` and updates `logo_url`.
- **New schema** — `TenantSettingsUpdate` in `schemas/tenant.py`.
- **`main.py`** — Creates `logos/` dir alongside `qr_codes/` at startup.

#### Frontend — Brand Color System
- **`globals.css`** — Added `--color-primary: #1A4D2E` to `:root` as the default CSS variable.
- **`tailwind.config.js`** — `primary` color changed from hardcoded `#1A4D2E` to `var(--color-primary)`. All `bg-primary`, `text-primary`, `border-primary` Tailwind classes now pick up the tenant's brand color at runtime.
- **`[tenant_slug]/layout.tsx`** — Sets `--color-primary` on `document.documentElement` from Zustand `brandColor` on every slug navigation. Restores default on unmount.

#### Frontend — Admin UI
- **`(admin)/settings/page.tsx`** — NEW: 4-tab settings page (Organisation, Branding, Access Control, Operations).
- **`(admin)/memo/page.tsx`** — NEW: Memo generator UI with all `MemoRequest` fields; downloads PDF from `POST /memo/generate`.
- **`(admin)/layout.tsx`** — Added Settings and Memo nav items; replaced hardcoded `#1A4D2E` with `bg-primary`/`text-primary`.

#### Frontend — Staff UI
- **`(staff)/menu/page.tsx`** — NEW: Staff item availability toggle page. Lists all items split into Available/Unavailable sections; one-tap toggle calls `PATCH /menu/items/{id}/toggle`.
- **`(staff)/layout.tsx`** — Added Menu nav link.

#### New Components
- `components/admin/BrandColorPicker.tsx` — Preset swatches + hex input + live preview.
- `components/admin/LogoUploader.tsx` — Drag-to-upload with preview; calls `POST /tenants/me/logo`.
- `components/admin/DomainRestrictionInput.tsx` — Enable/disable toggle + `@domain` text input.
- `components/admin/OperationsToggle.tsx` — Labelled boolean switch with consequence warning.

#### Tests
- `backend/tests/test_tenant_settings.py` — 10 test cases: GET /me, PATCH settings (name, color, ops flags, slug immutability), role guard, logo invalid type, logo too large.

---

### Phase 14 — Tenant Discovery & Registration Redesign (2026-06-30)

#### Backend
- **`GET /api/v1/tenants/public`** — New public endpoint (no auth). Returns all active tenants with name, slug, type, logo, city, brand color. Supports `?q=` search by name/city. Redis-cached 5 min.
- **`GET /api/v1/tenants/public/{slug}`** — New public endpoint. Returns `TenantPublicDetailResponse` including `allowed_email_domain` (needed for registration domain validation).
- **BR-REG-1** — `POST /auth/register` now blocks staff, cleaner, outlet_admin, tenant_admin, platform_admin, food_court_admin from self-registration. Returns `400 "This role requires an admin invitation."`.
- **New schemas** — `TenantPublicResponse`, `TenantPublicDetailResponse`, `TenantPublicListResponse` added to `schemas/tenant.py`.

#### Frontend
- **`/discover`** — New tenant discovery page with search bar and `TenantCard` grid.
- **Register page** — Full redesign: 3-step flow (profile type → details → OTP verification).
  - **Bug fix:** OTP send purpose was `'verification'` — corrected to `'email_verification'`.
  - **Bug fix:** OTP verify body sent `code` field — corrected to `otp_code`.
  - **Bug fix:** `tenant_slug` was missing from OTP send/verify requests.
  - **Bug fix:** Role dropdown offered staff/cleaner (BR-REG-1 violation) — replaced with `ProfileTypeSelector`.
- **Root `/` page** — Now shows landing page with links to discover and previously-visited tenant, instead of hardcoded bracu redirect.
- **New components** — `TenantWelcomeBanner`, `ProfileTypeSelector`, `TenantCard`.
- **New hook** — `useTenantInfo(slug)` — fetches and caches public tenant detail.

#### Tests
- `backend/tests/test_tenants_public.py` — 8 test cases covering public list, search, detail, inactive exclusion, no-auth access, missing slug.
- `backend/tests/test_auth.py` — 8 new test cases: 6 parametrized BR-REG-1 blocked roles + student/customer allowed.

---

### Documentation (2026-06-30 — Spec cross-verification and completion)
- Fully cross-verified all spec files against actual codebase (models, routers, middleware, schemas, frontend)
- Applied 70+ corrections across 10 spec files (wrong event names, wrong Redis keys, wrong auth flows, wrong WS URL, wrong enum counts, wrong field names/types/lengths)
- **`04-api-reference.md`** — Complete rewrite: every endpoint accurately specced with exact request schemas, response schemas, correct status codes, and current backend behaviour (not aspirational)
- **`06-business-rules.md`** — Fixed INV-1/5/6 movement type names; fixed OTP-3 purpose string; added reward points rules (RWD-1 through RWD-4); added stock movement types reference table
- **`08-workflows.md`** — Fixed WF-2 login flow (backend returns Token immediately; 2FA is frontend-only); fixed WF-1 OTP purpose (`email_verification`); fixed WF-4/5 event names; fixed cleaner endpoint paths
- **`10-testing.md`** — Fixed blacklist key format (`blacklist:jti:`), event names (`LOW_STOCK`, `CLEAN_ASSIGNED`), OTP key format, movement type name
- **`docs/spec/12-schemas.md`** — Created: all 11 Pydantic schema modules documented with exact field names, types, required/optional, validators, and constraints
- **`docs/spec/13-security.md`** — Created: JWT claims, token blacklist, BCRYPT password hashing, rate limiting (slowapi), CORS policy, tenant isolation layers, RBAC groups, input validation, WebSocket security, secrets management
- **`docs/README.md`** and **`docs/SPEC_FIRST.md`** — Updated navigation, file ownership map, and quick reference for new spec files 12 and 13

*Changes that are spec'd (RFC accepted) but not yet implemented.*

### Planned (Phase 14)
- Add `GET /tenants/public` and `GET /tenants/public/{slug}` endpoints (RFC-001)
- Add tenant discovery page at `/discover`
- Redesign registration page with profile type selector and tenant banner (RFC-001)

### Planned (Phase 15)
- Add `PATCH /tenants/me/settings` endpoint (RFC-002)
- Add `POST /tenants/me/logo` endpoint (RFC-002)
- Add admin settings page with branding and operations tabs (RFC-002)
- Inject brand_color as CSS custom property in tenant layout

### Planned (Phase 16)
- Add `PUT /tables/{table_id}`, `PATCH /tables/layout`, `DELETE /tables/{table_id}` (RFC-003)
- Add admin tables page with live status view and floor plan editor (RFC-003)

### Planned (Phase 17)
- Add admin analytics page with hourly heatmap, top items chart, revenue trends

### Planned (Phase 18)
- Add admin menu management page (category CRUD, item CRUD, image upload)

### Planned (Phase 19)
- Add `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password`, `POST /auth/refresh`, `PATCH /auth/me` (RFC-004)
- Add forgot-password page with 3-step OTP flow (RFC-004)
- Add profile editing and password change on profile page (RFC-004)

### Planned (Phase 20)
- Add food court frontend: dashboard, unified menu, tables, delivery queue, analytics, settlements (RFC-005)

### Planned (Phase 21)
- Add staff invitation system with `POST /users/invite` and `POST /users/accept-invite`
- Add notification inbox with `GET /notifications`
- Add platform admin subscription and analytics pages

---

## [3.1.0] — 2026-06-30

### Added (Phase 13 — Food Court)
- `backend/app/routers/food_court.py` — 10 endpoints at `/api/v1/food-court/`:
  `GET /vendors`, `GET /menu`, `GET /tables`, `POST /tables`, `PATCH /tables/{id}/status`,
  `GET /orders/active`, `PATCH /orders/{id}/deliver`, `GET /staff`, `GET /analytics`, `GET /settlements`
- `backend/app/core/dependencies.py` — `accessible_tenant_ids()` for food court family scope
- `backend/tests/test_food_court_isolation.py` — 10 isolation tests
- `backend/scripts/seed_demo.py` — extended with food court tenants and 4 demo users

### Added (Phase 12 — Deployment)
- `docker-compose.prod.yml` — production compose with postgres, redis, pgAdmin, backend (4 workers), frontend
- `.env.example` — extended with `POSTGRES_PASSWORD`, `DEBUG`, `SERVER_HOST`, `PGADMIN_EMAIL/PASSWORD`
- `backend/scripts/seed_demo.py` — 11 demo users across 7 tenants (Section 23.3 credentials)

### Added (Phase 11 — Testing)
- `backend/pytest.ini` — asyncio_mode=auto
- `backend/tests/conftest.py` — FakeAsyncRedis, SQLite in-memory fixtures, async_client, get_token helper
- `backend/tests/test_tenant_isolation.py` — 7 tests
- `backend/tests/test_inventory.py` — 10 tests
- `backend/tests/test_otp.py` — 9 tests
- `backend/tests/test_redis.py` — 12 tests
- `requirements.txt` — added aiosqlite, pytest-cov

### Added (Phase 10 — Frontend Auth & Order UX)
- `src/components/auth/OtpInput.tsx` — 6-digit OTP input with auto-advance and resend
- `src/components/order/OrderQrCode.tsx` — fetches and renders order QR
- `src/components/order/ReceiptButton.tsx` — PDF blob download
- `src/app/[tenant_slug]/(auth)/register/page.tsx` — 2-step register + OTP verify
- `src/app/[tenant_slug]/(auth)/login/page.tsx` — login with admin 2FA step
- Order tracking page with QR and receipt

### Added (Phase 9 — Frontend Architecture)
- `src/lib/api.ts` — axios client with JWT + slug headers
- `src/lib/auth.ts` — JWT utilities (getRoleFromToken, isTokenExpired)
- `src/types/index.ts` — full TypeScript type definitions
- `src/store/useStore.ts` — Zustand store with auth + cart + tenant context
- `src/app/[tenant_slug]/` — full routing tree: auth, customer, staff, cleaner, admin
- `src/app/[tenant_slug]/(admin)/inventory/` — full inventory management pages
- `src/app/(platform)/admin/tenants/page.tsx` — platform admin tenant CRUD

### Added (Phases 1–8 — Backend Core)
- FastAPI application with all 15 routers
- PostgreSQL + SQLAlchemy 2.0 async models (9 tables)
- Redis integration (OTP, JWT blacklist, locks, cache)
- Authentication: JWT, OTP, 2FA for admin roles
- Alembic migrations
- PDF generation (reportlab 4.1.0) for receipts and memos
- QR code generation (qrcode[pil])
- WebSocket real-time events (8 event types)
- Analytics endpoints (6 endpoints)
- Inventory management with strict mode and low-stock alerts

---

## [3.0.0] — 2026-03-01 (Estimated)

Initial thesis project setup. Multi-tenant architecture designed. Tech stack selected.

---

*For older history, see the original SCMS_Master_Documentation_v3.md.*

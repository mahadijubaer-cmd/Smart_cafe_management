# Changelog

All notable changes to the SCMS project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

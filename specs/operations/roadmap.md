# Roadmap

**Last updated:** 2026-06-30  
**Status:** Authoritative — update this file before starting any phase

---

## Completed Phases (1–14)

| Phase | Deliverable | Status |
|---|---|---|
| 1–8 | Core backend: models, routers, auth, menu, orders, tables, inventory, payments, OTP, QR, PDF, WebSocket, analytics | ✅ Done |
| 9 | Frontend routing tree, Zustand store, API client, inventory pages, platform admin | ✅ Done |
| 10 | OTP input component, order QR code, receipt button, register/login flows with 2FA | ✅ Done |
| 11 | Test suite — tenant isolation, inventory, OTP, Redis (38 tests total) | ✅ Done |
| 12 | Production Docker Compose, .env.example, seed_demo.py | ✅ Done |
| 13 | Food court router (10 endpoints), food court isolation tests (10 tests), seed food court tenants | ✅ Done |
| 14 | Tenant discovery page, public tenant endpoints, registration redesign (4-step, OTP bug fixes, BR-REG-1) | ✅ Done |
| 15 | Admin settings page (4 tabs), brand color CSS var system, memo UI, staff menu toggle, logo upload | ✅ Done |

---

## Identified Gaps

### Missing Backend Endpoints

| Endpoint | Phase | RFC | Status |
|---|---|---|---|
| `GET /tenants/public` | 14 | RFC-001 | ✅ Done |
| `GET /tenants/public/{slug}` | 14 | RFC-001 | ✅ Done |
| `POST /auth/forgot-password` | 19 | RFC-004 | — |
| `POST /auth/reset-password` | 19 | RFC-004 | — |
| `POST /auth/change-password` | 19 | RFC-004 | — |
| `POST /auth/refresh` | 19 | RFC-004 | — |
| `PATCH /auth/me` | 19 | RFC-004 | — |
| `GET /tenants/me` | 15 | RFC-002 | ✅ Done |
| `PATCH /tenants/me/settings` | 15 | RFC-002 | ✅ Done |
| `POST /tenants/me/logo` | 15 | RFC-002 | ✅ Done |
| `PATCH /tables/layout` | 16 | RFC-003 | — |
| `PUT /tables/{table_id}` | 16 | RFC-003 | — |
| `DELETE /tables/{table_id}` | 16 | RFC-003 | — |
| `GET /notifications` | 21 | — | — |
| `PATCH /notifications/{id}/read` | 21 | — | — |
| `POST /users/invite` | 21 | — | — |
| `POST /users/accept-invite` | 21 | — | — |

### Missing Frontend Pages

| Page | Path | Phase | Status |
|---|---|---|---|
| Tenant discovery | `/discover` | 14 | ✅ Done |
| Password reset | `/[slug]/(auth)/forgot-password` | 19 | — |
| Admin tables + floor plan | `/[slug]/(admin)/tables` | 16 | — |
| Admin analytics | `/[slug]/(admin)/analytics` | 17 | — |
| Admin menu management | `/[slug]/(admin)/menu` | 18 | — |
| Admin settings | `/[slug]/(admin)/settings` | 15 | ✅ Done |
| Admin memo | `/[slug]/(admin)/memo` | 15 | ✅ Done |
| Staff menu view | `/[slug]/(staff)/menu` | 15 | ✅ Done |
| Food court dashboard | `/[slug]/(food-court)/dashboard` | 20 | — |
| Food court unified menu | `/[slug]/(food-court)/menu` | 20 | — |
| Food court delivery queue | `/[slug]/(food-court)/deliver` | 20 | — |
| Food court analytics | `/[slug]/(food-court)/analytics` | 20 | — |
| Platform subscriptions | `/(platform)/admin/subscriptions` | 21 | — |
| Platform analytics | `/(platform)/admin/analytics` | 21 | — |

### UX Issues in Existing Pages

| Issue | File | Phase | Status |
|---|---|---|---|
| Root `/` hardcodes redirect to `/bracu/login` | `src/app/page.tsx` | 14 | ✅ Fixed |
| Register page has no org name/logo context | `src/app/[tenant_slug]/(auth)/register/page.tsx` | 14 | ✅ Fixed |
| Register role dropdown allows staff/cleaner | Same | 14 | ✅ Fixed |
| Profile page is view-only (no edit/password change) | `src/app/[tenant_slug]/(customer)/profile/page.tsx` | 19 | — |
| No tenant brand color applied to UI | `src/app/[tenant_slug]/layout.tsx` | 15 | ✅ Fixed |
| Admin dashboard does not adapt to tenant type | `src/app/[tenant_slug]/(admin)/dashboard/page.tsx` | 17 | — |

---

## Phase Workplan (14–21)

### Phase 14 — Tenant Discovery + Registration Redesign ✅ Done
**RFC:** [RFC-001](../decisions/rfcs/RFC-001-tenant-discovery.md)  
**Completed:** 2026-06-30

---

### Phase 15 — Admin Settings + Tenant Customization ✅ Done
**RFC:** [RFC-002](../decisions/rfcs/RFC-002-admin-settings.md)  
**Completed:** 2026-06-30

---

### Phase 16 — Admin Tables + Floor Plan Editor
**RFC:** [RFC-003](../decisions/rfcs/RFC-003-floor-plan-editor.md)  
**Priority:** P1  

Backend:
- `PUT /tables/{table_id}`
- `PATCH /tables/layout`
- `DELETE /tables/{table_id}`

Frontend:
- `/[slug]/(admin)/tables/page.tsx` — two modes: live status view + layout editor
- `FloorPlanEditor` — 12×8 drag-and-drop canvas using @dnd-kit
- `TableDetailPanel` — slide-over with table info + cleaner assignment

---

### Phase 17 — Admin Analytics Dashboard
**Priority:** P1  

Frontend:
- `/[slug]/(admin)/analytics/page.tsx`
- Period selector: today / week / month
- `HourlyHeatmap`, `TopItemsChart` components
- Adapt admin dashboard widgets per tenant_type

---

### Phase 18 — Admin Menu Management
**Priority:** P1  

Frontend:
- `/[slug]/(admin)/menu/page.tsx`
- `MenuItemForm` — add/edit with image upload
- `CategoryManager` — inline CRUD for categories

---

### Phase 19 — Password Reset + Profile Edit
**RFC:** [RFC-004](../decisions/rfcs/RFC-004-password-reset.md)  
**Priority:** P1  

Backend:
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `POST /auth/refresh`
- `PATCH /auth/me`

Frontend:
- `/[slug]/(auth)/forgot-password/page.tsx` — 3-step reset
- Edit profile functionality on `/[slug]/(customer)/profile/page.tsx`

---

### Phase 20 — Food Court Frontend
**RFC:** [RFC-005](../decisions/rfcs/RFC-005-food-court-frontend.md)  
**Priority:** P2  

Frontend:
- `/[slug]/(food-court)/layout.tsx` — guard for food_court tenant type
- `/[slug]/(food-court)/dashboard/page.tsx`
- `/[slug]/(food-court)/menu/page.tsx`
- `/[slug]/(food-court)/deliver/page.tsx`
- `/[slug]/(food-court)/analytics/page.tsx`

---

### Phase 21 — Notifications + Staff Invitation + Platform Admin
**Priority:** P2  

Backend:
- `GET /notifications`, `PATCH /notifications/{id}/read`
- `POST /users/invite`, `POST /users/accept-invite`

Frontend:
- Notification bell in navbar
- `/[slug]/notifications/page.tsx`
- `/[slug]/(admin)/users/invite/page.tsx`
- `/(platform)/admin/subscriptions/page.tsx`
- `/(platform)/admin/analytics/page.tsx`

New DB migration:
- `staff_invitations` table (see `specs/system/data-model.md` → Section 4)

---

### Phase 22 — Segment Split & Guest QR Ordering (Public Surface)
**RFC:** [RFC-007](../decisions/rfcs/RFC-007-segment-split-guest-ordering.md)
**Priority:** P1
**Status:** ✅ Implemented (2026-07-05) — backend + frontend + simulated online guest payment (Phase 2, simulated gateway)

Backend (done):
- `app/core/segments.py` — `SEGMENT_MAP`, `get_segment()`, `is_restaurant_segment()` — no new DB column
- Alembic migration `0006_add_guest_orders.py`: nullable `orders.user_id`, `order_source`, `guest_token`,
  `guest_name`, `guest_phone`, `chk_order_identity`; `tenants.public_menu_enabled`,
  `tenants.public_slug`, `tenants.guest_checkout_mode`; new `pending_confirmation` order status
- `POST /auth/register` blocks restaurant-segment tenants (BR-SEG-1)
- `/api/v1/public` router (`app/routers/public.py`): menu (price-only, Redis-cached), info, guest
  order create, guest order tracking (no JWT) — Redis rate limiting (5/min/IP+table), per-table
  pending-order cap (3), 20-min auto-expiry (checked lazily on tracking/status reads)
- Staff confirmation gate: `pending_confirmation → confirmed/cancelled` added to the order status
  machine (`order_service.update_status`)
- Guest WebSocket channel `/ws/public/orders/{guest_token}` (`ConnectionManager` now also routes by
  `target_guest_token`)
- Outlet-scoped table QR payload (`qr_service.generate_table_qr_bytes`) + `GET /qr/table-sheet/pdf`
  admin endpoint (one page per table)
- `PATCH /orders/{id}/mark-paid` — pay-at-counter for any non-`customer_app` order (WAL-4)
- `POST /orders/staff-pos` — staff POS entry, attributed to the staff account, `status=confirmed`
  immediately (skips the guest confirmation gate), pay-at-counter
- `GET /public/orders/{guest_token}/qr` — success-screen tracking-link QR
- `POST /public/orders/{guest_token}/pay` — simulated online guest payment (WAL-5), opt-in via
  `guest_checkout_mode='online'`; publishes `ORDER_PAID`
- `POST /auth/login` also blocks `customer`/`student` roles on restaurant-segment tenants (BR-SEG-1
  login-side gap, closed after the initial pass only covered registration)
- **Food-court multi-vendor guest carts** (RFC-007 §Phase D): `orders.guest_token` unique constraint
  relaxed to a plain index (migration `0007_food_court_guest_sessions.py`) — a food-court guest cart
  spanning multiple vendors splits into one order per vendor, all sharing one `guest_token` (a
  "guest session"). `order_service.create_food_court_guest_order`, `create_guest_order_session`,
  `get_guest_order_group`, `resolve_public_owner_tenant`. Public menu/order/tracking/pay/QR endpoints
  and the guest WebSocket (`subscribe_and_forward_many`, `ConnectionManager.broadcast_to_tenant`
  guest_token-based routing) all became session/group-aware. See `modules/public-surface.md`
  "Food Courts: Guest Sessions".
- Tests: `backend/tests/test_public_surface.py` — 26 tests, all passing

Frontend (done):
- `/` segment landing page (Cafeteria / Restaurant cards) → `/discover?segment=`
- `lib/segments.ts`; `[tenant_slug]/(customer)/layout.tsx` and `(auth)/register/page.tsx` redirect
  away for restaurant-segment tenants (BR-SEG-1)
- `/m/[public_slug]/page.tsx` — public menu, cart, guest checkout; `?mode=kiosk` (idle-reset 90s)
- `/m/[public_slug]/track/[guestToken]/page.tsx` — guest tracking, live via `/ws/public/orders/{guest_token}`
  (auto-reconnect, 20s poll fallback)
- `/m/[public_slug]/page.tsx` — success screen (on-screen QR, "Pay online now" when
  `guest_checkout_mode='online'`) instead of an immediate redirect; vendor tabs + per-vendor price
  labels for food-court menus (`menu.vendors`); checkout always posts a flat cart, backend splits it
- `/m/[public_slug]/track/[guestToken]/page.tsx` — renders one "ticket" card per sibling order
  (vendor name, own status timeline) plus a grand total, for both single-vendor and food-court sessions
- `[tenant_slug]/display/page.tsx` — signage (auto-rotating categories)
- `[tenant_slug]/(admin)/public-link/page.tsx` — toggle, slug editor, table-QR PDF download, guest
  checkout mode switch (counter/online)
- `(staff)/pos/page.tsx` (+ `[tenant_slug]/(staff)/pos/page.tsx` re-export) — staff POS order entry
- Staff order queue (`(staff)/orders/page.tsx`) shows a "Guest" badge and handles `pending_confirmation`
- **Cafeteria read-only public menu (BR-SEG-3):** `PATCH /tenants/me/settings` no longer blocks
  `public_menu_enabled` for non-restaurant segments; `POST /public/{public_slug}/orders` rejects with
  `400` for cafeteria-segment tenants (menu/info endpoints unaffected). `(admin)/public-link/page.tsx`
  shows a segment-appropriate copy/feature set (no checkout-mode toggle or QR-sheet download for
  cafeteria); `/m/[public_slug]/page.tsx` hides add-to-cart/checkout entirely when
  `!isRestaurantSegment(info.tenant_type)`.

**Not yet implemented (explicit follow-up, genuinely blocked on external resources):** a *real*
payment-gateway integration (SSLCOMMERZ or similar, needs real merchant credentials) for online
guest checkout — today `guest_checkout_mode='online'` uses a simulated payment identical in spirit
to the existing authenticated `PaymentMethod.simulation`; kiosk card-reader integration (needs real
hardware). These are the only two remaining RFC-007 items, and neither is buildable in this
environment.

**Definition of done — met:** Guest can order via `/m/{slug}` → appears in staff queue with a
"Guest" badge → staff confirms → guest tracks live (polling) → staff marks paid at counter.
Consumer registration returns 400 for restaurant tenants; cafeteria flow unaffected. Zero
cross-tenant leakage in public endpoints (isolation tests pass).

---

### Phase 23 — Franchise Self-Service Outlet Provisioning
**RFC:** [RFC-008](../decisions/rfcs/RFC-008-franchise-outlet-self-service.md)
**Priority:** P1
**Status:** ✅ Implemented (2026-07-05)

A gap analysis against the platform's product spec found that a franchise brand's own admin could
not create new outlets — `POST/GET /tenants/{tenant_id}/outlets` were `platform_admin`-only, with no
frontend page at all. Fixed:

Backend:
- `app/routers/tenants.py::_require_own_brand_or_platform` — new guard dependency: accepts
  `platform_admin` (any brand, unchanged), or the brand's own `super_admin`/`tenant_admin` when the
  path `tenant_id` matches their own JWT `tenant_id` and their tenant is `franchise_brand`
  (**BR-FRAN-1**). Replaces the blanket `_admin_only` on both outlet endpoints.
- `backend/tests/test_franchise_outlets.py` — 7 tests: brand admin lists/creates own outlets (both
  `super_admin` and `tenant_admin`), a different brand's admin gets 403, a non-franchise
  `tenant_admin` gets 403, `platform_admin` access unchanged, plain `customer` gets 403.

Frontend:
- `[tenant_slug]/(admin)/outlets/page.tsx` — list + create outlets, visible only when
  `tenant_type === 'franchise_brand'`; each outlet card links to its own `/{slug}/dashboard`.
- `(admin)/layout.tsx` — new "Outlets" nav item, gated the same way as "Central Inventory".
- `types/index.ts` — added `TenantListResponse`, `OutletCreate`.

Also documented (no code change): the product spec's "Franchise Admin" / "Tenant Admin" / "Shop
Admin" terminology mapped explicitly onto `UserRole` values in `specs/system/architecture.md`
(`super_admin` = Franchise Admin). The spec's "Specific Category Restaurant" tenant formation was
evaluated and intentionally **not** given a new `TenantType` — no business rule differs from
`franchise_brand`, so it remains a wizard-copy nuance, not an engineering gap (see RFC-008 §3).

**Definition of done — met:** a franchise brand's `super_admin`/`tenant_admin` can create a new
outlet from `/outlets` without any platform-admin involvement; cross-brand isolation holds (tested).

---

## Priority Matrix

| Feature | User Impact | Effort | Priority |
|---|:---:|:---:|:---:|
| Tenant discovery + registration redesign | Very High | Medium | P0 |
| Admin settings + branding | High | Medium | P0 |
| Password reset flow | High | Low | P0 |
| Floor plan editor | High | High | P1 |
| Admin analytics dashboard | High | Medium | P1 |
| Admin menu management | High | Medium | P1 |
| Staff menu toggle page | Medium | Low | P1 |
| Profile edit + password change | Medium | Low | P1 |
| Food court frontend | High | High | P2 |
| Staff invitation system | Medium | High | P2 |
| Notification inbox | Medium | Medium | P2 |
| Platform analytics + subscriptions | Low | Medium | P3 |
| Segment split + guest QR ordering (public surface) | Very High (restaurant segment) | High | P1 |

# RFC-007: Segment Split (Cafeteria vs Restaurant) & Guest QR Ordering

**Date:** 2026-07-05
**Author:** Mahadi Jubaer (22301162)
**Status:** Implemented
**Related spec files:** `system/segments.md` (NEW), `system/data-model.md`, `modules/orders.md`, `modules/payments.md`, `modules/tenants.md`, `modules/public-surface.md` (NEW), `modules/qr-pdf.md`, `frontend/overview.md`, `operations/roadmap.md`

---

## 1. Motivation

SCMS currently presents one undifferentiated product to every tenant type. In practice the seven
`tenant_type` values fall into two very different consumer experiences:

- **Cafeteria-like tenants** (`corporate`, `academic`) — a closed community of registered users who
  log in, browse a menu, and pay from a wallet.
- **Restaurant-like tenants** (`independent_restaurant`, `franchise_brand`, `franchise_outlet`, and
  later `food_court*`) — walk-in guests who scan a table QR code and order without ever creating an
  account. Only staff/admin roles log in.

Today, restaurant tenants get the same customer-registration flow as cafeterias, and there is no
guest-facing ordering surface at all — a real restaurant deployment cannot function without an
account for every diner. This RFC introduces a **segment landing page**, a **public/guest ordering
surface**, and the schema changes needed to support orders with no `user_id`.

## 2. Proposed Design

### 2.1 Overview

Segment is a **derived** property, not a new tenant attribute — no `segment` column is added.
A single mapping function (`SEGMENT_MAP`, see `system/segments.md`) classifies every `tenant_type`
as `cafeteria` or `restaurant`. Restaurant tenants gain a public, unauthenticated ordering surface
(`/api/v1/public/*`) that lets a guest scan a table QR, order, and track status — with **pay at
counter** as the MVP checkout mode. Cafeteria tenants are unaffected.

### 2.2 User-Facing Behaviour

- New root landing page (`/`) offers two segment cards: **Cafeteria** and **Restaurant**, each
  leading to the existing tenant directory/search, filtered by segment.
- Restaurant tenants: `(customer)` route group and `/auth/register` are blocked (404/400) — see
  BR-SEG-1. Only admin/staff roles authenticate normally.
- Guest flow: scan table QR → `/m/{public_slug}?o={outlet_slug}&t={table_number}` → browse menu →
  add to cart → checkout with name + phone (no password) → order enters `pending_confirmation` →
  staff confirms in the normal order queue → guest tracks live status via a token link → pays at the
  counter → staff marks paid.
- Admin gets a new "Public Link" settings page: toggle public menu on/off, set `public_slug`,
  download a PDF sheet of per-table QR codes.
- Kiosk mode (`?mode=kiosk` on the same public menu page) and a read-only signage page
  (`/{tenant_slug}/display`) are frontend-only skins over the same public menu API — no new backend.

### 2.3 New or Changed API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/public/{public_slug}/menu` | Public | Menu + categories, Redis-cached 60s, price-only (no cost/inventory fields) |
| `GET` | `/api/v1/public/{public_slug}/info` | Public | Branding, hours, outlet info |
| `POST` | `/api/v1/public/{public_slug}/orders` | Public (rate-limited) | Guest order create → `status=pending_confirmation`, returns `guest_token` |
| `GET` | `/api/v1/public/orders/{guest_token}` | Public (token = capability) | Guest order tracking |
| `GET` | `/api/v1/public/orders/{guest_token}/qr` | Public (token = capability) | QR of the guest's own tracking URL (success screen) |
| `WS` | `/ws/public/orders/{guest_token}` | Token-auth channel | Live status push for the guest |
| `POST` | `/api/v1/orders/staff-pos` | Staff/admin | Staff POS entry — attributed to staff account, `status=confirmed` immediately |
| `PATCH` | `/api/v1/orders/{id}/mark-paid` | Staff/admin | Pay-at-counter for any non-`customer_app` order |
| `GET` | `/api/v1/qr/table-sheet/pdf` | Admin | One-page-per-table QR PDF sheet |

Full request/response detail: see `modules/public-surface.md`.

### 2.4 Database Changes

```sql
-- orders: allow guest orders (Alembic revision v3_2_guest_orders)
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE orders
  ADD COLUMN order_source VARCHAR(16) NOT NULL DEFAULT 'customer_app'
    CHECK (order_source IN ('customer_app','staff_pos','guest_qr','kiosk')),
  ADD COLUMN guest_token UUID UNIQUE,
  ADD COLUMN guest_name VARCHAR(80),
  ADD COLUMN guest_phone VARCHAR(20);

ALTER TABLE orders ADD CONSTRAINT chk_order_identity CHECK (
  (user_id IS NOT NULL AND guest_token IS NULL)
  OR (user_id IS NULL AND guest_token IS NOT NULL AND order_source IN ('guest_qr','kiosk'))
);

-- tenants: public surface config
ALTER TABLE tenants
  ADD COLUMN public_menu_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN public_slug VARCHAR(60) UNIQUE,
  ADD COLUMN guest_checkout_mode VARCHAR(16) NOT NULL DEFAULT 'counter'
    CHECK (guest_checkout_mode IN ('counter','online'));
```

No `segment` column anywhere — see `system/segments.md`.

Link to updated data model: `specs/system/data-model.md`.

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| Segment landing | `app/page.tsx` | Two cards: Cafeteria / Restaurant → tenant directory filtered by segment |
| Public menu + guest checkout | `app/m/[public_slug]/page.tsx` | Menu, cart, guest checkout (name+phone), success screen with tracking link + QR |
| Guest tracking | `app/m/[public_slug]/track/[guestToken]/page.tsx` | Live order status via WS |
| Kiosk mode | same page, `?mode=kiosk` | Fullscreen, locked UI, idle-reset to menu after 90s |
| Signage | `app/[tenant_slug]/display/page.tsx` | Read-only auto-rotating menu board |
| Admin public-link settings | `app/[tenant_slug]/(admin)/public-link/page.tsx` | Toggle public menu, edit slug, download table-QR PDF sheet |

### 2.6 Business Rules

To be added to the relevant module specs before implementation:

- **BR-SEG-1** Restaurant-segment tenants: `(customer)` route group and `POST /auth/register` return `404`/`400`. Cafeteria tenants unaffected. (`system/segments.md`, `modules/auth.md`)
- **BR-SEG-2** Segment is computed by `SEGMENT_MAP[tenant_type]`; there is no persisted segment field, so no migration can ever leave it stale. (`system/segments.md`)
- **PUB-1 … PUB-6** Guest order lifecycle, rate limiting, staff confirmation gate, expiry — see `modules/public-surface.md`.
- **OR-11** `order_source` is set on every order-creation path (`customer_app` default; `staff_pos`, `guest_qr`, `kiosk` for the new paths). (`modules/orders.md`)
- **WAL-4** Wallet/reward triggers no-op when `order.user_id IS NULL`. (`modules/payments.md`)

---

## 3. Alternatives Considered

- **Add a `segment` column to `tenants`.** Rejected (see Section 1 "Corrections," C1 in the original
  proposal) — it duplicates information already derivable from `tenant_type` and risks drifting out
  of sync. A pure function is the single source of truth.
- **Guest online payment (SSLCOMMERZ) in the MVP.** Rejected for now — pay-at-counter removes the
  payment-gateway integration from the critical path; online guest payment is explicit Phase-2 scope
  (`guest_checkout_mode='online'`).
- **Bare table number in the QR payload.** Rejected — ambiguous across outlets/franchises. The QR
  payload is `{public_slug}` + `{table_number}`, validated against the tenant's own tables. (In
  practice `outlet_slug` was dropped entirely — each outlet/food-court is already its own tenant
  with its own `public_slug`, so it added nothing.)
- **Food-court cart: single-vendor checkout only, vs. true multi-vendor cart split into linked
  orders.** Explicitly decided with the user before implementation (see status update below) — chose
  the multi-vendor cart despite the bigger blast radius (relaxing the `guest_token` UNIQUE
  constraint already shipped in migration `0006`), because single-vendor-only checkout would have
  been a meaningfully worse guest experience for the one segment (food courts) where this feature
  matters most.

## 4. Open Questions

- [ ] Exact Redis rate-limit thresholds for `POST /public/*/orders` (proposal suggests 5/min/IP; confirm against expected foot traffic).
- [ ] Per-table pending-order cap value (proposal suggests 3).
- [ ] `pending_confirmation` auto-expiry TTL (proposal suggests 20 min) and who processes the expiry (Redis TTL job vs. periodic sweep).
- [ ] Whether cafeteria tenants ever get an optional read-only public menu (explicitly out of MVP per Section 3.4 of the source proposal).

## 5. Implementation Checklist

**SPEC CHANGES FIRST — no code until all spec checkboxes are ticked.**

- [x] `specs/system/segments.md` created
- [x] `specs/modules/public-surface.md` created
- [x] `specs/system/data-model.md` updated (orders + tenants deltas, marked Phase 22 / not yet implemented)
- [x] `specs/modules/orders.md` updated (`order_source`, guest fields, OR-11)
- [x] `specs/modules/payments.md` updated (WAL-4, mark-paid-at-counter)
- [x] `specs/modules/tenants.md` updated (public surface config fields)
- [x] `specs/modules/qr-pdf.md` updated (outlet-scoped table QR payload, PDF sheet endpoint)
- [x] `specs/frontend/overview.md` updated (routing tree)
- [x] `specs/operations/roadmap.md` updated (Phase 22 entry)
- [x] `CHANGELOG.md` updated (Planned — Phase 22)
- [x] Alembic migration `0006_add_guest_orders.py` written
- [x] Backend implementation (`/api/v1/public` router, rate limiting, staff confirmation gate, guest WS channel, staff POS entry, table-QR PDF sheet)
- [x] Tests written (guest lifecycle, rate-limit rejection, per-table cap, cross-tenant slug isolation, `chk_order_identity`, staff POS, mark-paid guard — `backend/tests/test_public_surface.py`, 16 tests)
- [x] Frontend implementation (segment landing, `/m/[public_slug]`, guest tracking, kiosk mode, signage, admin public-link, staff POS)
- [x] `CHANGELOG.md` updated again on implementation

**Status update (2026-07-05):** Fully implemented, including Phase-2 online guest payment as a
**simulated** gateway (`POST /public/orders/{guest_token}/pay`, `payment_method='simulation'` —
mirrors the existing authenticated `PaymentMethod.simulation`). Also closed the BR-SEG-1 login-side
gap (`POST /auth/login` now blocks `customer`/`student` roles on restaurant-segment tenants, not
just `POST /auth/register`). A real payment-gateway integration (SSLCOMMERZ or similar) remains
unimplemented — it needs real merchant credentials this project doesn't have.

**Status update (2026-07-05, later same day) — Phase D, food-court multi-vendor guest carts:**
The original design assumed one guest order per checkout. A food court's vendors are separate
tenants, so a cart spanning multiple stalls needed to become multiple `Order` rows. Chose the
"true multi-vendor cart" option over "single-vendor checkout only" (see §3 Alternatives): relaxed
`orders.guest_token` from `UNIQUE` to a plain index (migration `0007`), so a cart is split into one
order per vendor, all sharing one `guest_token` (a "guest session"). Every public endpoint
(menu/order-create/tracking/pay/QR) and the guest WebSocket became session-aware — see
`modules/public-surface.md` "Food Courts: Guest Sessions" for the full design, including how
`public_slug`/`guest_checkout_mode` are resolved for a food-court session (via the shared table's
owning tenant, not any individual vendor's `tenant_id`).

**Status update (2026-07-05, later still) — cafeteria-segment read-only public menu (BR-SEG-3):**
The original proposal's Phase D listed "cafeteria-segment optional public menu (read-only)" as
explicitly out of MVP scope. Unlike the other two remaining Phase D items (real payment gateway,
kiosk hardware), this one is pure software with no external blocker, so it was built: cafeteria
tenants may now set `public_menu_enabled=TRUE` and get a `/m/{public_slug}` page, but
`POST /public/{public_slug}/orders` stays `400` for them — they already have accounts and order
through the normal app. See `system/segments.md` BR-SEG-3. **RFC-007 is now fully implemented**
except the real payment gateway and kiosk hardware integration, both genuinely blocked on resources
this environment doesn't have (merchant credentials, physical card readers).

# Module: Public Surface (Guest Menu, Guest Ordering, Kiosk, Signage)

**Status:** ✅ [Phase 22 — Implemented 2026-07-05] (design accepted via RFC-007)
**Planned router:** `backend/app/routers/public.py` (mounted at `/api/v1/public`, **no JWT middleware**)
**Planned schemas:** `backend/app/schemas/public.py`
**Related:** `system/segments.md`, `modules/orders.md`, `modules/tables.md`, `modules/qr-pdf.md`

---

## Overview

Restaurant-segment tenants (see `system/segments.md`) need diners to be able to browse a menu and
place an order **without an account**. This module defines the entire unauthenticated surface:
public menu, guest order placement, guest order tracking, kiosk mode, and signage — plus the abuse
controls needed because none of it sits behind a JWT.

Cafeteria-segment tenants may also enable this surface, but **read-only** — see BR-SEG-3 in
`system/segments.md`. `GET /public/{public_slug}/menu` and `/info` work identically for either
segment; `POST /public/{public_slug}/orders` (and everything downstream — tracking/pay/QR/WS) is
restaurant-segment only.

Segment gate for the menu/info endpoints: only tenants with `public_menu_enabled=TRUE` (see
`system/data-model.md` → `tenants`) serve traffic on this router; all others return `404` regardless
of segment.

**Food courts are a special case.** `public_slug` always resolves to the food-court **parent**
tenant (its vendors never have their own `public_slug`), but menu items and orders live on the
vendor (child) tenants. See "Food Courts: Guest Sessions" below — every endpoint on this router
operates on a **guest session** (one or more sibling orders sharing one `guest_token`), which is a
group of exactly one order for single-vendor restaurants.

---

## API Endpoints

### `GET /api/v1/public/{public_slug}/menu`

**Auth:** None. **Cache:** Redis, key `public:menu:{tenant_id}`, TTL 60s.

Resolves `public_slug → tenant_id` in a single query (the tenant-isolation invariant holds even
without JWT middleware — see security checklist below). Returns categories + items in the same
shape as `GET /menu/categories` + `GET /menu/items`, **minus** any cost/inventory fields — price and
availability only.

**Food court (`tenant_type=food_court`):** items are aggregated across all active
`food_court_vendor` children (the parent has no menu items of its own). `categories` is always `[]`
in this case — there's no unified category set across vendors, so the frontend groups by vendor
instead. Response gains:

```jsonc
{
  "categories": [],
  "items": [{ "...": "MenuItemResponse fields", "vendor_id": "...", "vendor_name": "Campus Burger" }],
  "vendors": [{ "vendor_id": "...", "vendor_name": "Campus Burger" }, { "...": "..." }]
}
```

`vendor_id`/`vendor_name` are `null` for single-vendor tenants; `vendors` is `null`/omitted.

**Errors:** `404` unknown slug or `public_menu_enabled=FALSE`.

---

### `GET /api/v1/public/{public_slug}/info`

**Auth:** None.

Returns branding (`name`, `logo_url`, `brand_color`), `address`, `city`, `phone`, and outlet list
(for franchises) — a subset of `TenantPublicDetailResponse` (see `modules/tenants.md`).

---

### `POST /api/v1/public/{public_slug}/orders`

**Auth:** None, but rate-limited (PUB-2) and gated (PUB-1).

**Request body (`GuestOrderCreate`):**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `items` | list[OrderItemCreate] | Yes | `min_length=1`, same shape as `OrderCreate.items` |
| `table_number` | str | Yes | Must exist on the resolved tenant's (or food-court parent's) `tables_map` (PUB-5) |
| `guest_name` | str | Yes | 1–80 chars |
| `guest_phone` | str | Yes | Digits, 7–20 chars |
| `special_notes` | str \| null | No | — |
| `is_kiosk` | bool | No | Sets `order_source='kiosk'` instead of `'guest_qr'` |

**Business logic (single-vendor restaurant — executed in order):**
1. Resolve `public_slug → tenant_id` (404 if missing/disabled) — PUB-1
2. Reject with `400` if the tenant's segment is not `restaurant` (BR-SEG-3) — cafeteria public menus
   are read-only; this endpoint is never reachable for them regardless of what the client sends
3. Enforce rate limit `5/min` per `(ip, table_number)` (PUB-2) → `429` on breach
3. Enforce per-table pending-order cap of 3 (`order_source IN ('guest_qr','kiosk')`, `status IN (pending_confirmation, confirmed, preparing, ready)`) → `409` on breach
4. Validate items availability (reuses OR-2)
5. Calculate `total_amount` server-side (reuses OR-5) — no wallet/payment step; `payment_status='pending'`
6. Create one `order` with `user_id=NULL`, `guest_token=uuid4()`, `order_source='guest_qr'`/`'kiosk'`, `status='pending_confirmation'`
7. Publish `ORDER_PLACED` to the tenant's staff channel — the staff `OrderQueue` shows a "Guest" badge and a **Confirm** action (PUB-3) instead of the usual auto-accept path
8. Return the guest session (see below)

**Business logic (food court — `tenant.tenant_type='food_court'`, see "Food Courts: Guest Sessions"):**
Same rate-limit/cap/expiry rules, but the table is looked up against the **food-court parent's**
`tables_map` (shared tables), each requested item's vendor is derived server-side from
`menu_items.tenant_id` (never trusted from the client), and the cart is split into **one order per
vendor**, all created in a single DB transaction and sharing **one** `guest_token`.

**Response `201` (`GuestOrderGroupResponse` — always this shape, even for a single order):**

```json
{
  "guest_token": "b7e6...",
  "total_amount": "750.00",
  "orders": [
    {
      "order_id": "3fa85f64-...",
      "guest_token": "b7e6...",
      "status": "pending_confirmation",
      "order_source": "guest_qr",
      "table_id": 12,
      "table_number": "A1",
      "total_amount": "400.00",
      "payment_status": "pending",
      "payment_method": null,
      "guest_name": "...",
      "guest_phone": "...",
      "vendor_id": "...",
      "vendor_name": "Campus Burger",
      "items": [ { "item_id": "...", "menu_item": { "name": "Classic Burger", "...": "MenuItemResponse" }, "quantity": 1, "unit_price": "400.00", "subtotal": "400.00" } ]
    }
  ]
}
```

`vendor_id`/`vendor_name` are `null` for single-vendor restaurants (only one order in `orders`).
`table_number` and `items[].menu_item` follow the same contract as `modules/orders.md` OR-13 — the
guest tracking page (`m/[public_slug]/track/[guestToken]/page.tsx`) and kiosk order-status screen
must render these, never `table_id`/`item_id` directly (fixed 2026-07-16 — the guest tracking page
was previously the one surface that had no fallback at all, rendering `item_id.slice(0, 8)`).

**Errors:** `404` unknown slug/disabled, or (food court) an item not owned by one of this food
court's active vendors | `400` tenant is cafeteria segment (BR-SEG-3) or unavailable item | `429`
rate limit | `409` per-table pending cap or invalid table

---

### `GET /api/v1/public/orders/{guest_token}`

**Auth:** None — `guest_token` (UUIDv4) is the capability for the whole guest session (PUB-6).

**Response:** `Cache-Control: no-store`. `GuestOrderGroupResponse` — every sibling order sharing
this `guest_token` (one for single-vendor restaurants, one per vendor for a food-court cart). Each
order in `orders` has `guest_name`/`guest_phone` instead of `user_id`, and no wallet/reward fields.
PUB-4 expiry is checked independently per sibling order.

**Errors:** `404` unknown/expired token.

---

### `GET /api/v1/public/orders/{guest_token}/qr`

**Auth:** None — same `guest_token` capability as tracking.

Returns `{"data": "<base64 PNG>"}` — a QR code encoding this guest's own tracking URL
(`{FRONTEND_URL}/m/{public_slug}/track/{guest_token}`). The owning tenant (whose `public_slug` is
used) is resolved via `order_service.resolve_public_owner_tenant()` — for a food-court sibling
order this is the **parent**, not the vendor whose `tenant_id` is on the order row (see "Food
Courts: Guest Sessions"). Powers the post-checkout success screen ("success screen with tracking
link + on-screen QR" — Sprint 7.5 frontend spec). `Cache-Control: no-store`.

**Errors:** `404` unknown/expired token.

---

### `POST /api/v1/public/orders/{guest_token}/pay`

**Status:** ✅ [Phase 22 Phase 2 — Implemented 2026-07-05]
**Auth:** None — same `guest_token` capability as tracking.

Simulated online guest payment (WAL-5 in `modules/payments.md`) — pays **every non-cancelled
sibling order** in the guest session in one action (a guest pays once for the whole cart, even if
it was split across multiple food-court vendors). Only usable when the owning tenant (resolved the
same way as the QR endpoint) has `guest_checkout_mode='online'` (set via `PATCH /tenants/me/settings`,
admin-only). Sets `payment_status='paid'`, `payment_method='simulation'` on each payable order. This
is a placeholder gateway, not a real card/SSLCOMMERZ integration — always succeeds, no external call.

**Response `200`:** `GuestOrderGroupResponse` (all sibling orders, now `payment_status='paid'`).

**Errors:** `400` owning tenant is `guest_checkout_mode='counter'` | `400` every order already paid
| `400` every order was cancelled | `404` unknown/expired token.

**WS event:** publishes `ORDER_PAID` per paid order, each to `target_guest_token` (see `modules/websocket.md`).

---

### `GET /api/v1/public/{public_slug}/payment-methods` — RFC-011 Stage 3

**Auth:** None

Which payment methods a guest checking out at this venue can choose, for the guest checkout UI to
render dynamically instead of a single hardcoded "Pay online now" button.

**Business logic:** resolves the tenant the same single-query way every other endpoint on this
router does (PUB-1). If `guest_checkout_mode != 'online'`, every field is `false` (guest must pay
at the counter — no online option at all, real or simulated). If `online`, `simulation` is always
`true` (this project's existing demo/test path, unchanged) and `sslcommerz`/`bkash` are `true` only
when this tenant has that gateway enabled + configured (same definition as the authenticated
`GET /payment-gateways/available`). `wallet` is always `false` here — guests have no account.

**Response `200`:**
```json
{ "wallet": false, "simulation": true, "sslcommerz": true, "bkash": false }
```

---

### `POST /api/v1/public/orders/{guest_token}/pay/gateway/initiate` — RFC-011 Stage 3

**Auth:** None — same `guest_token` capability as tracking.

**Request body:** `{ "gateway_type": "sslcommerz" | "bkash" }`

Real-gateway counterpart to the simulated `POST /orders/{guest_token}/pay` above — same
"pays the whole guest session in one action" semantics (PUB-6), same `guest_checkout_mode='online'`
gate, same owner-tenant resolution (PAY-10: a food-court vendor's guest session resolves gateway
config from the **parent**, not the vendor — the guest entered via the parent's public menu, so the
parent's own gateway configuration is what applies, exactly like `guest_checkout_mode` itself
already works today).

**Business logic:**
1. Load the guest session (`get_guest_order_group` — 404s + PUB-4 expiry check), filter to payable
   (non-cancelled, not-yet-paid) orders. `400` if none payable (all cancelled or already paid).
2. Resolve owner tenant (`resolve_public_owner_tenant`) — `400` if `guest_checkout_mode != 'online'`.
3. Load the owner tenant's decrypted gateway config — `400` if not enabled/configured.
4. Create a `gateway_transactions` row with `purpose='order_payment'`, `order_id=NULL`,
   `user_id=NULL`, `guest_token` set (this is exactly why the table has a nullable `order_id` and a
   separate `guest_token` column — a guest session settlement isn't tied to any single order),
   `amount` = sum of `(total_amount - discount_amount)` across the payable orders.
5. Same gateway session-init call and callback/IPN URL construction as the authenticated flow
   (`POST /payments/gateway/initiate`, `modules/payments.md`) — **the settlement endpoints are
   shared, not duplicated**; they branch on whether the row has `order_id` (authenticated — creates
   one `payments` row) or `guest_token` (this path — marks every payable sibling order paid
   directly, no `payments` row, mirroring the simulated path's existing precedent above).
6. On settlement success, the callback redirects to `{FRONTEND_URL}/m/{public_slug}/track/{guest_token}?payment=success`
   (using the *owner* tenant's `public_slug`) instead of the authenticated flow's `/{slug}/track/{order_id}`.

**Response `200`:** `GatewayInitiateResponse` — `{ "gateway_transaction_id": "...", "redirect_url": "..." }`.

**Errors:** `404` unknown/expired token · `400` every order cancelled/already paid, `guest_checkout_mode='counter'`, or gateway not configured · `502` gateway session-init failed.

---

### `WS /ws/public/orders/{guest_token}`

Token-authenticated channel (not a `user_id`-based channel like the authenticated WS) for the whole
guest session. For a food-court cart, sibling orders live on **different vendor tenants**, each
publishing to its own Redis channel — the guest's one WebSocket connection subscribes to **all** of
them at once (`ws_pubsub.subscribe_and_forward_many`), and `ConnectionManager.broadcast_to_tenant`
matches purely on `target_guest_token` (bypassing its usual tenant_id filter) so the connection isn't
tenant-scoped the way staff connections are. Pushes the same event types as `modules/websocket.md`'s
order events (`ORDER_CONFIRMED`, `ORDER_PREPARING`, `ORDER_READY`, `ORDER_DELIVERED`,
`ORDER_CANCELLED`, `ORDER_PAID`) for any sibling order. The event payload is partial (`order_id`,
`status`, …) — the frontend tracking page re-fetches `GET /public/orders/{guest_token}` (the whole
group) on every message rather than trusting the WS payload shape directly. A 20s poll runs
alongside the socket as a safety net in case the connection drops silently; the socket
auto-reconnects after 4s on close.

---

## Food Courts: Guest Sessions

**Status:** ✅ [Phase D — Implemented 2026-07-05] (RFC-007 §Phase D)

A food-court guest scans one QR, browses a unified menu across all vendors (`_build_food_court_menu`
in `app/routers/public.py`), and can add items from more than one stall to a single cart. Since each
vendor is its own tenant with its own menu/orders (isolation invariant unchanged — see
`modules/food-court.md`), the cart is split into **one `Order` row per vendor**, all created in a
single DB transaction and sharing one freshly generated `guest_token` — a **guest session**
(`order_service.create_food_court_guest_order`).

- **Shared table, split tickets.** The `table_number` is looked up against the **food-court
  parent's** `tables_map` (same as the authenticated `food_court.list_shared_tables` design) — not
  any individual vendor's. Each resulting order gets `table_id` pointing at that shared table, even
  though `order.tenant_id` is the vendor.
- **Vendor derived server-side.** Each requested `item_id` is looked up and its owning
  `menu_items.tenant_id` checked against the food court's active `food_court_vendor` children —
  never trusted from the client. An item belonging to any other tenant (including a different food
  court, or a completely unrelated restaurant) → `404`.
- **Per-vendor tickets, independent lifecycle.** Each sibling order gets its own
  `status=pending_confirmation` — that vendor's own staff confirm/prepare/serve it independently via
  the normal `/orders/*` endpoints, scoped to their own tenant as always. A guest's burger ticket and
  sushi ticket can be at different stages simultaneously.
- **One payment, all tickets.** `POST /public/orders/{guest_token}/pay` pays every sibling order at
  once (guest-initiated, one action). `PATCH /orders/{id}/mark-paid` (staff-initiated,
  `modules/payments.md` WAL-4) stays **per-order** — each vendor's own counter marks their own ticket
  paid, since that's a physically separate transaction in reality.
- **Owning tenant for public_slug/guest_checkout_mode.** Since sibling orders have different
  `tenant_id` values (the vendors), but only the food-court **parent** has a `public_slug` and
  `guest_checkout_mode`, every place that needs "the tenant this guest actually entered through"
  (QR generation, online-payment gating) resolves it via
  `order_service.resolve_public_owner_tenant()`: look up the order's `table_id` in `tables_map` and
  use *that* table's `tenant_id` — the food-court parent owns the shared tables, so this always
  recovers the parent for a food-court order and the tenant itself for a single-vendor restaurant,
  with no extra column needed.
- **Guest WebSocket spans multiple tenant channels.** See "`WS /ws/public/orders/{guest_token}`" above.

Single-vendor restaurants go through the exact same `GuestOrderGroupResponse` shape — they just
always have exactly one order in `orders`.

---

## Staff Confirmation Gate (PUB-3)

A guest order never enters `confirmed` automatically. It appears in the staff `OrderQueue` with
`status=pending_confirmation` and a distinguishing "Guest" badge (derived from `order_source`).
Staff must call the existing `PATCH /orders/{order_id}/status` with `status=confirmed` before the
order proceeds through the normal status machine (OR-8 in `modules/orders.md`). From `confirmed`
onward, a guest order behaves exactly like any other order except it has no wallet debit — see
`modules/payments.md` → WAL-4 and "mark paid at counter."

---

## Kiosk Mode

> ⚠️ **Superseded by RFC-010** — dedicated kiosk terminals now live in `modules/kiosk.md`
> (device-token auth, `/device/orders`, pickup numbers, admin customization). The `?mode=kiosk`
> behaviour below remains valid for phone-based guest ordering but is no longer the kiosk story.

Same `/m/{public_slug}` page, `?mode=kiosk` query param. Frontend-only behaviour — no dedicated
backend endpoint:
- Locked UI: no browser back/forward escape, no address bar navigation affordance
- Idle-reset: after 90s with no interaction, return to the menu root and clear any in-progress cart
- Orders placed in kiosk mode still call `POST /public/{public_slug}/orders`, with `order_source='kiosk'`

## Signage

> ⚠️ **Superseded by RFC-010** — see `modules/signage.md` (device-paired displays, playlists, live
> order board). The `/{tenant_slug}/display` page is now a deprecation notice + link to the paired flow.

`/{tenant_slug}/display` — ✅ Phase 25: now a static notice pointing at `/signage` pairing +
the admin Devices page, replacing the old JWT-gated auto-rotating board (no offline resilience,
no admin-managed content, no order board/trending/offers).

## Shared Menu Builder (Phase 25 refactor — RFC-010)

✅ Implemented (Phase 25). The cost-stripped menu construction previously inlined in
`routers/public.py` (single-vendor + `_build_food_court_menu`) is extracted into
`services/menu_service.py` so `GET /public/{public_slug}/menu` and `GET /device/menu`
(`modules/devices.md`) share one implementation. Behaviour of the public endpoint is unchanged,
except items additionally carry `allergens` and `dietary_tags` (PUB-7 still strips cost/inventory
fields; allergens are customer-facing, not internal).

---

## Business Rules

### PUB-1: Slug Resolution Is the Only Tenant-Scoping Mechanism
Every `/public/*` handler resolves `public_slug → tenant_id` in exactly one query before touching any
other table. There is no JWT, so this query is the entire tenant-isolation boundary for this module —
it must be covered by a cross-tenant-leakage test (see `operations/roadmap.md` Phase 22 acceptance
criteria).

### PUB-2: Rate Limiting
`POST /public/{public_slug}/orders` is rate-limited via Redis sliding window, keyed on
`(client_ip, table_number)`: 5 requests/minute. Breach → `429`.

### PUB-3: Staff Confirmation Gate
See "Staff Confirmation Gate" above. A guest order cannot skip `pending_confirmation`.

### PUB-4: Pending-Confirmation Expiry
A guest order not confirmed within 20 minutes is auto-cancelled by a Redis-TTL-driven job
(`status → cancelled`, `payment_status` unchanged since nothing was ever charged).

### PUB-5: Table Validation
`table_number` in a guest order request must resolve to an existing row in the resolved tenant's
(or, for a food court, the parent's) `tables_map`; otherwise `409`.

### PUB-6: Guest Token Is a Session Capability, Not a Single-Order One
✅ [Phase D — Implemented 2026-07-05] `guest_token` is a UUIDv4 generated once per checkout and
stored on `orders.guest_token` — **not unique** (see `system/data-model.md`, migration
`0007_food_court_guest_sessions.py`). It grants read/pay access to every order sharing that token
(its **guest session**) and nothing else. For single-vendor restaurants a session is always exactly
one order; for a food-court cart it is one order per vendor (see "Food Courts: Guest Sessions").
Tracking responses always set `Cache-Control: no-store`.

### PUB-7: Public Responses Strip Internal Fields
`GET /public/{public_slug}/menu` never includes `cost_price`, `quantity_on_hand`, or any other
inventory/internal field — price and `is_available` only.

### PUB-8: Food-Court Item Ownership Is Re-Derived Server-Side
✅ [Phase D — Implemented 2026-07-05] When splitting a food-court guest cart, each item's vendor is
looked up from `menu_items.tenant_id` and checked against that food court's own active
`food_court_vendor` children. An item ID that doesn't belong to one of them (wrong food court, a
different tenant entirely, or a vendor removed from this food court) is rejected with `404` — the
client-supplied cart can never smuggle in a foreign tenant's item.

---

## Table QR Payload

See `modules/qr-pdf.md` for the full table-QR endpoint spec. Payload format:

```
https://<domain>/m/{public_slug}?t={table_number}
```

`table_number` is validated against the resolved tenant's (or food court's) tables at scan/order
time (PUB-5), not at QR-generation time. There is no `outlet_slug` param — each outlet (and each
food court) is already its own tenant with its own `public_slug`, so `public_slug` alone identifies
the correct ordering surface.

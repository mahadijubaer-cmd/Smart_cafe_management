# Module: Kiosk (Self-Service Ordering Terminals)

**Status:** ✅ Implemented (Phase 25.3/25.5, RFC-010)
**Routers:** kiosk endpoints on `backend/app/routers/device_api.py` (device auth) ·
`backend/app/routers/kiosk_config.py` (admin, JWT, `/api/v1/kiosk-config`)
**Frontend:** `frontend/src/app/kiosk/` · `frontend/src/app/[tenant_slug]/(admin)/kiosk-settings/`
**Related:** `modules/devices.md`, `modules/orders.md`, `modules/public-surface.md`,
`modules/websocket.md`, `system/data-model.md`, `decisions/rfcs/RFC-010-device-terminals.md`

---

## Overview

A kiosk is a paired `device_type='kiosk'` terminal (see `modules/devices.md`) running the
full-screen ordering flow at `/kiosk`. A customer browses the menu, builds a cart, places an order,
and receives a **pickup number**; payment happens at the counter (KSK-1). Admins customize the kiosk
per tenant/outlet via `kiosk_configs` and preview changes live before saving.

This module supersedes the `?mode=kiosk` frontend-only behaviour described in
`modules/public-surface.md` § "Kiosk Mode" (RFC-007), which remains available for phone-based guest
ordering but is no longer the kiosk story.

---

## Kiosk Ordering Flow (frontend state machine)

`pairing → attract → browse → item-detail → cart → confirm → order-number → attract`

- **Attract:** full-screen welcome (`kiosk_configs.welcome_text_en/bn`, `attract_image_urls`
  rotation), "Touch to start". Static (no rotation) under `prefers-reduced-motion`.
- **Browse:** category rail + item grid. `featured_item_ids` render first as a "Featured" row.
- **Item detail:** price, description, **allergen chips** (icon + text label for each EU FIC
  allergen present — never icon-only), dietary tags, quantity stepper, notes field.
- **Cart:** line items, edit/remove, server-verified total at confirm.
- **Confirm:** optional guest name (if `allow_guest_name`), "Pay at counter" explainer → places order.
- **Order-number:** huge `pickup_number` + instructions; auto-returns to attract after 30 s.

**Idle timeout (WCAG 2.2.1):** after `idle_timeout_seconds` (default 60) without interaction
anywhere past attract, show a warning modal with a 20 s countdown and a single large "I'm still
here" button that fully resets the timer; on expiry, clear the cart and return to attract. The modal
is announced via `aria-live="assertive"`.

**Accessibility toggle:** persistent corner button cycling large-text (+25 % root font) and
high-contrast modes. **Language toggle:** EN ⇄ বাংলা for all UI chrome
(`components/device/strings.ts`); menu content stays as admin-entered. Both reset to defaults when
the session idles back to attract.

**Touch targets:** every interactive element ≥48×48 px CSS with ≥8 px spacing (WCAG 2.5.8 /
EN 301 549 §5.5); base text ≥18 px.

---

## API Endpoints

### `POST /device/orders` — device auth, kiosk only (DEV-8), rate-limited 10/min/device

**Request (`KioskOrderCreate`):**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `items` | list[OrderItemCreate] | Yes | `min_length=1`, same shape as `OrderCreate.items` |
| `guest_name` | str \| null | No | ≤80 chars; defaults to `"Kiosk"` when omitted |
| `special_notes` | str \| null | No | — |

No `table_number` (KSK-3) and no `guest_phone` — the pickup number is the linkage.

**Business logic:**
1. Resolve tenant scope from the device row (DEV-5).
2. Rate limit 10/min per `device_id` → `429`.
3. Validate item availability (reuses OR-2); recompute total server-side (reuses OR-5).
4. Create order via the guest-order machinery (`order_service`): `user_id=NULL`,
   `guest_token=uuid4()`, `order_source='kiosk'`, `status='pending_confirmation'`,
   `payment_status='pending'`, `table_id=NULL`, `guest_phone=NULL`.
5. Assign `pickup_number` from Redis `INCR order:pickup:{tenant_id}:{YYYYMMDD}` (TTL 48 h) — KSK-4.
6. Publish `ORDER_PLACED` (staff channel; payload includes `pickup_number` and a "Kiosk" badge is
   derived from `order_source`).
7. Food-court kiosks split the cart per vendor exactly like a food-court guest session
   (`modules/public-surface.md` § Food Courts) — one `guest_token`, one `pickup_number` **per
   sibling group** (stored on each sibling order).

**Response `201`:** `GuestOrderGroupResponse` (see `modules/public-surface.md`) with each order
carrying `pickup_number`.

**Errors:** `400` unavailable item · `403` signage device · `429` rate limit.

### `GET /device/orders/{guest_token}` — device auth, kiosk only
`GuestOrderGroupResponse` for a session **this device's tenant scope owns** (else `404`).
`Cache-Control: no-store`.

### `GET /api/v1/kiosk-config` — JWT, `ADMIN_ROLES`
Returns the resolved config for the caller's tenant (outlet row overrides tenant row; defaults
filled):

```jsonc
{
  "welcome_text_en": "Welcome — order here", "welcome_text_bn": "স্বাগতম — এখানে অর্ডার করুন",
  "attract_image_urls": [], "featured_item_ids": [],
  "accent_color": null,            // null → tenant brand_color
  "idle_timeout_seconds": 60, "allow_guest_name": true, "show_dietary_tags": true
}
```

### `PUT /api/v1/kiosk-config` — JWT, `ADMIN_ROLES`
Upserts the row for (tenant, outlet). Validates `accent_color` contrast (≥4.5:1 against the kiosk
surface colours — KSK-7). Publishes `KIOSK_CONFIG_UPDATED` on the tenant channel; paired kiosks
re-fetch `GET /device/me`. Response `200` with the resolved config.

### `GET /api/v1/kiosk-config/preview/menu` — JWT, `ADMIN_ROLES`
Same payload shape as `GET /device/menu`, resolved from the admin's tenant context — feeds the
admin preview pane (KSK-8).

---

## Admin Customization + Preview

`[tenant_slug]/(admin)/kiosk-settings/page.tsx`: form (welcome EN/BN, attract images, featured-item
picker, accent colour with live contrast validation, idle timeout, guest-name toggle) beside a
**live preview pane** — the real kiosk components in a scaled portrait frame, bound to the unsaved
form state. "Full-screen preview" opens `(admin)/kiosk-settings/preview/` rendering the interactive
kiosk against the JWT preview endpoints with **order submission disabled** and a persistent
"Preview mode" banner.

---

## Business Rules

### KSK-1: Counter-Pay Only — PCI Out of Scope
The kiosk takes no payment input of any kind. Orders are created `payment_status='pending'`; staff
settle at the counter via the existing mark-paid flow (WAL-4). No cardholder data exists anywhere in
the system → PCI-DSS not applicable (asserted in `system/security.md`).

### KSK-2: Kiosk Orders Bypass the Restaurant-Segment Guard
BR-SEG-3 blocks *anonymous phone* checkout for cafeteria-segment tenants. A kiosk is venue-operated,
admin-registered hardware — `POST /device/orders` is allowed for **all** segments. The guard in
`order_service` keys on the entry path (device credential), not on `order_source`.

### KSK-3: No Table Binding
Kiosk orders are pickup orders: `table_id=NULL`, no PUB-5 table validation, and the per-table
pending cap does not apply (the per-device rate limit replaces it).

### KSK-4: Pickup Number
Per-tenant, daily-reset, human-readable integer from Redis
`INCR order:pickup:{tenant_id}:{YYYYMMDD}` (key TTL 48 h), stored on `orders.pickup_number` and
included in every order WS event payload (see `modules/websocket.md`).

### KSK-5: Staff Confirmation Gate Applies
Kiosk orders enter `pending_confirmation` and follow PUB-3/OR-8 exactly like guest orders — staff
confirm when the customer pays at the counter.

### KSK-6: Idle Reset Clears Everything
Cart, accessibility mode, and language selection all reset when the idle timeout expires or the
order-number screen auto-returns (a kiosk is a shared surface; one customer's settings must not
leak to the next).

### KSK-7: Accent Colour Must Pass Contrast
`accent_color` (and the tenant `brand_color` fallback) is validated at save time and again at
render: if <4.5:1 against the kiosk text surfaces, the kiosk falls back to the default accessible
accent.

### KSK-8: Preview Renders the Real Components
Admin preview reuses the exact kiosk rendering components (data + config via props — the renderer
contract in RFC-010 §2.5), fed by JWT preview endpoints and the unsaved form state. Preview can
never create orders.

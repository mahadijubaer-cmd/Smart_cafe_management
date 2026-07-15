# RFC-010: Device Terminals — Kiosk Mode + Digital Signage

**Date:** 2026-07-15
**Author:** Mahadi Jubaer (22301162)
**Status:** Accepted
**Related spec files:** `modules/devices.md` (new), `modules/kiosk.md` (new), `modules/signage.md` (new),
`modules/websocket.md`, `modules/public-surface.md`, `modules/orders.md`, `modules/menu.md`,
`system/data-model.md`, `system/security.md`, `frontend/overview.md`, `operations/roadmap.md`,
`decisions/adrs/ADR-013-device-token-auth.md`

---

## 1. Motivation

Two venue-hardware surfaces are missing from SCMS:

1. **Self-service kiosk** — a touch terminal where a customer browses the menu, builds a cart, and
   places an order without queuing at the counter. Benefits: shorter queues, fewer order-taking
   errors, staff freed for prep, and an accessible ordering path (large-text / high-contrast modes)
   for customers who struggle with counter interactions.
2. **Digital signage** — non-interactive wall displays showing rotating menu boards, offers,
   trending items, announcements, and a live "Preparing / Ready" order board. Benefits:
   always-current menus (no reprinting), scheduled promotions (e.g. lunch specials auto-appear
   11:00–14:00), and reduced counter crowding.

A signage prototype already exists (`frontend/src/app/[tenant_slug]/display/page.tsx`, RFC-007
Phase 22) but it **requires a logged-in staff JWT stored in the browser** — unacceptable for
unattended hardware: the token expires, and a stolen display yields a staff credential. There is no
device credential concept anywhere in the system. That gap is the core of this RFC; the credential
mechanism itself is decided in **ADR-013**.

Existing building blocks this RFC reuses rather than reinvents:
- `OrderSource.kiosk` and the `chk_order_identity` constraint already permit kiosk guest orders
  (`backend/app/models/order.py`).
- The cost-stripped public menu builder and guest-order machinery (`backend/app/routers/public.py`,
  `order_service.create_guest_order_session`, RFC-007).
- WebSocket + Redis pub/sub fan-out with a token-authenticated guest channel precedent
  (`backend/app/routers/websocket.py`).

---

## 2. Proposed Design

### 2.1 Overview

Introduce a **device registry** (per-tenant/outlet registered kiosk and signage terminals) with an
admin pairing-code flow that issues long-lived, revocable, opaque device tokens (ADR-013). Devices
call a new unauthenticated-router-with-device-token surface `/api/v1/device/*` and a WebSocket
channel `/ws/device`. On top of that substrate: a kiosk ordering flow (counter-pay only), a signage
playlist/slide content model with six slide types, and admin editors for both surfaces with live
preview.

### 2.2 User-Facing Behaviour

**Admin** (`tenant_admin` / `outlet_admin` etc.):
- New **Devices** page: register a device (name, type kiosk|signage, optional outlet), see paired
  state / last-seen, generate a 6-digit pairing code (10-min TTL, single use), revoke or rotate a
  device's credential.
- New **Signage** page: create playlists of ordered slides (menu board, promo image, announcement,
  order-status board, trending items, offers), each with duration and optional schedule window;
  assign playlists to devices or mark one default. A **live preview pane** renders the real slide
  components against the unsaved form state; a full-screen preview route mirrors the actual display.
- New **Kiosk Settings** page: welcome text (EN/BN), attract-screen images, featured items, accent
  colour (contrast-validated), idle timeout, guest-name toggle — with a live interactive kiosk
  preview (order submission disabled). Saving pushes `KIOSK_CONFIG_UPDATED` so paired kiosks refresh
  without a reboot.
- The menu item form gains **allergens** (EU FIC 14) and **dietary tags** fields.

**Customer at a kiosk** (`/kiosk` on the terminal):
attract screen → browse (category rail + item grid, ≥48 px touch targets) → item detail (allergen
chips, dietary tags, quantity, notes) → cart → confirm ("pay at counter") → big pickup number →
auto-return. Idle timeout shows a WCAG 2.2.1-compliant warning with an extend button. A persistent
accessibility button toggles large-text / high-contrast; an EN ⇄ বাংলা button switches UI chrome
language. Both reset when the session idles out.

**Passer-by at a signage screen** (`/signage` on the display):
rotating slides per the assigned playlist; the order-status slide shows live Preparing / Ready
pickup numbers. If the network drops, the display keeps rendering its cached playlist and reconnects
with backoff.

### 2.3 New or Changed API Endpoints

Full request/response schemas live in `modules/devices.md`, `modules/kiosk.md`, `modules/signage.md`.

**Admin — device registry** (JWT, `ADMIN_ROLES`):

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/devices` | Register device (name, device_type, outlet_id) |
| `GET` | `/api/v1/devices` | List devices w/ paired state, token_prefix, last_seen_at |
| `PATCH` | `/api/v1/devices/{device_id}` | Rename, settings, is_active |
| `POST` | `/api/v1/devices/{device_id}/pairing-code` | Issue 6-digit code (600 s TTL, single-use); also rotates |
| `POST` | `/api/v1/devices/{device_id}/revoke` | Null token hash, deactivate, push `DEVICE_REVOKED` |
| `DELETE` | `/api/v1/devices/{device_id}` | Delete device |

**Device-facing** (`X-Device-Token` header; `/pair` is unauthenticated + rate-limited):

| Method | Path | Device type | Description |
|---|---|---|---|
| `POST` | `/api/v1/device/pair` | — | Redeem pairing code → device token + profile |
| `GET` | `/api/v1/device/me` | any | Profile + settings refresh (incl. resolved kiosk config) |
| `GET` | `/api/v1/device/menu` | any | Cost-stripped menu incl. allergens/dietary_tags (shared builder with `/public/{slug}/menu`) |
| `POST` | `/api/v1/device/orders` | kiosk | Create kiosk order (guest-order path, `order_source=kiosk`, pickup_number) |
| `GET` | `/api/v1/device/orders/{guest_token}` | kiosk | Status of an order this device created |
| `GET` | `/api/v1/device/playlist` | signage | Resolved playlist + active slides (schedule windows included for offline filtering) |
| `GET` | `/api/v1/device/orders/board` | signage | Open kiosk+guest orders (pickup_number + status) to seed the order board |
| `GET` | `/api/v1/device/trending` | signage | Top-N items by quantity over window_days (Redis-cached 10 min) |

**Admin — signage content** (JWT, `ADMIN_ROLES`):

| Method | Path | Description |
|---|---|---|
| `POST/GET` | `/api/v1/signage/playlists` | Create / list playlists |
| `PATCH/DELETE` | `/api/v1/signage/playlists/{playlist_id}` | Update (name, is_default, is_active) / delete |
| `POST` | `/api/v1/signage/playlists/{playlist_id}/slides` | Add slide |
| `PATCH/DELETE` | `/api/v1/signage/slides/{slide_id}` | Update / delete slide |
| `PUT` | `/api/v1/signage/playlists/{playlist_id}/slides/reorder` | Reorder positions |
| `GET` | `/api/v1/signage/playlists/{playlist_id}/preview` | Same payload shape as `/device/playlist` |
| `GET` | `/api/v1/signage/preview/menu` · `/trending` · `/board` | Same shapes as device equivalents, resolved from admin tenant ctx |

**Admin — kiosk config** (JWT, `ADMIN_ROLES`):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/kiosk-config` | Resolved config (outlet row overrides tenant row, defaults filled) |
| `PUT` | `/api/v1/kiosk-config` | Upsert; publishes `KIOSK_CONFIG_UPDATED` |

**WebSocket:** `WS /ws/device?token={device_token}` — devices receive the tenant (+ outlet) broadcast
stream: order events (now carrying `pickup_number`), `PLAYLIST_UPDATED`, `KIOSK_CONFIG_UPDATED`,
and targeted `DEVICE_REVOKED`.

### 2.4 Database Changes

Migration `0009_add_devices_and_signage.py`. Authoritative DDL in `system/data-model.md`.

- New tables: `devices`, `signage_playlists`, `signage_slides`, `kiosk_configs`
  (model file `backend/app/models/device.py`).
- `orders` + `pickup_number INTEGER NULL` — per-tenant daily counter
  (`INCR order:pickup:{tenant_id}:{YYYYMMDD}`, TTL 48 h) assigned to kiosk orders.
- `menu_items` + `allergens JSONB DEFAULT '[]'` (EU FIC 14 canonical codes) and
  `dietary_tags JSONB DEFAULT '[]'`.

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| Kiosk app | `frontend/src/app/kiosk/` | Paired full-screen ordering flow (state machine: pairing→attract→browse→detail→cart→confirm→order-number) |
| Signage app | `frontend/src/app/signage/` | Paired playlist renderer, 6 slide types, offline cache, burn-in shift |
| Pairing screen | `frontend/src/components/device/PairingScreen.tsx` | On-screen keypad code entry (shared) |
| Device API client | `frontend/src/lib/deviceApi.ts` | Axios + `X-Device-Token`; 401/revoked → wipe + repair |
| Device WS hook | `frontend/src/hooks/useDeviceWebSocket.ts` | Backoff reconnect, online state |
| EN/BN strings | `frontend/src/components/device/strings.ts` | Bilingual UI-chrome string table |
| Admin devices | `frontend/src/app/[tenant_slug]/(admin)/devices/page.tsx` | Registry, pairing codes, revoke |
| Admin signage editor | `frontend/src/app/[tenant_slug]/(admin)/signage/page.tsx` (+ `preview/[playlist_id]/`) | Playlist/slide editor + live preview pane |
| Admin kiosk settings | `frontend/src/app/[tenant_slug]/(admin)/kiosk-settings/page.tsx` (+ `preview/`) | Kiosk customization + interactive preview |
| Legacy display page | `frontend/src/app/[tenant_slug]/display/page.tsx` | Superseded → notice + link to paired signage |

**Renderer contract:** every kiosk/signage rendering component is data-source-agnostic (data +
config as props, never calls `deviceApi` directly). The device shells wire them to `/device/*`; the
admin previews wire the same components to the JWT preview endpoints and bind them to unsaved form
state.

### 2.6 Business Rules

Numbered rules live in the module specs; summary:

- **DEV-1..DEV-9** (`modules/devices.md`): token hashed at rest, plaintext shown once; pairing code
  single-use, 600 s TTL, rate-limited 5/min/IP; revocation immediate (Redis auth cache invalidated);
  device scope = its tenant (+ outlet); device endpoints are read-only except kiosk order creation.
- **KSK-1..KSK-8** (`modules/kiosk.md`): counter-pay only (no payment input on device — PCI-DSS out
  of scope); kiosk orders bypass the restaurant-segment-only guest-checkout guard (venue-operated
  hardware, not an anonymous phone); pickup_number assigned at creation; idle timeout with ≥20 s
  extend warning; accessibility + language toggles reset on idle.
- **SGN-1..SGN-7** (`modules/signage.md`): slides filtered by `is_active` + schedule window on the
  client so cached playlists stay correct offline; min slide duration 5 s; playlist resolution
  device.settings.playlist_id → outlet default → tenant default; every content mutation publishes
  `PLAYLIST_UPDATED`.

### 2.7 Standards Compliance

| Requirement | Standard | Implementation point |
|---|---|---|
| Touch targets ≥44 px CSS (we use 48 px) + ≥8 px spacing | WCAG 2.5.8 AA / EN 301 549 §5.5 | Kiosk buttons, keypad, category rail |
| Contrast ≥4.5:1 text, ≥3:1 UI components; tenant brand/accent colour validated, accessible fallback | WCAG 1.4.3 / 1.4.11 | Kiosk theme, slide templates, kiosk-settings colour picker |
| Timeout warning with ≥20 s to extend | WCAG 2.2.1 | Kiosk idle modal |
| No flashing; reduced/pausable motion; static attract under `prefers-reduced-motion` | WCAG 2.3.1 / 2.2.2 | Attract screen, slide crossfades |
| Large-text mode without loss of content | WCAG 1.4.4 | Kiosk accessibility toggle |
| Status messages programmatically announced | WCAG 4.1.3 | `aria-live` on cart, idle warning, confirmation |
| Closed-functionality kiosk provisions (no user AT assumed) | EN 301 549 §8.3 | Built-in large-text/high-contrast; documented limitation |
| 14-allergen pre-purchase disclosure | EU FIC 1169/2011 (reference model) | `menu_items.allergens` → kiosk item detail + signage menu-board legend |
| No cardholder data on kiosk → out of PCI-DSS scope | PCI-DSS v4 scoping | Counter-pay decision; asserted in `system/security.md` |
| Unique, hashed-at-rest, instantly revocable, least-privilege device credentials | OWASP ASVS (device/API credential practices) | ADR-013 |
| Bilingual UI suitability (EN/BN) | ISO 9241-112 | `strings.ts` en/bn tables |

---

## 3. Alternatives Considered

- **JWT device tokens** — rejected; see ADR-013 (long-lived JWTs are effectively unrevocable under
  the existing short-TTL blacklist pattern).
- **Reusing the public `/m/{public_slug}` guest surface for kiosks** — rejected: it is gated by
  `public_menu_enabled` + restaurant segment, carries no device identity (no revocation, no
  per-device rate limits, no outlet binding), and cannot receive targeted pushes.
- **Two RFCs (kiosk, signage)** — rejected: they share the entire registry/pairing/auth/WS
  substrate; splitting doubles spec overhead for a solo developer.
- **Card terminal / wallet payment on kiosk (MVP)** — deferred: counter-pay keeps the entire system
  out of PCI-DSS scope. Wallet-pay via QR handoff to the customer's own phone is a possible later
  phase, still PAN-free.
- **Full i18n library (next-intl)** — deferred: only UI chrome is bilingual (EN/BN) via a string
  table; menu content stays admin-entered. A future full-localization effort can lift the table.

---

## 4. Open Questions

- [x] Payment model → counter-pay only (user decision, 2026-07-15).
- [x] Languages → EN + BN UI chrome only (user decision, 2026-07-15).
- [x] One RFC or two → one, phased (user decision, 2026-07-15).

---

## 5. Implementation Checklist

**SPEC CHANGES FIRST — no code until all spec checkboxes are ticked.**

- [x] `specs/modules/devices.md` created (2026-07-15)
- [x] `specs/modules/kiosk.md` created (2026-07-15)
- [x] `specs/modules/signage.md` created (2026-07-15)
- [x] `specs/modules/websocket.md` updated (`/ws/device`, new events, pickup_number in order events)
- [x] `specs/modules/public-surface.md` updated (shared menu builder, kiosk segment exception)
- [x] `specs/modules/orders.md` updated (OR-12 pickup_number, device order path)
- [x] `specs/modules/menu.md` updated (BR-MENU-4 allergens, dietary_tags)
- [x] `specs/system/data-model.md` updated (4 new tables + 2 column additions)
- [x] `specs/system/security.md` updated (§8a device credential class, PCI scoping statement)
- [x] `specs/decisions/adrs/ADR-013-device-token-auth.md` accepted (2026-07-15)
- [x] `specs/operations/roadmap.md` updated (Phase 25 + sub-phases 25.1–25.6)
- [ ] Alembic migration `0009_add_devices_and_signage.py`
- [ ] Backend implementation (Phases 1, 3, 4, 5 per roadmap)
- [ ] Tests (`backend/tests/test_devices.py` + kiosk/signage coverage)
- [ ] Frontend implementation (Phases 2, 3, 4, 5)
- [ ] CHANGELOG.md updated per phase

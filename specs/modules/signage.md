# Module: Signage (Digital Display Playlists)

**Status:** ✅ Implemented (Phase 25.4/25.5, RFC-010)
**Routers:** signage endpoints on `backend/app/routers/device_api.py` (device auth) ·
`backend/app/routers/signage.py` (admin, JWT, `/api/v1/signage`)
**Frontend:** `frontend/src/app/signage/` · `frontend/src/app/[tenant_slug]/(admin)/signage/`
**Related:** `modules/devices.md`, `modules/kiosk.md`, `modules/menu.md`, `modules/websocket.md`,
`system/data-model.md`, `decisions/rfcs/RFC-010-device-terminals.md`

---

## Overview

A signage display is a paired `device_type='signage'` device rendering a **playlist** — an ordered
list of **slides** that rotate full-screen. Content updates push live over WebSocket; a display that
loses its network keeps rendering its cached playlist. This supersedes the JWT-authenticated
prototype at `[tenant_slug]/display` (RFC-007), which becomes a notice + link to the paired flow.

### Slide types

| `slide_type` | Renders | `config` JSONB |
|---|---|---|
| `menu_board` | Auto-laid-out menu (categories/items, prices, allergen abbreviations + legend) | `{category_ids?: UUID[], vendor_id?: UUID}` — empty = full menu |
| `promo_image` | Full-bleed image with optional overlay text | `{image_url, headline_en?, headline_bn?, caption?}` |
| `announcement` | Large typographic text card | `{title_en, title_bn?, body_en?, body_bn?}` |
| `order_status_board` | Live "Preparing / Ready" columns of pickup numbers | `{ready_expiry_minutes?: 10}` |
| `trending_items` | Top sellers (rank badge, image, name, price) | `{window_days: 7, limit: 5, title_en?, title_bn?}` |
| `offers` | Grid of admin-built offer cards | `{offers: [{menu_item_id?, title_en, title_bn?, subtitle?, price_text?, image_url?}]}` |

Every slide: `position` (int, playlist order), `duration_seconds` (int, **min 5**, default 10),
`active_from`/`active_until` (nullable timestamptz schedule window), `is_active`.

---

## API Endpoints — Device-Facing (device auth, signage only — DEV-8)

### `GET /device/playlist`
Resolution order (SGN-3): `device.settings.playlist_id` → outlet default → tenant default → `404`
if none. Returns the playlist with **all** its active slides *including* schedule windows — the
client filters by window at render time so a cached playlist stays correct offline (SGN-2):

```jsonc
{
  "playlist_id": "...", "name": "Main hall", "updated_at": "...",
  "slides": [
    {"slide_id": "...", "slide_type": "menu_board", "position": 0, "duration_seconds": 12,
     "config": {}, "active_from": null, "active_until": null}
  ]
}
```

### `GET /device/orders/board`
Seeds the order-status slide: open (`status IN (pending_confirmation, confirmed, preparing, ready)`)
kiosk + guest orders with a `pickup_number`, within device scope, last 24 h:
`{orders: [{order_id, pickup_number, status}]}`. Live updates then arrive over `/ws/device`.
`Cache-Control: no-store`.

### `GET /device/trending?window_days=7&limit=5`
Top-N menu items by summed quantity from `order_items` joined to non-cancelled orders within the
window, device-scoped. `window_days` 1–30, `limit` 1–10. Redis cache
`device:trending:{tenant_id}:{window_days}:{limit}`, TTL 600 s. Returns
`{items: [{item_id, name, image_url, price, quantity_sold, rank}]}`.

---

## API Endpoints — Admin (`/api/v1/signage`, JWT, `ADMIN_ROLES`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/signage/playlists` | `{name, outlet_id?, is_default?}` |
| `GET` | `/signage/playlists` | Accessible-tenant scope; includes slide counts + assigned device names |
| `PATCH` | `/signage/playlists/{playlist_id}` | name, `is_default` (SGN-4), `is_active` |
| `DELETE` | `/signage/playlists/{playlist_id}` | Cascades slides; devices pointing at it fall back per SGN-3 |
| `POST` | `/signage/playlists/{playlist_id}/slides` | `{slide_type, config, duration_seconds?, position?, active_from?, active_until?}` |
| `PATCH` | `/signage/slides/{slide_id}` | Any slide field |
| `DELETE` | `/signage/slides/{slide_id}` | — |
| `PUT` | `/signage/playlists/{playlist_id}/slides/reorder` | `{slide_ids: UUID[]}` → rewrites positions |
| `GET` | `/signage/playlists/{playlist_id}/preview` | Same shape as `/device/playlist` (SGN-6) |
| `GET` | `/signage/preview/menu` · `/signage/preview/trending` · `/signage/preview/board` | Same shapes as device equivalents, resolved from admin tenant ctx |

Every playlist/slide mutation publishes `PLAYLIST_UPDATED {playlist_id}` on the tenant channel
(SGN-5).

---

## Display Runtime (frontend `app/signage/`)

- Pairing screen → renderer loop: slides filtered by `is_active` + schedule window, advanced by
  `duration_seconds`, **crossfade only** (no motion-heavy transitions; nothing flashes — WCAG 2.3.1).
- **Offline resilience (SGN-2):** persist last playlist + menu JSON in `localStorage`; render from
  cache on boot; on WS loss show a small corner "reconnecting" glyph and poll `/device/playlist`
  every 5 min as fallback; WS reconnect with exponential backoff 1 s → 30 s.
- **Order-status slide:** seeded by `/device/orders/board`, then driven by order WS events (matched
  on `pickup_number`); entries leave "Ready" after `ready_expiry_minutes` (default 10).
- **Burn-in mitigation:** whole-canvas 1–2 px translate shuffle every 5 min.
- `PLAYLIST_UPDATED` → re-fetch playlist; `DEVICE_REVOKED` (targeted) → wipe token, back to pairing.

## Admin Editor + Preview

`[tenant_slug]/(admin)/signage/page.tsx`: playlist list; slide cards with drag reorder; per-type
config forms (menu-board category picker, offer-card builder with menu-item picker, trending
window/limit, schedule-window pickers); **side-by-side live preview pane** — the real slide
components in a scaled 16:9 frame bound to unsaved form state (SGN-6); "Full-screen preview" →
`(admin)/signage/preview/[playlist_id]/`.

---

## Business Rules

### SGN-1: Minimum Slide Duration
`duration_seconds ≥ 5` (server-validated). Signage is non-interactive, so auto-rotation is exempt
from WCAG 2.2.2 pause requirements — but the kiosk attract screen (interactive surface) is not; see
`modules/kiosk.md`.

### SGN-2: Cached Playlists Must Stay Correct Offline
The playlist payload includes schedule windows and the client filters at render time — a display cut
off from the network never shows an expired scheduled slide, and keeps rotating everything else.

### SGN-3: Playlist Resolution
`device.settings.playlist_id` (explicit assignment) → default playlist for the device's outlet →
default playlist for the tenant → `404` (display shows "No content assigned" with the device name,
so staff can fix it from the admin page).

### SGN-4: One Default Per Scope
At most one `is_default=TRUE` playlist per (tenant_id, outlet_id) — enforced by partial unique
index; setting a new default clears the previous one in the same transaction.

### SGN-5: Content Mutations Push Live
Every playlist/slide create/update/delete/reorder publishes `PLAYLIST_UPDATED` so connected displays
re-fetch within seconds — no reboots, no manual refresh.

### SGN-6: Preview Renders the Real Components
The admin preview pane and full-screen preview use the identical slide components as the display
runtime (renderer contract, RFC-010 §2.5), fed by the JWT preview endpoints; the pane binds to
unsaved form state so edits are visible before saving.

### SGN-7: Board Shows Numbers, Never Identities
The order-status slide displays `pickup_number` and status only — never guest names, phone numbers,
or order contents (it's a public wall display).

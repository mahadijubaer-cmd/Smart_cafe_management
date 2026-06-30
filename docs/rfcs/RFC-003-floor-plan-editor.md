# RFC-003: Visual Table / Seat Formation Editor

**Date:** 2026-06-30  
**Author:** Mahadi Jubaer  
**Status:** Accepted  
**Related spec files:** spec/04-api-reference.md, spec/06-business-rules.md, spec/07-frontend.md, spec/08-workflows.md

---

## 1. Motivation

The `tables_map` table already has `position_x`, `position_y`, `zone`, and `capacity` columns intended for visual floor plan management. However, there is no admin page at `/[slug]/(admin)/tables` — this path returns 404.

Tenant admins currently cannot:
- See all their tables in one view with live statuses
- Add, remove, or rename tables
- Rearrange the physical floor layout
- Assign zones (indoor, outdoor, VIP)
- Manage capacity per table

This is a critical missing feature — admins manage table assignments through the dashboard widget, which is read-only.

---

## 2. Proposed Design

### 2.1 Overview

Create `/[slug]/(admin)/tables` with two modes:
1. **Live Status View** (default) — real-time color-coded table map + cleaner assignment
2. **Layout Editor** (toggled via "Edit Layout" button) — drag-and-drop table positioning

### 2.2 Live Status View

- Full-width status grid using the existing `ActiveTableMap` component (promoted from dashboard widget to full page)
- Zone tabs for filtering (Indoor / Outdoor / VIP / All)
- Color legend: Available (emerald) / Reserved (amber) / Occupied (rose) / Cleaning (sky blue)
- WebSocket `TABLE_STATUS_CHANGED` events update the view in real-time
- Click any table → `TableDetailPanel` slide-over shows:
  - Current status
  - Active order (if any): order ID, customer name, items
  - Last cleaned at
  - "Assign Cleaner" button → opens cleaner selection dropdown
  - "Change Status" dropdown

### 2.3 Layout Editor

Activated by clicking "Edit Layout" button (toggle mode).

**Canvas:** 12 columns × 8 rows CSS grid  
**Draggable items:** Each table rendered as a draggable card using `@dnd-kit/core`  
**Snap-to-grid:** Tables snap to the nearest cell on drop  
**Table card shows:** table_number, zone badge, capacity indicator

**Toolbar:**
- "+ Add Table" → POST /tables/ with default values, then immediately enters edit mode for that table
- "Save Layout" → PATCH /tables/layout (batch update all positions)
- "Cancel" → discard unsaved position changes (reset to last saved)
- Zone filter dropdown

**Click table in editor → inline edit popover:**
- Change table_number
- Change zone (dropdown: indoor / outdoor / VIP / food-court / custom)
- Change capacity (number input)
- Delete table (disabled if active orders exist)

### 2.4 New API Endpoints

#### `PUT /api/v1/tables/{table_id}`
Auth: Required | Roles: Admin roles  
Body:
```json
{
  "table_number": "T-12",
  "zone": "outdoor",
  "capacity": 6,
  "position_x": 3,
  "position_y": 2
}
```
Response `200`: Updated table object

#### `PATCH /api/v1/tables/layout`
Auth: Required | Roles: Admin roles  
Purpose: Batch update positions — called when "Save Layout" is clicked  
Body:
```json
[
  { "table_id": "...", "position_x": 2, "position_y": 1, "zone": "indoor", "capacity": 4 },
  { "table_id": "...", "position_x": 3, "position_y": 1, "zone": "indoor", "capacity": 4 }
]
```
Response `200`: Array of all updated table objects

#### `DELETE /api/v1/tables/{table_id}`
Auth: Required | Roles: Admin roles  
Rules: Returns `400` if any active (non-delivered, non-cancelled) orders reference this table  
Response `204`

### 2.5 Database Changes

None. All required columns (`position_x`, `position_y`, `zone`, `capacity`) already exist.

### 2.6 Frontend Changes

| File | Change |
|---|---|
| `src/app/[tenant_slug]/(admin)/tables/page.tsx` | NEW — main page with mode toggle |
| `src/components/admin/FloorPlanEditor.tsx` | NEW — drag-and-drop canvas |
| `src/components/admin/TableCard.tsx` | NEW — individual table card (editable mode) |
| `src/components/admin/TableDetailPanel.tsx` | NEW — slide-over panel |
| `src/components/admin/ZoneFilter.tsx` | NEW — zone filter tabs |
| `src/hooks/useTableLayout.ts` | NEW — manages drag state, dirty flag, save/cancel |

**New dependency to add:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

### 2.7 New Business Rules

- **Rule TR-1:** A table cannot be deleted if it has any order with status in `{pending, confirmed, preparing, ready}`.
- **Rule TR-2:** `position_x` must be in range 0–11. `position_y` must be in range 0–7. Values outside this range are rejected with `400`.
- **Rule TR-3:** Two tables in the same tenant cannot have the same `(position_x, position_y)` pair. The batch layout update rejects duplicate positions with `400`.

---

## 3. Alternatives Considered

**SVG canvas instead of CSS grid:** More flexible positioning but significantly more complex implementation. CSS grid snap-to-grid is sufficient for a cafeteria floor plan.

**Immediate save on drag (no Save/Cancel):** Risky — accidental drags would permanently move tables. The Save/Cancel pattern is standard for layout editors.

---

## 4. Open Questions

- [x] Should mobile devices support the layout editor? Decision: Layout editor is desktop-only (show info message on mobile). Live status view works on all screen sizes.
- [x] Should zones be a fixed list or free text? Decision: Offer common presets (indoor, outdoor, VIP, food-court) but allow custom text.
- [ ] Maximum number of tables per tenant? (No limit for now; UI will scroll for large floor plans)

---

## 5. Implementation Checklist

- [x] spec/04-api-reference.md updated (PUT, PATCH /layout, DELETE)
- [x] spec/06-business-rules.md updated (TR-1, TR-2, TR-3)
- [x] spec/07-frontend.md updated
- [ ] `PUT /tables/{table_id}` implemented
- [ ] `PATCH /tables/layout` implemented (in a single DB transaction)
- [ ] `DELETE /tables/{table_id}` implemented with active-order guard
- [ ] `@dnd-kit` added to `package.json`
- [ ] `FloorPlanEditor` with 12×8 grid and drag-and-drop
- [ ] `TableDetailPanel` with cleaner assignment action
- [ ] `useTableLayout` hook with dirty/save/cancel state
- [ ] Tests: layout batch update, delete blocked by active orders, position range validation
- [ ] CHANGELOG.md updated

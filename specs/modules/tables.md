# Module: Tables

**Router:** `backend/app/routers/tables.py`  
**Schemas:** `backend/app/schemas/table.py`  
**Last verified:** 2026-06-30

---

## Overview

Manages the physical tables (seats) in a tenant's venue. Each table has a status that changes in real time based on orders and cleaning. `table_id` is a SERIAL INTEGER — not a UUID.

---

## API Endpoints

### `GET /api/v1/tables/`

**Auth:** Required | **Roles:** All authenticated

**Query params:** `?zone=indoor&status=available`

**Response `200`:** `list[TableResponse]`

```json
[
  {
    "table_id": 1,
    "table_number": "T-01",
    "zone": "indoor",
    "capacity": 4,
    "status": "available",
    "position_x": 2,
    "position_y": 3
  }
]
```

> `table_id` is an INTEGER. There is NO `last_cleaned_at` field on `TableResponse`.

---

### `POST /api/v1/tables/`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `TableCreate`

| Field | Type | Required | Default |
|---|---|---|---|
| `table_number` | str | Yes | — |
| `zone` | str | No | `"indoor"` |
| `capacity` | int | Yes | — |
| `position_x` | int \| null | No | null |
| `position_y` | int \| null | No | null |

**Response `201`:** `TableResponse`

---

### `PATCH /api/v1/tables/{table_id}/status`

**Auth:** Required | **Roles:** Admin roles, `staff`, `cleaner`, `server`

**Request body:** `TableUpdateStatus`

| Field | Type | Required | Valid values |
|---|---|---|---|
| `status` | str | Yes | `available \| reserved \| occupied \| cleaning` |

**Side effects:**
- When transitioning TO `cleaning`: publishes `TABLE_UPDATE` WebSocket event
- When transitioning FROM `cleaning` TO `available`: publishes `TABLE_CLEAN` WebSocket event

**Response `200`:** `TableResponse`

---

### `PUT /api/v1/tables/{table_id}` ❌ [Phase 16 — Not yet implemented]

Full table record update (for floor plan editor).

**Response `200`:** `TableResponse`

---

### `PATCH /api/v1/tables/layout` ❌ [Phase 16 — Not yet implemented]

Batch update of `position_x`, `position_y`, `zone`, `capacity` for all tables (floor plan drag-and-drop save).

**Request body:** `list[{ table_id, position_x, position_y, zone, capacity }]`

**Response `200`:** `list[TableResponse]`

---

### `DELETE /api/v1/tables/{table_id}` ❌ [Phase 16 — Not yet implemented]

**Rules:** `400` if any active (non-delivered, non-cancelled) orders exist for this table.

**Response `204`**

---

## Pydantic Schemas

### `TableCreate`
```python
class TableCreate(BaseModel):
    table_number: str
    zone: str = "indoor"
    capacity: int
    position_x: int | None = None
    position_y: int | None = None
```

### `TableUpdateStatus`
```python
class TableUpdateStatus(BaseModel):
    status: str    # "available"|"reserved"|"occupied"|"cleaning"
```

### `TableResponse`
```python
class TableResponse(BaseModel):
    table_id: int        # SERIAL INTEGER, not UUID
    table_number: str
    zone: str
    capacity: int
    status: str
    position_x: int | None
    position_y: int | None
    # NOTE: There is NO last_cleaned_at field
```

---

## Table Status Values

| Status | Meaning |
|---|---|
| `available` | Empty and clean; can be reserved or scanned |
| `reserved` | A customer has scanned the QR or claimed it |
| `occupied` | Customer is seated and has active orders |
| `cleaning` | Customer left; assigned to a cleaner |

---

## Floor Plan Grid

Tables have `position_x` (column) and `position_y` (row) on a 12-column × 8-row virtual grid.  
This grid is rendered by the Phase 16 floor plan editor in the admin panel.  
Default for new tables: `position_x=0`, `position_y=0`.

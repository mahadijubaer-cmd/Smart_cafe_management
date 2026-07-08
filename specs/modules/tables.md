# Module: Tables

**Router:** `backend/app/routers/tables.py`  
**Schemas:** `backend/app/schemas/table.py`  
**Last verified:** 2026-07-08

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

**Auth:** Required | **Roles:** Admin roles only

✅ [2026-07-08 — corrected] Previously documented here as also open to `staff`/`cleaner`/`server`,
but the router (`require_role(*ADMIN_ROLES)`) has never allowed that — this was stale
documentation, not a code bug. Those roles don't need direct access to this endpoint because they
have their own purpose-built flows that move a table through the same statuses: `cleaner` completes
cleaning via `PATCH /cleaners/logs/{id}/complete` (`modules/cleaners.md`), `occupied` is set
automatically by `order_service` when an order is placed, and `reserved` is set by the customer via
`POST /tables/reserve`. This raw admin endpoint is a manual override tool.

**Request body:** `TableUpdateStatus`

| Field | Type | Required | Valid values |
|---|---|---|---|
| `status` | `TableStatus` enum | Yes | `available \| reserved \| occupied \| cleaning` |

✅ [2026-07-08] `status` is now a real `TableStatus` enum field (`backend/app/schemas/table.py`), not
a bare `str` — an invalid value now correctly gets a `422` from FastAPI before it ever reaches the
DB. Previously it was typed as plain `str`, so an invalid value (e.g. `"banana_status"`) sailed
through validation and crashed with an unhandled `asyncpg.exceptions.InvalidTextRepresentationError`
→ raw `500` (the Postgres `tablestatus` enum column rejected it, but nothing caught that). See
BR-TABLE-1 below.

**Side effects:**
- When transitioning TO `cleaning`: publishes `TABLE_UPDATE` WebSocket event
- When transitioning FROM `cleaning` TO `available`: publishes `TABLE_CLEAN` WebSocket event

**Response `200`:** `TableResponse`

---

### `PUT /api/v1/tables/{table_id}` ✅ [Implemented — spec previously said Phase 16 "not yet implemented"; corrected 2026-07-08]

Full table record update (for floor plan editor). **Roles:** Admin roles.

**Request body:** `TableUpdate` — `table_number`, `zone`, `capacity`, `position_x` (`0-11`),
`position_y` (`0-7`), all required (full replacement, despite the PUT verb needing every field).

**Response `200`:** `TableResponse`

---

### `PATCH /api/v1/tables/layout` ✅ [Implemented — spec previously said Phase 16 "not yet implemented"; corrected 2026-07-08]

Batch update of `position_x`, `position_y`, `zone`, `capacity` for all tables (floor plan drag-and-drop save). **Roles:** Admin roles. Declared before `/{table_id}` routes to avoid routing ambiguity with the path param.

**Request body:** `TableLayoutBatch` = `{ "tables": list[{ table_id, position_x, position_y, zone, capacity }] }`

**Rules:**
- TR-3: `400 "Duplicate table position in batch"` if two items in the same batch share `(position_x, position_y)`.
- `403 "Table {id} not accessible"` if any `table_id` doesn't exist or belongs to a different tenant.
- All updates applied in one transaction (`db.begin_nested()`).

**Response `200`:** `list[TableResponse]`

---

### `DELETE /api/v1/tables/{table_id}` ✅ [Implemented — spec previously said Phase 16 "not yet implemented"; corrected 2026-07-08]

**Roles:** Admin roles.

**Rules (TR-1):** `400 "Table has active orders and cannot be deleted"` if any order for this table
has status `pending`/`confirmed`/`preparing`/`ready`.

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
    status: TableStatus = TableStatus.available   # ✅ [2026-07-08] real enum, not bare str
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

## Business Rules

### BR-TABLE-1: Status Values Are Validated Before Reaching the DB
✅ [2026-07-08 — cafeteria-admin sweep]. `PATCH /tables/{table_id}/status`'s `status_data.status` is
typed as the `TableStatus` enum (`app/models/table.py`) rather than a bare `str`. An invalid value
now gets a clean `422 Unprocessable Entity` from FastAPI's request validation. Previously (bare
`str`), an invalid value passed validation and crashed with an unhandled
`asyncpg.exceptions.InvalidTextRepresentationError` (`invalid input value for enum tablestatus: ...`)
→ raw `500`, since the Postgres `tablestatus` column enum was the only thing rejecting it, uncaught.

### TR-1: Table Deletion Blocked by Active Orders
`DELETE /tables/{table_id}` rejects with `400` if the table has any order in
`pending`/`confirmed`/`preparing`/`ready` status.

### TR-3: Layout Batch Rejects Duplicate Positions
`PATCH /tables/layout` rejects the whole batch with `400` if two items request the same
`(position_x, position_y)` — prevents two tables silently landing on the same grid cell.

---

## Floor Plan Grid

Tables have `position_x` (column) and `position_y` (row) on a 12-column × 8-row virtual grid.  
This grid is rendered by the Phase 16 floor plan editor in the admin panel.  
Default for new tables: `position_x=0`, `position_y=0`.

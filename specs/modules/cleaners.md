# Module: Cleaners

**Router:** `backend/app/routers/cleaners.py`  
**Schemas:** `backend/app/schemas/cleaner.py`  
**Service:** `backend/app/services/cleaner_service.py`  
**DB table:** `cleaner_logs`  
**Last verified:** 2026-06-30

---

## Overview

Manages table-cleaning assignments. Admins assign a cleaner to a dirty table; the cleaner marks it done when finished. Assignment creates two WebSocket events: `TABLE_UPDATE` (table status → cleaning) and `CLEAN_ASSIGNED` (notification to the specific cleaner). Completion creates `TABLE_CLEAN` (table available again).

---

## API Endpoints

### `GET /api/v1/cleaners/logs`

**Auth:** Required  
**Roles:** Admin roles → see all logs in tenant; `cleaner` → see own assignments only

**Query params:** `?status=pending`

**Response `200`:**
- For admin roles: `list[CleanerAssignmentAdminResponse]` (includes `cleaner` user object)
- For `cleaner` role: `list[CleanerAssignmentResponse]` (includes only `table` object)

**Admin response example:**
```json
[
  {
    "log_id": "3fa85f64-...",
    "cleaner_id": "...",
    "table_id": 5,
    "triggered_by_order": null,
    "status": "assigned",
    "assigned_at": "2026-06-30T12:00:00Z",
    "cleaned_at": null,
    "table": { "table_id": 5, "table_number": "T-05", "zone": "indoor", "status": "cleaning" },
    "cleaner": { "user_id": "...", "full_name": "Bob Cleaner", "email": "cleaner1@bracu.scms" }
  }
]
```

---

### `POST /api/v1/cleaners/logs`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `CleanerAssignmentCreate`

| Field | Type | Required |
|---|---|---|
| `table_id` | int | Yes (SERIAL integer) |
| `cleaner_id` | UUID | Yes |

**Validations:**
- `table_id` must exist in tenant
- `cleaner_id` user must have `role=cleaner` and belong to this tenant

**Side effects:**
1. Sets `table.status = cleaning` → publishes `TABLE_UPDATE` WebSocket event
2. Creates `cleaner_logs` record
3. Publishes `CLEAN_ASSIGNED` WebSocket event (targeted to the cleaner)

**Response `201`:** `CleanerAssignmentAdminResponse`

---

### `PATCH /api/v1/cleaners/logs/{log_id}/complete`

**Auth:** Required  
**Roles:** `cleaner` (own assignment only), Admin roles

**Validations:**
- If role is `cleaner`: `log.cleaner_id` must match `current_user.user_id`
- Log must not already have `status=done`

**Side effects:**
1. Sets `log.status = done`, `log.cleaned_at = now()`
2. Sets `table.status = available`
3. Publishes `TABLE_CLEAN` WebSocket event
4. If `log.triggered_by_order` is set: also publishes `MEAL_DONE` event

**Response `200`:** `{ "status": "done", "cleaned_at": "2026-06-30T12:15:00Z" }`

---

## Pydantic Schemas

### `CleanerAssignmentCreate`
```python
class CleanerAssignmentCreate(BaseModel):
    table_id: int     # SERIAL integer
    cleaner_id: UUID
```

### `CleanerAssignmentResponse`
```python
class CleanerAssignmentResponse(BaseModel):
    log_id: UUID
    cleaner_id: UUID
    table_id: int
    triggered_by_order: UUID | None
    status: str               # assigned|in_progress|done
    assigned_at: datetime
    cleaned_at: datetime | None
    table: TableResponse
```

### `CleanerAssignmentAdminResponse`
All fields from `CleanerAssignmentResponse` PLUS:
```python
    cleaner: UserResponse     # Full cleaner user object
```

---

## Cleaner Assignment Statuses

| Status | Meaning |
|---|---|
| `assigned` | Admin has assigned; cleaner has not yet acknowledged |
| `in_progress` | Cleaner is actively cleaning (optional intermediate state) |
| `done` | Cleaning complete; table is available |

---

## WebSocket Events Emitted

| Event | When | Payload includes |
|---|---|---|
| `TABLE_UPDATE` | POST /cleaners/logs (table → cleaning) | `table_id`, `table_number`, `status: "cleaning"` |
| `CLEAN_ASSIGNED` | POST /cleaners/logs (targeted notification) | `log_id`, `table_id`, `table_number`, `target_cleaner_id` |
| `TABLE_CLEAN` | PATCH /cleaners/logs/{id}/complete | `table_id`, `table_number`, `status: "available"` |
| `MEAL_DONE` | PATCH /cleaners/logs/{id}/complete (if triggered by order) | `order_id`, `table_id` |

See `modules/websocket.md` for full payload formats.

---

## Triggered Cleaning

When `PATCH /orders/{id}/complete` is called (customer signals they have finished eating):
- The server creates a `cleaner_logs` record with `triggered_by_order = order_id`
- Assigns to an available cleaner (service-level logic)
- Emits `CLEAN_ASSIGNED` to the cleaner
- When the cleaner completes: emits both `TABLE_CLEAN` AND `MEAL_DONE`

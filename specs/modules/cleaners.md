# Module: Cleaners

**Router:** `backend/app/routers/cleaners.py`  
**Schemas:** `backend/app/schemas/cleaner.py`  
**Service:** `backend/app/services/cleaner_service.py`  
**DB table:** `cleaner_logs`  
**Last verified:** 2026-07-16

---

## Overview

Manages table-cleaning assignments. **There is no manual "admin assigns a cleaner" action** —
assignment is entirely automatic, triggered when a customer signals they've finished eating
(`PATCH /orders/{order_id}/complete`, `modules/orders.md`). The server picks the least-busy active
cleaner in the tenant and creates the assignment; the cleaner then starts and completes it
themselves. See "Automatic Assignment" below for the full trigger → pick → notify flow.

> **✅ Corrected 2026-07-16 (QA browser pass) — this section previously documented a
> `POST /cleaners/logs` admin-assignment endpoint that was never implemented, and route paths
> (`/cleaners/logs`) that don't match the real router (`/cleaners/assignments`). The admin UI had a
> "Assign Cleaner" button wired to a *third*, also-nonexistent path (`POST /cleaners/logs/`,
> missing `cleaner_id` in its payload besides), which 404'd on every click — removed, since manual
> assignment isn't a real capability of this system. Endpoints below now match
> `backend/app/routers/cleaners.py` exactly.**

---

## API Endpoints

### `GET /api/v1/cleaners/assignments`

**Auth:** Required | **Roles:** `cleaner`

Returns the calling cleaner's own **active** (not yet `done`) assignments only — there is no
`?status=` filter; completed assignments simply drop out of this list once marked done.

**Response `200`:** `list[CleanerAssignmentResponse]` (includes the `table` object, not `cleaner` —
a cleaner already knows who they are)

```json
[
  {
    "log_id": "3fa85f64-...",
    "cleaner_id": "...",
    "table_id": 5,
    "triggered_by_order": "...",
    "status": "assigned",
    "assigned_at": "2026-06-30T12:00:00Z",
    "cleaned_at": null,
    "table": { "table_id": 5, "table_number": "T-05", "zone": "indoor", "status": "cleaning" }
  }
]
```

---

### `PATCH /api/v1/cleaners/assignments/{log_id}/start`

**Auth:** Required | **Roles:** `cleaner` (own assignment only — `403` otherwise)

Cleaner acknowledges they've begun cleaning.

**Side effects:**
1. Sets `log.status = in_progress`
2. Sets `table.status = cleaning`
3. Publishes `TABLE_UPDATE` WebSocket event (`status: "cleaning"`)

**Response `200`:** `CleanerAssignmentResponse`

**Errors:** `404` unknown log (or wrong tenant) | `403` not this cleaner's assignment

---

### `PATCH /api/v1/cleaners/assignments/{log_id}/done`

**Auth:** Required | **Roles:** `cleaner` (own assignment only — `403` otherwise)

**Side effects:**
1. Sets `log.status = done`, `log.cleaned_at = now()`
2. Sets `table.status = available`
3. Publishes `TABLE_CLEAN` WebSocket event

**Response `200`:** `CleanerAssignmentResponse`

**Errors:** `404` unknown log (or wrong tenant) | `403` not this cleaner's assignment

---

### `GET /api/v1/cleaners/assignments/all`

**Auth:** Required | **Roles:** Admin roles

Read-only visibility into every assignment (any status) in the tenant — the admin-facing
counterpart to the cleaner's own list. No admin action originates from this endpoint.

**Query params:** `?status=assigned|in_progress|done`

**Response `200`:** `list[CleanerAssignmentAdminResponse]` (includes both `cleaner` and `table`
objects)

---

## Pydantic Schemas

There is no create/request schema — assignments are never constructed from a client payload (see
Overview). Only response schemas exist, in `backend/app/schemas/cleaner.py`:

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
| `assigned` | Auto-assigned by the server; cleaner has not yet acknowledged |
| `in_progress` | Cleaner has called `.../start`; actively cleaning |
| `done` | Cleaner has called `.../done`; cleaning complete, table available |

---

## WebSocket Events Emitted

| Event | When | Payload includes |
|---|---|---|
| `TABLE_UPDATE` | order complete → auto-assignment created (table → cleaning); also on `.../start` | `table_id`, `table_number`, `status: "cleaning"` |
| `CLEAN_ASSIGNED` | order complete → auto-assignment created (targeted to the picked cleaner) | `log_id`, `table_id`, `table_number`, `target_cleaner_id` |
| `TABLE_CLEAN` | PATCH /cleaners/assignments/{id}/done | `table_id`, `table_number`, `status: "available"` |
| `MEAL_DONE` | Same trigger as `CLEAN_ASSIGNED` — broadcast to admin roles, not the cleaner | `order_id`, `table_id` |

See `modules/websocket.md` for full payload formats.

---

## Automatic Assignment

Triggered by `PATCH /orders/{order_id}/complete` (`modules/orders.md`) — the customer signaling
they've finished eating. As a background task, `order_service.complete_meal` calls
`CleanerService.assign_cleaner(db, table_id, order_id, tenant_id)`, which:

1. Loads all active `cleaner` users in the tenant
2. Picks the least-busy one: `min(cleaners, key=lambda c: (active_assignment_count, created_at, user_id))`
3. Creates a `cleaner_logs` record with `triggered_by_order = order_id`, `status = assigned`
4. Sets the table to `cleaning`
5. Publishes `CLEAN_ASSIGNED` to the picked cleaner and `MEAL_DONE` to admin roles (tenant broadcast)

There is no path — API or UI — for an admin to pick a specific cleaner or table manually.

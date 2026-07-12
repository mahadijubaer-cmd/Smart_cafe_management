# Module: Notifications

**Router:** `backend/app/routers/notifications.py`
**Model:** `Notification` in `backend/app/models/models.py`
**Last verified:** 2026-07-11

---

## Overview

Per-user notification inbox. Notifications are created server-side by other services (e.g.
`order_service.py` writes an `ORDER_PLACED` notification) — there is no endpoint to create a
notification directly; this module only owns reading and marking-read.

---

## API Endpoints

### `GET /api/v1/notifications`

**Auth:** Required | **Roles:** Any authenticated

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `skip` | int | 0 | Pagination offset |
| `limit` | int | 20 | Max 50 (silently clamped) |
| `unread_only` | bool | false | Filter to unread notifications only |

**Response `200`:**

```json
{
  "items": [
    {
      "notif_id": "3fa85f64-...",
      "type": "ORDER_PLACED",
      "message": "Your order #1042 has been placed.",
      "is_read": false,
      "created_at": "2026-07-11T10:00:00Z"
    }
  ],
  "total": 12,
  "unread_count": 3
}
```

Ordered newest-first (`created_at DESC`). Scoped strictly to `current_user.user_id` — never
tenant-wide.

---

### `PATCH /api/v1/notifications/{notification_id}/read`

**Auth:** Required | **Roles:** Any authenticated

Marks a single notification as read. `notification_id` must belong to the calling user →
`404 "Notification not found"` otherwise (cross-user existence is never revealed).

**Response `200`:** `{ "read": true }`

---

### `POST /api/v1/notifications/read-all`

**Auth:** Required | **Roles:** Any authenticated

Marks every unread notification belonging to the calling user as read in one bulk `UPDATE`.

**Response `200`:** `{ "marked_read": <count> }`

---

## Notes

- `type` is a free-form string (e.g. `"ORDER_PLACED"`), not a DB-enforced enum.
- `message` is the only content column — there is no separate `title`/`body` split (see
  `system/data-model.md`).

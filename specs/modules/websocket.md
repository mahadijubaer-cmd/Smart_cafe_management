# Module: WebSocket

**Router:** `backend/app/routers/websocket.py`  
**Pub/sub service:** `backend/app/services/ws_pubsub.py`  
**Connection manager:** `backend/app/services/websocket_manager.py`  
**Last verified:** 2026-06-30

---

## Overview

Real-time bidirectional communication between the backend and connected clients. Uses Redis pub/sub for horizontal scaling — each backend instance subscribes to Redis channels and forwards messages to locally connected WebSocket clients. The client only receives; it can send PING to keep the connection alive.

---

## Connection

**URL:** `ws://host/ws/{user_id}?token={jwt}`

- `{user_id}`: UUID of the connecting user
- `token`: valid JWT access token (NOT Bearer prefix — raw JWT string in query param)

**Server validation on connect:**
1. JWT signature and expiry (HS256, `SECRET_KEY`)
2. JWT `jti` not in Redis blacklist
3. `user_id` in URL path matches JWT `sub` claim
4. If any check fails: connection is rejected immediately (code 1008 Policy Violation)

**After successful connect:**
- Connection registered in `ConnectionManager` keyed by `(tenant_id, outlet_id)` from JWT
- Background asyncio task `subscribe_and_forward()` starts, listening to Redis channels

---

## Redis Pub/Sub Channels

| Channel | Audience |
|---|---|
| `ws:channel:{tenant_id}` | All connections in the tenant |
| `ws:channel:{tenant_id}:{outlet_id}` | Connections for one specific outlet |

Publishers call:
```python
await publish_event(tenant_id, event_dict, outlet_id=None)
# outlet_id set → publishes to both tenant channel AND outlet channel
```

---

## Message Format

**All messages are flat JSON with a `type` field.**

There is NO `{"event": "...", "data": {...}}` wrapper. The type is at the top level.

```json
{ "type": "ORDER_PLACED", "order_id": "...", "table_id": 5, ... }
```

---

## PING / PONG

Client sends:
```json
{ "type": "PING" }
```

Server responds:
```json
{ "type": "PONG" }
```

Use this to keep connections alive and detect stale connections.

---

## All Event Types

### `ORDER_PLACED`
Emitted by: `POST /orders/`  
Audience: All connections in `ws:channel:{tenant_id}` (staff, admin, kitchen)

```json
{
  "type": "ORDER_PLACED",
  "order_id": "3fa85f64-...",
  "user_id": "...",
  "table_id": 5,
  "total_amount": "240.00",
  "time_slot": "2026-06-30T13:00:00Z",
  "item_count": 2
}
```

### `ORDER_CONFIRMED`
Emitted by: `PATCH /orders/{id}/status` → status=`confirmed`  
Audience: `ws:channel:{tenant_id}` — targeted to ordering user via `target_user_id`

```json
{
  "type": "ORDER_CONFIRMED",
  "order_id": "...",
  "target_user_id": "..."
}
```

### `ORDER_PREPARING`
Emitted by: `PATCH /orders/{id}/status` → status=`preparing`

```json
{
  "type": "ORDER_PREPARING",
  "order_id": "...",
  "target_user_id": "..."
}
```

### `ORDER_READY`
Emitted by: `PATCH /orders/{id}/status` → status=`ready`

```json
{
  "type": "ORDER_READY",
  "order_id": "...",
  "target_user_id": "..."
}
```

### `ORDER_DELIVERED`
Emitted by: `PATCH /orders/{id}/status` → status=`delivered`

```json
{
  "type": "ORDER_DELIVERED",
  "order_id": "...",
  "target_user_id": "..."
}
```

### `ORDER_CANCELLED`
Emitted by: `DELETE /orders/{id}` or `PATCH /orders/{id}/status` → status=`cancelled`

```json
{
  "type": "ORDER_CANCELLED",
  "order_id": "...",
  "target_user_id": "..."
}
```

### `ORDER_PAID` ✅ [Phase 22 — Implemented 2026-07-05] (RFC-007 Phase 2)
Emitted by: `POST /public/orders/{guest_token}/pay` (simulated online guest payment)
Audience: the guest tracking connection only (`target_guest_token`, not `target_user_id`)

```json
{
  "type": "ORDER_PAID",
  "order_id": "...",
  "target_guest_token": "..."
}
```

### `TABLE_UPDATE`
Emitted by: `POST /cleaners/logs` (when admin assigns a cleaner, table status → `cleaning`)  
Audience: All in tenant

```json
{
  "type": "TABLE_UPDATE",
  "table_id": 5,
  "table_number": "T-05",
  "status": "cleaning"
}
```

### `TABLE_CLEAN`
Emitted by: `PATCH /cleaners/logs/{id}/complete` (cleaner marks done, table status → `available`)  
Audience: All in tenant

```json
{
  "type": "TABLE_CLEAN",
  "table_id": 5,
  "table_number": "T-05",
  "status": "available"
}
```

### `CLEAN_ASSIGNED`
Emitted by: `POST /cleaners/logs` (sent to the assigned cleaner)  
Audience: Targeted to assigned cleaner via `target_cleaner_id`

```json
{
  "type": "CLEAN_ASSIGNED",
  "log_id": "...",
  "table_id": 5,
  "table_number": "T-05",
  "target_cleaner_id": "..."
}
```

### `MEAL_DONE`
Emitted by: `PATCH /cleaners/logs/{id}/complete` when log was triggered by `PATCH /orders/{id}/complete`  
Audience: All in tenant

```json
{
  "type": "MEAL_DONE",
  "order_id": "...",
  "table_id": 5
}
```

### `LOW_STOCK`
Emitted by: `inventory_service.py` after any `consumption` movement  
Audience: All in `ws:channel:{tenant_id}` (admin users)

```json
{
  "type": "LOW_STOCK",
  "inventory_item_id": "...",
  "item_name": "Chicken",
  "quantity_on_hand": "1.500",
  "reorder_level": "5.000"
}
```

---

## Event Summary Table

| Event | Trigger | Primary audience |
|---|---|---|
| `ORDER_PLACED` | New order created | Staff / kitchen |
| `ORDER_CONFIRMED` | Admin confirms order | Customer |
| `ORDER_PREPARING` | Kitchen starts cooking | Customer |
| `ORDER_READY` | Order ready for pickup | Customer |
| `ORDER_DELIVERED` | Order delivered | Customer, admin |
| `ORDER_CANCELLED` | Order cancelled | Customer, admin |
| `TABLE_UPDATE` | Table status changed to cleaning | All staff |
| `TABLE_CLEAN` | Table cleaned, now available | All staff |
| `CLEAN_ASSIGNED` | New cleaning assignment | Assigned cleaner |
| `MEAL_DONE` | Customer finished eating | Admin / server |
| `LOW_STOCK` | Stock below reorder level | Admin |

Total: **12 event types**

---

## Frontend Usage

### TypeScript Type

```typescript
interface WsMessage {
  type: string;           // Event type string from the table above
  [key: string]: unknown; // Additional fields depending on event type
}
```

### Connection Example

```typescript
const ws = new WebSocket(
  `ws://localhost:8000/ws/${userId}?token=${accessToken}`
);

ws.onmessage = (event) => {
  const msg: WsMessage = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'ORDER_PLACED':
      // Refresh kitchen queue
      break;
    case 'ORDER_READY':
      if (msg.target_user_id === currentUserId) {
        // Show "Your order is ready!" notification
      }
      break;
    case 'LOW_STOCK':
      // Show inventory alert banner
      break;
    case 'PONG':
      // Keep-alive acknowledged
      break;
  }
};

// Keep-alive
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'PING' }));
  }
}, 30000);
```

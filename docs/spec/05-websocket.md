# Spec 05 — WebSocket Events

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. Connection

```
URL: ws://{host}/ws/{user_id}?token={access_token}
```

**Authentication:**
- Token is validated identically to HTTP auth (signature, expiry, blacklist, tenant match)
- `403` if token invalid or tenant mismatch
- `404` if tenant slug unknown

**Connection persistence:**
- Server sends periodic ping frames; client must respond with pong
- Client should implement reconnect with exponential backoff on disconnect

---

## 2. Connection Manager

Files: `backend/app/services/websocket_manager.py`, `backend/app/services/ws_pubsub.py`

The system uses **Redis Pub/Sub** to broadcast events across multiple backend instances.

```
ConnectionManager (in-memory, per process)
  connections: dict[user_id, WebSocket]

Methods:
  connect(websocket, user_id, role, tenant_id)   → registers connection
  disconnect(user_id)                             → removes connection
  broadcast_to_tenant(tenant_id, message)         → sends to all users in tenant
                                                    (checks "target_user_id" for personal events)

Redis Pub/Sub bridge:
  publish_event(tenant_id, event, outlet_id?)
    → publishes to Redis channel ws:channel:{tenant_id}
    → every running server instance subscribed to that channel
      calls ConnectionManager.broadcast_to_tenant() for their local connections
```

This architecture supports horizontal scaling: multiple backend instances share events via Redis.

---

## 3. Message Format

All messages are **flat JSON** with a `type` field. There is no nested `data` wrapper object.

**Server → Client:**
```json
{
  "type": "EVENT_TYPE",
  "field1": "...",
  "field2": "..."
}
```

**Client → Server:**
```json
{ "type": "PING" }
```
Server responds:
```json
{ "type": "PONG" }
```

Personal events carry `"target_user_id"` so the ConnectionManager can route them to the correct user.

---

## 4. All Event Types

### `ORDER_PLACED`
**Trigger:** Customer successfully places an order  
**Recipients:** All connections in the tenant (broadcast)  

```json
{
  "type": "ORDER_PLACED",
  "order_id": "...",
  "table_number": "T-05",
  "items": [
    { "item_id": "...", "quantity": 2, "unit_price": "120.00", "subtotal": "240.00" }
  ]
}
```

---

### `ORDER_CONFIRMED`
**Trigger:** Staff sets order status to `confirmed`  
**Recipients:** All connections in the tenant; `target_user_id` identifies the customer  

```json
{
  "type": "ORDER_CONFIRMED",
  "order_id": "...",
  "status": "confirmed",
  "target_user_id": "<customer_user_id>"
}
```

---

### `ORDER_PREPARING`
**Trigger:** Staff sets order status to `preparing`  
**Recipients:** All connections in the tenant; `target_user_id` for personal routing  

```json
{
  "type": "ORDER_PREPARING",
  "order_id": "...",
  "status": "preparing",
  "target_user_id": "<customer_user_id>"
}
```

---

### `ORDER_READY`
**Trigger:** Staff sets order status to `ready`  
**Recipients:** All connections in the tenant; `target_user_id` for personal routing  

```json
{
  "type": "ORDER_READY",
  "order_id": "...",
  "status": "ready",
  "target_user_id": "<customer_user_id>"
}
```

---

### `ORDER_DELIVERED`
**Trigger:** Staff sets order status to `delivered`  
**Recipients:** All connections in the tenant; `target_user_id` for personal routing  

```json
{
  "type": "ORDER_DELIVERED",
  "order_id": "...",
  "status": "delivered",
  "target_user_id": "<customer_user_id>"
}
```

---

### `ORDER_CANCELLED`
**Trigger:** Customer cancels a pending order  
**Recipients:** All connections in the tenant; `target_user_id` for personal routing  

```json
{
  "type": "ORDER_CANCELLED",
  "order_id": "...",
  "target_user_id": "<customer_user_id>"
}
```

---

### `TABLE_UPDATE`
**Trigger:** Table is set to `cleaning` status (when cleaner is assigned)  
**Recipients:** All connections in the tenant  

```json
{
  "type": "TABLE_UPDATE",
  "table_id": 12,
  "table_number": "T-12",
  "status": "cleaning"
}
```

---

### `TABLE_CLEAN`
**Trigger:** Cleaner completes assignment — table status returns to `available`  
**Recipients:** All connections in the tenant  

```json
{
  "type": "TABLE_CLEAN",
  "table_id": 12,
  "table_number": "T-12"
}
```

---

### `CLEAN_ASSIGNED`
**Trigger:** Admin creates a cleaner log for a table  
**Recipients:** All connections in the tenant (cleaner receives it via `target_user_id` if set)  

```json
{
  "type": "CLEAN_ASSIGNED",
  "log_id": "...",
  "table_number": "T-12"
}
```

---

### `MEAL_DONE`
**Trigger:** Customer completes a meal (after `delivered` status, customer confirms)  
**Recipients:** All connections in the tenant  

```json
{
  "type": "MEAL_DONE",
  "table_id": 12,
  "table_number": "T-12"
}
```

---

### `LOW_STOCK`
**Trigger:** An inventory item's `quantity_on_hand` falls at or below `reorder_level` after a consumption movement  
**Recipients:** All connections in the tenant  

```json
{
  "type": "LOW_STOCK",
  "item_id": "...",
  "item_name": "Chicken",
  "quantity_on_hand": 2.5,
  "reorder_level": 5.0,
  "unit": "kg"
}
```

---

## 5. Frontend Usage

```typescript
// src/hooks/useWebSocket.ts
// Connection uses user_id (not tenant_slug) in the URL path

const ws = new WebSocket(
  `${process.env.NEXT_PUBLIC_WS_URL}/ws/${userId}?token=${token}`
)

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data) as WsMessage  // see src/types/index.ts

  switch (msg.type) {
    case 'ORDER_PLACED':
      // Staff: add to order queue, show toast
      break
    case 'ORDER_READY':
      // Customer: show browser notification
      break
    case 'TABLE_CLEAN':
      // Admin/staff: update table grid in real-time
      break
    case 'LOW_STOCK':
      // Admin: show InventoryAlertBanner
      break
    case 'CLEAN_ASSIGNED':
      // Cleaner: show assignment notification
      break
    case 'MEAL_DONE':
      // Admin: trigger cleaner assignment for table
      break
    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG' }))
      break
  }
}

// Reconnect on disconnect
ws.onclose = () => setTimeout(reconnect, 2000)
```

**TypeScript type** (`src/types/index.ts`):
```typescript
export interface WsMessage {
  type: 'ORDER_PLACED' | 'ORDER_CONFIRMED' | 'ORDER_PREPARING' | 'ORDER_READY'
      | 'ORDER_DELIVERED' | 'ORDER_CANCELLED'
      | 'TABLE_UPDATE' | 'TABLE_CLEAN'
      | 'CLEAN_ASSIGNED' | 'MEAL_DONE'
      | 'LOW_STOCK' | 'PING' | 'PONG'
  order_id?: string
  table_number?: string
  table_id?: number
  log_id?: string
  status?: string
  target_user_id?: string
  // LOW_STOCK fields
  item_id?: string
  item_name?: string
  quantity_on_hand?: number
  reorder_level?: number
  unit?: string
}
```

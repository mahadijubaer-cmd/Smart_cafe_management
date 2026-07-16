# Module: Orders

**Router:** `backend/app/routers/orders.py`  
**Schemas:** `backend/app/schemas/order.py`  
**Service:** `backend/app/services/order_service.py`  
**Last verified:** 2026-07-16

---

## Overview

Handles order placement, status progression, cancellation, and completion signalling. Orders are time-slotted, wallet-funded, and drive real-time WebSocket notifications. All monetary calculations are server-side.

> **✅ [Phase 22 — Implemented 2026-07-05]** This module also gains an `order_source` field and
> nullable `user_id` to support guest orders. See OR-11 below, `system/data-model.md`, and
> `modules/public-surface.md` for the full guest ordering flow (RFC-007). Everything else in this
> file describes the current, implemented behaviour for `customer_app` orders.

---

## API Endpoints

### `POST /api/v1/orders/`

**Auth:** Required | **Roles:** `customer`, `student`

**Request body:** `OrderCreate`

| Field | Type | Required | Default | Constraint |
|---|---|---|---|---|
| `items` | list[OrderItemCreate] | Yes | — | `min_length=1` |
| `items[].item_id` | UUID | Yes | — | Must exist in tenant |
| `items[].quantity` | int | Yes | — | `gt=0` |
| `table_id` | int \| null | No | null | SERIAL integer (not UUID) |
| `time_slot` | datetime | Yes | — | Must be in the future (OR-1) |
| `special_notes` | str \| null | No | null | — |
| `redeem_points` | bool | No | `false` | See reward rules RWD-1 through RWD-4 |

> Field is `special_notes` — NOT `notes`.

**Business logic (executed in order):**
1. Validate `time_slot` is in the future (OR-1)
2. Validate all items exist and `is_available=TRUE` (OR-2)
3. If `inventory_strict_mode=TRUE`: check stock for each recipe ingredient (OR-3)
4. If `table_id` provided: acquire Redis lock `lock:order:{table_id}` NX 30s (OR-4)
5. Calculate `total_amount` server-side: `Σ (price × quantity)` (OR-5)
6. If `redeem_points=TRUE`: calculate and apply discount (RWD-1, RWD-2)
7. Deduct `total_amount - discount_amount` from wallet (OR-6)
8. Create `order` + `order_items` + `payment` records in one transaction
9. Create `consumption` movements for each recipe ingredient
10. After LOW_STOCK check: publish `LOW_STOCK` event if needed (INV-4)
11. Release table lock
12. Publish `ORDER_PLACED` WebSocket event to tenant channel

**WebSocket event emitted:**
```json
{
  "type": "ORDER_PLACED",
  "order_id": "...",
  "table_id": 5,
  "total_amount": "240.00",
  "time_slot": "2026-06-30T13:00:00Z"
}
```

**Response `201`:** `OrderResponse`

```json
{
  "order_id": "3fa85f64-...",
  "user_id": "...",
  "table_id": 5,
  "time_slot": "2026-06-30T13:00:00Z",
  "status": "pending",
  "total_amount": "240.00",
  "discount_amount": "0.00",
  "payment_status": "paid",
  "payment_method": "wallet",
  "special_notes": "No spice",
  "created_at": "...",
  "updated_at": "...",
  "items": [
    {
      "order_item_id": "...",
      "item_id": "...",
      "menu_item": { "name": "Chicken Biryani", "price": "120.00", "...": "rest of MenuItemResponse" },
      "quantity": 2,
      "unit_price": "120.00",
      "subtotal": "240.00"
    }
  ]
}
```

> `table_number` (see OR-13) and `items[].menu_item` are also present on this response — omitted
> above for brevity, shown in full in the schema block below.

**Errors:** `400` unavailable item | `400` insufficient stock (strict mode) | `400` insufficient wallet balance | `409` table locked

---

### `GET /api/v1/orders/`

**Auth:** Required | **Roles:** All authenticated

**Query params:** `?status=pending`

**Role-based scoping:**
- `customer`, `student`: own orders only
- `staff`, all admin roles: all orders for `ctx.tenant_id`

**Response `200`:** `list[OrderResponse]` (newest first)

---

### `GET /api/v1/orders/{order_id}`

**Auth:** Required | **Roles:** All authenticated

**Scoping:** Customer gets `403` if order belongs to another user. Admin/staff see any in their tenant.

**Response `200`:** `OrderResponse`

**Errors:** `404` if not found or belongs to another tenant

---

### `PATCH /api/v1/orders/{order_id}/status`

**Auth:** Required | **Roles:** Admin roles, `staff`

**Request body:** `OrderUpdateStatus`

| Field | Type | Required | Valid values |
|---|---|---|---|
| `status` | str | Yes | `confirmed \| preparing \| ready \| delivered \| cancelled` |

**Status machine (OR-8):**

```
pending    → confirmed
pending    → cancelled
confirmed  → preparing
confirmed  → cancelled
preparing  → ready
ready      → delivered
```

Any other transition: `400 "Invalid status transition from {current} to {new}"`

**WebSocket events emitted by status:**

| New status | Event published |
|---|---|
| `confirmed` | `ORDER_CONFIRMED` |
| `preparing` | `ORDER_PREPARING` |
| `ready` | `ORDER_READY` |
| `delivered` | `ORDER_DELIVERED` |
| `cancelled` | `ORDER_CANCELLED` |

All events include `order_id` and `target_user_id` in the payload.

**Response `200`:** `OrderResponse`

---

### `PATCH /api/v1/orders/{order_id}/complete`

**Auth:** Required | **Roles:** `customer`, `student`

Purpose: Customer signals they have finished eating — triggers automatic cleaner assignment server-side.

**Rules:** Order must belong to the authenticated user.

**Response `202`:** `{ "status": "processing" }`

---

### `DELETE /api/v1/orders/{order_id}`

**Auth:** Required | **Roles:** `customer`, `student`

**Rules:**
- Order must belong to the authenticated user (OR-10)
- Order `status` must be `pending` (OR-10)
- Refunds full `total_amount` to wallet; creates positive `wallet_transaction` (OR-9)
- Reverses reward points if they were redeemed (RWD-4)

**Response `200`:** `{ "status": "cancelled", "order_id": "..." }`

> Cancel is `DELETE /orders/{id}` — there is NO `POST /orders/{id}/cancel` endpoint.

---

## Pydantic Schemas

### `OrderItemCreate` (nested)

```python
class OrderItemCreate(BaseModel):
    item_id: UUID
    quantity: int = Field(..., gt=0)
```

### `OrderCreate`

```python
class OrderCreate(BaseModel):
    items: list[OrderItemCreate] = Field(..., min_length=1)
    table_id: int | None = None
    time_slot: datetime
    special_notes: str | None = None
    redeem_points: bool = False
```

### `OrderUpdateStatus`

```python
class OrderUpdateStatus(BaseModel):
    status: OrderStatus    # pending|confirmed|preparing|ready|delivered|cancelled
```

### `OrderItemResponse` (nested)

```python
class OrderItemResponse(BaseModel):
    order_item_id: UUID
    item_id: UUID
    menu_item: MenuItemResponse | None = None   # see OR-13 — None only if not eager-loaded
    quantity: int
    unit_price: Decimal
    subtotal: Decimal        # GENERATED column (quantity * unit_price)
```

### `OrderResponse`

```python
class OrderResponse(BaseModel):
    order_id: UUID
    user_id: UUID
    table_id: int | None      # SERIAL integer, not UUID — internal id, not guest/staff-facing
    table_number: str | None  # human label ("A1", "T-04") — see OR-13. This is what UIs must display.
    time_slot: datetime
    status: str
    total_amount: Decimal
    discount_amount: Decimal
    payment_status: str      # pending|paid|refunded
    payment_method: str | None
    special_notes: str | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]
```

---

## Business Rules

### OR-1: Time Slot Must Be in the Future
`time_slot` must be strictly in the future at placement time.  
Error: `400 "Time slot must be in the future"`

### OR-2: All Items Must Be Available
Every item in the order must have `is_available=TRUE`.  
Error: `400 "Item '{name}' is currently unavailable"`

### OR-3: Strict Inventory Mode Blocks Insufficient Stock
When `tenant.inventory_strict_mode=TRUE`:  
For each recipe entry: `required = quantity_per_serving × order_quantity`  
If `quantity_on_hand < required`: `400 "Insufficient stock for '{item_name}'"`  
When `inventory_strict_mode=FALSE`: orders go through regardless; stock can temporarily go negative (deficit tracked in movement notes).

### OR-4: Table Lock Prevents Double-Booking
When `table_id` provided: acquire Redis lock `lock:order:{table_id}` with NX + 30s TTL.  
If lock held: `409 "Table is currently being reserved. Please try again."`  
Lock released after order transaction completes (success or failure).

### OR-5: Total Amount Is Server-Calculated
The server calculates `total_amount = Σ (menu_item.price × quantity)`.  
Client must NOT send a total — it is ignored if sent.

### OR-6: Wallet Deduction Is Atomic
Wallet deduction and order creation happen in a single database transaction.  
If `wallet_balance < (total_amount - discount_amount)`: `400 "Insufficient wallet balance"`  
On failure: wallet NOT decremented.

### OR-7: Price Snapshot
`order_items.unit_price = menu_items.price` at placement time.  
Subsequent price changes do not affect historical `order_items`.

### OR-8: Status Transition Machine
See status machine diagram above. Invalid transitions: `400 "Invalid status transition from {current} to {new}"`

### OR-9: Cancellation Refunds Full Amount
On order cancellation: `users.wallet_balance += order.total_amount`  
A positive `wallet_transaction` is created. No new `payment` record.

### OR-10: Customer Can Only Cancel Pending Orders
A customer can cancel only their own orders when `status=pending`.  
Admin roles can cancel any order in `pending` or `confirmed` status.

### OR-11: `order_source` Is Set on Every Order-Creation Path
✅ [Phase 22 — Implemented 2026-07-05]. Every code path that creates an `order` row sets
`order_source`:

| Path | `order_source` |
|---|---|
| `POST /orders/` (this endpoint, authenticated customer/student) | `customer_app` (default) |
| Staff POS entry form (planned, `modules/public-surface.md` context — restaurant segment) | `staff_pos` |
| `POST /public/{public_slug}/orders` (guest QR) | `guest_qr` |
| `POST /device/orders` (paired kiosk terminal, RFC-010 — see `modules/kiosk.md`) ✅ Phase 25 | `kiosk` |

`guest_qr` and `kiosk` orders have `user_id IS NULL` and a non-null `guest_token`; all other sources
require `user_id`. Enforced by the `chk_order_identity` constraint (`system/data-model.md`).
Analytics (`modules/analytics.md`) must report the `order_source` breakdown per RFC-007's
guest-vs-staff dimension.

### OR-12: Pickup Number ✅ Implemented (Phase 25, RFC-010)
Orders created via `POST /device/orders` get `orders.pickup_number` — a per-tenant, daily-reset,
human-readable integer from Redis `INCR order:pickup:{tenant_id}:{YYYYMMDD}` (key TTL 48 h). Other
creation paths leave it `NULL`. `pickup_number` is included in every `ORDER_*` WS event payload
(`modules/websocket.md`) and shown on the kiosk confirmation screen and the signage order-status
board (`modules/kiosk.md` KSK-4, `modules/signage.md` SGN-7). Unlike anonymous-phone guest orders,
device orders have `table_id=NULL`, no `guest_phone`, and bypass the restaurant-segment guard —
KSK-2/KSK-3 in `modules/kiosk.md` own those exceptions.

### OR-13: Order Responses Must Carry Display Names, Not Raw IDs ✅ Fixed 2026-07-16
Found via QA browser testing across the guest tracking page, the authenticated customer tracking
page, and the staff kitchen queue: `OrderItemResponse` had no item name and `OrderResponse` had no
table label, so every one of those surfaces rendered `items[].item_id` (a raw UUID, sometimes
truncated to 8 chars) and `table_id` (an internal cross-tenant-wide serial integer, e.g. "Table
#33") directly to guests and staff — meaningless to a human, and in the table case actively
misleading (it isn't even scoped to "this tenant's 33rd table").

**Contract (binding for every response-building code path):**
- `OrderItemResponse.menu_item` — nests the item's `MenuItemResponse` (reuses the existing schema,
  no cost/inventory fields leak per PUB-7's principle). Frontends must render `menu_item?.name`,
  never `item_id`.
- `OrderResponse.table_number` — the human table label from `tables_map.table_number` (e.g. `"A1"`).
  Frontends must render this, never raw `table_id`.
- Both are populated via a **guarded ORM property** (`Order.table_number`, `OrderItem.menu_item_safe`
  in `backend/app/models/order.py`) that checks `sqlalchemy.inspect(self).unloaded` before touching
  the relationship — returns `None` instead of triggering an implicit lazy load. This exists because
  an unguarded lazy load in this codebase's async SQLAlchemy setup raises `MissingGreenlet` (the same
  class of bug fixed once already in `update_status()` — see `project_scms_local_run` history); a
  silent `None` is the correct failure mode for a display-only field, a 500 is not.
- **Any new or modified query that returns an `Order`/`OrderItem` for API response MUST eager-load
  `selectinload(Order.items).selectinload(OrderItem.menu_item)` and `selectinload(Order.table)`.**
  Omitting this doesn't crash — it silently serves `menu_item: null` / `table_number: null` — so this
  is easy to miss in review and must be checked explicitly, not assumed from the absence of an error.
  All current call sites (`order_service.py`, `routers/orders.py`, `routers/public.py` via
  `order_service`, `routers/device_api.py` kiosk endpoints) were audited and fixed together on
  2026-07-16.
- Applies identically to the guest schemas (`GuestOrderItemResponse.menu_item`,
  `GuestOrderResponse.table_number` in `modules/public-surface.md`) — same underlying `Order`/
  `OrderItem` ORM objects, same guarded properties.

### OR-14: A Food-Court Vendor Cannot Self-Deliver ✅ Fixed 2026-07-16
Found via QA browser testing of the food-court fulfillment flow: `PATCH /orders/{id}/status` is
guarded only by `WORK_ROLES` (`FLOOR_STAFF_ROLES + ADMIN_ROLES`), with no special case for a
`food_court_vendor` tenant. That let a vendor's own `tenant_admin` (e.g. Burger Joint's admin)
advance an order straight to `delivered` from the ordinary kitchen-queue UI — completely bypassing
the shared-staff delivery model `modules/food-court.md` FC-4/FC-5 describes, where only the food
court **parent's** `server` role (a different tenant context entirely) is meant to physically hand
food over at the shared pickup point, via `PATCH /food-court/orders/{id}/deliver`.

**Fix:** `update_order_status` now rejects `status="delivered"` outright when
`ctx.tenant_type == TenantType.food_court_vendor`, with
`400 "Vendors cannot self-deliver — use the food court's shared deliver queue"`. A vendor order can
still reach every other status (`confirmed`/`preparing`/`ready`) through this same endpoint; only
the final `delivered` hop is reserved for the parent's `/food-court/orders/{id}/deliver` (FC-5,
`server`-role-only, already enforced there).

---

## Reward Points Rules

### RWD-1: Points Accumulate on Every Successful Order
After payment is processed (background task): `reward_points += floor(total_amount / 10)`  
Example: ৳240 order → 24 points.

### RWD-2: Redeeming Points for a Discount
If `redeem_points=TRUE` and `user.reward_points >= 10`:
- `discount = floor(reward_points / 10)` taka, capped at 20% of `total_amount`
- `order.discount_amount = discount`
- Wallet deduction uses `total_amount - discount_amount`
- `user.reward_points` reset to 0

If `reward_points < 10`: `400 "Insufficient reward points"`

### RWD-3: Points Earned on Post-Discount Total
Points are earned on the final `total_amount` after discount, not the pre-discount total.

### RWD-4: Points Reversed on Cancellation
When an order is cancelled: `reward_points -= floor(original_total / 10)`.  
`reward_points` cannot go below 0.

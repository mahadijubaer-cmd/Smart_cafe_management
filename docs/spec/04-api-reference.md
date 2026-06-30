# Spec 04 — API Reference

**Last updated:** 2026-06-30  
**Status:** Authoritative

> **Rule:** This file defines the exact contract for every endpoint. When the spec and FastAPI's auto-generated `/docs` disagree, this file is correct — update the code to match. Conversely, when adding a new endpoint, update this file first.

> **Interactive docs:** `http://localhost:8000/docs` (Swagger UI) — useful for live testing but not authoritative.

---

## Conventions

**Base URL:** `/api/v1`

**Required header (all authenticated endpoints):**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**No `X-Tenant-Slug` header.** Tenant context is derived from the JWT claims by `TenantContextMiddleware`. See `01-architecture.md` → Layer 1.

**Standard error response:**
```json
{ "detail": "<human-readable error message>" }
```

**HTTP status codes used:**
| Code | Meaning |
|---|---|
| `200` | Success with body |
| `201` | Resource created |
| `204` | Success, no body |
| `400` | Bad request / business rule violation |
| `401` | Not authenticated or token revoked |
| `403` | Authenticated but forbidden (role or tenant mismatch) |
| `404` | Resource not found or belongs to another tenant |
| `409` | Conflict (duplicate resource or lock contention) |
| `422` | Pydantic validation error (field type / constraint violation) |
| `429` | Rate limit exceeded |

---

## Auth — `/auth`

### `POST /auth/register`

Auth: **None**

**Request body:**
```json
{
  "email": "student1@g.bracu.ac.bd",
  "password": "Student@1234",
  "full_name": "Alice Rahman",
  "role": "student",
  "tenant_slug": "bracu",
  "student_id": "22301162",
  "phone": null
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | EmailStr | Yes | Valid email format |
| `password` | str | Yes | min 8 characters |
| `full_name` | str | Yes | 2–100 characters |
| `role` | UserRole | No | Default `customer`; only `student` or `customer` allowed at self-registration |
| `tenant_slug` | str | Yes | Must match an active tenant |
| `student_id` | str \| null | No | For academic tenants |
| `phone` | str \| null | No | — |

**Business rules checked:**
- `tenant_slug` must resolve to an active tenant → `404` if not found
- `role` must be `student` or `customer` → `400 "Role not allowed for self-registration"` for any other role
- If `tenant.allowed_email_domain` is set, email must end with it → `400 "Email domain not allowed"`
- `(email, tenant_id)` must not already exist → `409 "User already registered"`

**Response `201`:** `Token`
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user_id": "<uuid>",
  "tenant_id": "<uuid>",
  "tenant_type": "academic",
  "tenant_slug": "bracu",
  "outlet_id": null,
  "role": "student"
}
```

**Current behaviour:** User is created with `is_active=TRUE` and `email_verified=FALSE`. The frontend handles OTP email send and verify as a separate step. See WF-1 in `08-workflows.md`.

---

### `POST /auth/login`

Auth: **None**

**Request body:**
```json
{
  "email": "admin@bracu.scms",
  "password": "Admin@1234",
  "tenant_slug": "bracu"
}
```

| Field | Type | Required |
|---|---|---|
| `email` | EmailStr | Yes |
| `password` | str | Yes |
| `tenant_slug` | str | Yes |

**Response `200`:** `Token` (same shape as register — see above)

**Current behaviour:** Token is returned immediately for ALL roles. The frontend login page (Phase 10) sends OTP and verifies it for admin roles before navigating to dashboard — this is a UI-layer gate, not a backend gate.

Errors: `401 "Invalid credentials"` | `400 "Account is inactive"`

---

### `POST /auth/logout`

Auth: **Required**

Request body: None

**Response `204`:** No body.

Side effect: Adds `blacklist:jti:{jti}` to Redis with TTL = remaining token lifetime. All subsequent requests with this token return `401 "Token has been revoked"`.

---

### `GET /auth/me`

Auth: **Required** | Roles: Any authenticated

**Response `200`:** `UserResponse`
```json
{
  "user_id": "<uuid>",
  "email": "student1@g.bracu.ac.bd",
  "full_name": "Alice Rahman",
  "role": "student",
  "tenant_id": "<uuid>",
  "outlet_id": null,
  "wallet_balance": "350.00",
  "reward_points": 40,
  "email_verified": true,
  "is_active": true,
  "created_at": "2026-06-01T10:00:00Z"
}
```

---

## OTP — `/otp`

### `POST /otp/send`

Auth: **None**

**Request body:**
```json
{
  "email": "student1@g.bracu.ac.bd",
  "purpose": "email_verification",
  "tenant_slug": "bracu"
}
```

| Field | Type | Required | Valid values |
|---|---|---|---|
| `email` | EmailStr | Yes | — |
| `purpose` | str | Yes | `email_verification` \| `login` \| `password_reset` |
| `tenant_slug` | str | Yes | Must resolve to active tenant |

Rate limit: **3 sends per 10 minutes per email** (enforced by slowapi).

**Response `200`:**
```json
{
  "message": "OTP sent to student1@g.bracu.ac.bd",
  "email": "student1@g.bracu.ac.bd",
  "purpose": "email_verification"
}
```

Side effect: Generates 6-digit code, stores `otp:{purpose}:{email}` in Redis (TTL=600s), sends email via fastapi-mail.

---

### `POST /otp/verify`

Auth: **None**

**Request body:**
```json
{
  "email": "student1@g.bracu.ac.bd",
  "purpose": "email_verification",
  "otp_code": "483921",
  "tenant_slug": "bracu"
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | EmailStr | Yes | — |
| `purpose` | str | Yes | `email_verification` \| `login` \| `password_reset` |
| `otp_code` | str | Yes | Exactly 6 digits |
| `tenant_slug` | str | Yes | — |

**Response `200`:**
```json
{
  "verified": true,
  "message": "OTP verified successfully"
}
```

On `email_verification` success: sets `user.email_verified = TRUE`.

Errors: `400 "Invalid OTP"` | `400 "OTP expired or not found"` | `400 "Too many failed attempts"`

Business rules: OTP-1 through OTP-4 in `06-business-rules.md`.

---

## Menu — `/menu`

### `GET /menu/categories`

Auth: Required | Roles: All

**Response `200`:** `list[CategoryResponse]`
```json
[
  { "category_id": 1, "name": "Rice", "icon_url": null, "display_order": 0 }
]
```

---

### `POST /menu/categories`

Auth: Required | Roles: Admin roles

**Request body:** `{ "name": "Beverages", "display_order": 5 }`

| Field | Type | Required |
|---|---|---|
| `name` | str | Yes |
| `display_order` | int | No, default 0 |

**Response `201`:** `CategoryResponse`

---

### `PUT /menu/categories/{category_id}`

Auth: Required | Roles: Admin roles

**Request body:** `{ "name": "Beverages", "display_order": 5, "is_active": true }`

**Response `200`:** `CategoryResponse`

---

### `DELETE /menu/categories/{category_id}`

Auth: Required | Roles: Admin roles

Rules: `400` if any active menu items are linked to this category.

**Response `204`**

---

### `GET /menu/items`

Auth: Required | Roles: All except `cleaner`

Query params: `?category_id=<int>&is_available=true`

**Response `200`:** `list[MenuItemResponse]`
```json
[
  {
    "item_id": "<uuid>",
    "category_id": 1,
    "name": "Chicken Biryani",
    "description": "Fragrant basmati rice with chicken",
    "price": "120.00",
    "image_url": "/media/items/chicken-biryani.png",
    "is_available": true,
    "is_homemade": false,
    "prep_time_mins": 15,
    "created_at": "2026-06-01T10:00:00Z"
  }
]
```

---

### `POST /menu/items`

Auth: Required | Roles: Admin roles

**Request body:** `MenuItemCreate`
```json
{
  "category_id": 1,
  "name": "Chicken Biryani",
  "description": "...",
  "price": "120.00",
  "image_url": null,
  "is_available": true,
  "is_homemade": false,
  "prep_time_mins": 15
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `category_id` | int | Yes | Must exist in tenant |
| `name` | str | Yes | 1–100 characters |
| `description` | str \| null | No | — |
| `price` | Decimal | Yes | ≥ 0 |
| `image_url` | str \| null | No | — |
| `is_available` | bool | No | Default `true` |
| `is_homemade` | bool | No | Default `false` |
| `prep_time_mins` | int | No | Default `10` |

**Response `201`:** `MenuItemResponse`

---

### `PUT /menu/items/{item_id}`

Auth: Required | Roles: Admin roles

**Request body:** `MenuItemUpdate` (all fields required — use for full replacement)

**Response `200`:** `MenuItemResponse`

Side effect: Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `PATCH /menu/items/{item_id}/availability`

Auth: Required | Roles: Admin roles, `staff`

**Request body:** `{ "is_available": false }`

**Response `200`:** `{ "is_available": false }`

Side effect: Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `DELETE /menu/items/{item_id}`

Auth: Required | Roles: Admin roles

Rules: `400` if item has been ordered (historical integrity must not break).

**Response `204`**

---

### `GET /menu/items/{item_id}/recipe`

Auth: Required | Roles: Admin roles

**Response `200`:** `list[RecipeLineResponse]`
```json
[
  {
    "recipe_id": "<uuid>",
    "tenant_id": "<uuid>",
    "menu_item_id": "<uuid>",
    "inventory_item_id": "<uuid>",
    "quantity_per_serving": "0.2500"
  }
]
```

---

### `POST /menu/items/{item_id}/recipe`

Auth: Required | Roles: Admin roles

**Request body:** `RecipeLineCreate`
```json
{
  "inventory_item_id": "<uuid>",
  "quantity_per_serving": "0.25"
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `inventory_item_id` | UUID | Yes | Must exist in tenant |
| `quantity_per_serving` | Decimal | Yes | > 0 |

**Response `201`:** `RecipeLineResponse`

---

## Orders — `/orders`

### `POST /orders/`

Auth: Required | Roles: `student`, `customer`

**Request body:** `OrderCreate`
```json
{
  "items": [
    { "item_id": "<uuid>", "quantity": 2 }
  ],
  "table_id": 5,
  "time_slot": "2026-06-30T13:00:00Z",
  "special_notes": "No spice",
  "redeem_points": false
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `items` | list | Yes | min 1 item |
| `items[].item_id` | UUID | Yes | Must belong to this tenant |
| `items[].quantity` | int | Yes | > 0 |
| `table_id` | int \| null | No | Table SERIAL id |
| `time_slot` | datetime | Yes | Must be in the future (OR-1) |
| `special_notes` | str \| null | No | — |
| `redeem_points` | bool | No | Default `false`; see business rule RWD-1 |

**Business rules checked (in order):**
1. All items exist and `is_available=TRUE` (OR-2)
2. `time_slot` is in the future (OR-1)
3. If `inventory_strict_mode=TRUE`: stock check (OR-3)
4. If `table_id` given: acquire Redis lock `lock:order:{table_id}` (OR-4)
5. Calculate `total_amount` server-side (OR-5)
6. If `redeem_points=TRUE`: calculate discount (RWD-1)
7. Deduct wallet balance (OR-6); `400 "Insufficient wallet balance"` if short
8. Create order + order_items + payment + inventory movements
9. Publish `ORDER_PLACED` WebSocket event to tenant channel

**Response `201`:** `OrderResponse`
```json
{
  "order_id": "<uuid>",
  "user_id": "<uuid>",
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
      "order_item_id": "<uuid>",
      "item_id": "<uuid>",
      "quantity": 2,
      "unit_price": "120.00",
      "subtotal": "240.00"
    }
  ]
}
```

Errors: `400` unavailable item | `400` insufficient stock | `400` insufficient balance | `409` table locked

---

### `GET /orders/`

Auth: Required | Roles: All authenticated

Query params: `?status=pending`

**Behaviour by role:**
- Customer/student roles: see only own orders
- Staff + all admin roles: see all orders for the tenant

**Response `200`:** `list[OrderResponse]` (newest first)

---

### `GET /orders/{order_id}`

Auth: Required | Roles: All authenticated

Rules: Customers get `403` if order belongs to another user. Admin/staff see any.

**Response `200`:** `OrderResponse`

---

### `PATCH /orders/{order_id}/status`

Auth: Required | Roles: Admin roles, `staff`

**Request body:** `OrderUpdateStatus`
```json
{ "status": "confirmed" }
```

Valid status values: `pending|confirmed|preparing|ready|delivered|cancelled`

**Status machine (OR-8):**
```
pending    → confirmed | cancelled
confirmed  → preparing | cancelled
preparing  → ready
ready      → delivered
```

Any other transition: `400 "Invalid status transition from {current} to {new}"`

Side effects:
- `confirmed` → Publishes `ORDER_CONFIRMED` (with `target_user_id`) + triggers QR generation + email
- `preparing` → Publishes `ORDER_PREPARING`
- `ready` → Publishes `ORDER_READY`
- `delivered` → Publishes `ORDER_DELIVERED`

**Response `200`:** `OrderResponse`

---

### `PATCH /orders/{order_id}/complete`

Auth: Required | Roles: `student`, `customer`

Purpose: Customer signals that they have eaten (triggers cleaner assignment logic server-side).

Rules: Order must belong to the authenticated user.

**Response `202`:** `{ "status": "processing" }`

---

### `DELETE /orders/{order_id}`

Auth: Required | Roles: `student`, `customer`

Rules:
- Order must belong to the authenticated user
- Order must have `status = pending` (OR-10)
- Refunds `total_amount` to wallet (OR-9); creates positive `wallet_transaction`

**Response `200`:** `{ "status": "cancelled", "order_id": "<uuid>" }`

---

## Tables — `/tables`

### `GET /tables/`

Auth: Required | Roles: All

Query params: `?zone=indoor&status=available`

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

Note: `table_id` is an INTEGER (SERIAL), not a UUID.

---

### `POST /tables/`

Auth: Required | Roles: Admin roles

**Request body:**
```json
{
  "table_number": "T-15",
  "zone": "outdoor",
  "capacity": 2,
  "position_x": 8,
  "position_y": 4
}
```

**Response `201`:** `TableResponse`

---

### `PATCH /tables/{table_id}/status`

Auth: Required | Roles: Admin roles, `staff`, `cleaner`, `server`

**Request body:** `TableUpdateStatus`
```json
{ "status": "cleaning" }
```

Valid status values: `available | reserved | occupied | cleaning`

Side effect: When status changes to `available` from `cleaning` → publishes `TABLE_CLEAN` WebSocket event.

**Response `200`:** `TableResponse`

---

### `PUT /tables/{table_id}` ❌ [Phase 16 — Not yet implemented]

Auth: Required | Roles: Admin roles

**Request body:** All table fields for full replacement.

**Response `200`:** `TableResponse`

See RFC: [RFC-003](../rfcs/RFC-003-floor-plan-editor.md)

---

### `PATCH /tables/layout` ❌ [Phase 16 — Not yet implemented]

Auth: Required | Roles: Admin roles

Purpose: Batch update table positions for floor plan editor.

**Request body:** `[{ "table_id": 1, "position_x": 3, "position_y": 2, "zone": "indoor", "capacity": 4 }]`

**Response `200`:** Array of updated `TableResponse`

---

### `DELETE /tables/{table_id}` ❌ [Phase 16 — Not yet implemented]

Auth: Required | Roles: Admin roles

Rules: `400` if active (non-delivered, non-cancelled) orders exist for this table.

**Response `204`**

---

## Cleaners — `/cleaners`

### `GET /cleaners/logs`

Auth: Required | Roles: Admin roles (all logs), `cleaner` (own only)

Query params: `?status=pending`

**Response `200`:** 
- Admin roles: `list[CleanerAssignmentAdminResponse]` — includes `cleaner` object and `table` object
- Cleaner: `list[CleanerAssignmentResponse]` — includes `table` object only

```json
[
  {
    "log_id": "<uuid>",
    "cleaner_id": "<uuid>",
    "table_id": 5,
    "status": "pending",
    "assigned_at": "2026-06-30T12:00:00Z",
    "cleaned_at": null,
    "table": { "table_id": 5, "table_number": "T-05", "zone": "indoor", "status": "cleaning" },
    "cleaner": { "user_id": "<uuid>", "full_name": "Bob Cleaner", "email": "cleaner1@bracu.scms" }
  }
]
```

---

### `POST /cleaners/logs`

Auth: Required | Roles: Admin roles

**Request body:**
```json
{
  "table_id": 5,
  "cleaner_id": "<uuid>"
}
```

Rules:
- Table must belong to this tenant
- `cleaner_id` user must have role `cleaner` and belong to this tenant

Side effects:
- Sets table `status = cleaning` → publishes `TABLE_UPDATE` event
- Publishes `CLEAN_ASSIGNED` event (with `log_id`, `table_number`)

**Response `201`:** `CleanerAssignmentAdminResponse`

---

### `PATCH /cleaners/logs/{log_id}/complete`

Auth: Required | Roles: `cleaner` (own assignment only), Admin roles

Side effects:
- Sets `log.status = done`, `log.cleaned_at = now()`
- Sets table `status = available`
- Publishes `TABLE_CLEAN` event (with `table_id`, `table_number`)
- Publishes `MEAL_DONE` event if triggered from order completion

**Response `200`:** `{ "status": "done", "cleaned_at": "2026-06-30T12:15:00Z" }`

---

## Payments — `/payments`

### `POST /payments/pay`

Auth: Required | Roles: `student`, `customer`

**Request body:** `PaymentCreate`
```json
{
  "order_id": "<uuid>",
  "method": "wallet"
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `order_id` | UUID | Yes | Must belong to authenticated user |
| `method` | str | Yes | `wallet` \| `simulation` |

Note: `bkash`, `nagad`, `card` are in the enum but NOT yet wired to payment gateways.

**Response `200`:** `PaymentResponse`
```json
{
  "payment_id": "<uuid>",
  "order_id": "<uuid>",
  "amount": "240.00",
  "method": "wallet",
  "status": "paid"
}
```

---

### `POST /payments/topup`

Auth: Required | Roles: Admin roles (any user in tenant), `student`/`customer` (own wallet)

**Request body:**
```json
{ "amount": "500.00" }
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `amount` | Decimal | Yes | > 0, ≤ 10,000 per transaction |

**Response `200`:** `{ "new_balance": "850.00" }`

---

### `GET /payments/history`

Auth: Required | Roles: All

- Customers see own payment history
- Admin roles see all payments for the tenant

**Response `200`:** `list[PaymentHistoryResponse]`
```json
[
  {
    "payment_id": "<uuid>",
    "order_id": "<uuid>",
    "amount": "240.00",
    "method": "wallet",
    "status": "paid",
    "created_at": "...",
    "order": {
      "order_id": "<uuid>",
      "total_amount": "240.00",
      "discount_amount": "0.00",
      "payment_status": "paid",
      "created_at": "..."
    }
  }
]
```

---

### `GET /payments/wallet`

Auth: Required | Roles: All

**Response `200`:** `{ "balance": "350.00", "reward_points": 40 }`

---

## Analytics — `/analytics`

All analytics endpoints: Auth Required | Roles: Admin roles only.

### `GET /analytics/summary`

**Response `200`:**
```json
{
  "total_orders_today": 42,
  "revenue_today": "5040.00",
  "active_tables": 8,
  "total_tables": 20,
  "pending_orders": 3,
  "low_stock_count": 2
}
```

---

### `GET /analytics/revenue`

Query: `?period=week` (`today` | `week` | `month`)

**Response `200`:** `[{ "date": "2026-06-24", "revenue": "3200.00" }]`

---

### `GET /analytics/orders-by-hour`

Query: `?date=2026-06-30` (defaults to today)

**Response `200`:** `[{ "hour": 12, "order_count": 18 }]` (24 entries, 0–23)

---

### `GET /analytics/top-items`

Query: `?period=week&limit=10`

**Response `200`:** `[{ "item_id": "<uuid>", "item_name": "Chicken Biryani", "total_ordered": 98 }]`

---

### `GET /analytics/outlets`

Roles: `super_admin`, `platform_admin` only (franchise only)

**Response `200`:** `[{ "outlet_id": "<uuid>", "outlet_name": "Gulshan Branch", "revenue": "12500.00", "orders": 104 }]`

---

### `GET /analytics/inventory-value`

**Response `200`:** `StockSummaryResponse`
```json
{
  "tenant_id": "<uuid>",
  "total_items": 25,
  "low_stock_count": 2,
  "total_inventory_value": "48500.00",
  "items": [
    {
      "item_id": "<uuid>",
      "name": "Chicken",
      "sku": "CHK-001",
      "unit": "kg",
      "quantity_on_hand": "2.500",
      "reorder_level": "5.000",
      "is_low_stock": true,
      "unit_cost": "350.00",
      "total_value": "875.00"
    }
  ]
}
```

---

## Inventory — `/inventory`

All inventory endpoints: Auth Required | Roles: Admin roles **excluding** `food_court_admin`.

### `GET /inventory/categories`

**Response `200`:** `list[InventoryCategoryResponse]`
```json
[{ "inv_category_id": 1, "tenant_id": "<uuid>", "name": "Proteins", "description": null }]
```

---

### `POST /inventory/categories`

**Request body:** `InventoryCategoryCreate`
```json
{ "name": "Vegetables", "description": "Fresh produce" }
```

**Response `201`:** `InventoryCategoryResponse`

---

### `GET /inventory/items`

**Response `200`:** `list[InventoryItemResponse]`

---

### `POST /inventory/items`

**Request body:** `InventoryItemCreate`
```json
{
  "inv_category_id": 1,
  "outlet_id": null,
  "is_central": false,
  "name": "Chicken",
  "sku": "CHK-001",
  "unit": "kg",
  "quantity_on_hand": "10.000",
  "reorder_level": "5.000",
  "reorder_quantity": "20.000",
  "unit_cost": "350.00",
  "supplier_name": "Fresh Farms Ltd",
  "supplier_contact": "+8801700000000",
  "notes": null
}
```

**Response `201`:** `InventoryItemResponse`

---

### `PUT /inventory/items/{item_id}`

**Request body:** `InventoryItemUpdate` (all fields optional — PATCH-like semantics despite PUT)

**Response `200`:** `InventoryItemResponse`

---

### `PATCH /inventory/items/{item_id}/adjust`

**Request body:** `StockAdjustRequest`
```json
{ "quantity_delta": "-2.000", "notes": "Spoilage" }
```

Rules: Resulting quantity cannot go below 0 (INV-7). Negative delta creates `adjustment` or `waste` movement.

**Response `200`:** `InventoryItemResponse`

---

### `GET /inventory/movements`

Query: `?item_id=<uuid>&movement_type=consumption&skip=0&limit=50`

**Response `200`:** `list[InventoryMovementResponse]`
```json
[
  {
    "movement_id": "<uuid>",
    "tenant_id": "<uuid>",
    "inventory_item_id": "<uuid>",
    "movement_type": "consumption",
    "quantity_delta": "-0.400",
    "quantity_before": "10.000",
    "quantity_after": "9.600",
    "order_id": "<uuid>",
    "purchase_order_id": null,
    "performed_by": "<uuid>",
    "notes": null,
    "created_at": "..."
  }
]
```

---

### `GET /inventory/purchase-orders`

**Response `200`:** `list[PurchaseOrderResponse]`

---

### `POST /inventory/purchase-orders`

**Request body:** `PurchaseOrderCreate`
```json
{
  "outlet_id": null,
  "is_transfer": false,
  "from_tenant_id": null,
  "po_number": "PO-2026-001",
  "supplier_name": "Fresh Farms Ltd",
  "supplier_contact": "+8801700000000",
  "expected_delivery": "2026-07-05T10:00:00Z",
  "notes": null,
  "line_items": [
    { "inventory_item_id": "<uuid>", "quantity_ordered": "20.000", "unit_cost": "350.00" }
  ]
}
```

**Response `201`:** `PurchaseOrderResponse` (status: `draft`)

---

### `PATCH /inventory/purchase-orders/{po_id}/submit`

Moves PO from `draft` → `submitted`.

**Response `200`:** `PurchaseOrderResponse`

---

### `PATCH /inventory/purchase-orders/{po_id}/approve`

Roles: Senior admin roles only.  
Moves PO from `submitted` → `approved`.

**Response `200`:** `PurchaseOrderResponse`

---

### `PATCH /inventory/purchase-orders/{po_id}/receive`

**Request body:** `ReceivePORequest`
```json
{
  "received_quantities": {
    "<po_item_id>": "18.000"
  },
  "notes": "2 kg short — supplier to follow up"
}
```

Side effects:
- PO status → `received`
- For each line item: `quantity_on_hand += quantity_received`; creates `purchase` movement record

Errors: `400 "Purchase order already received"`

**Response `200`:** `PurchaseOrderResponse`

---

### `POST /inventory/transfer`

Roles: `super_admin`, `platform_admin`

**Request body:** `TransferRequest`
```json
{
  "inventory_item_id": "<central_item_uuid>",
  "outlet_id": "<outlet_tenant_uuid>",
  "quantity": "5.000",
  "notes": "Weekly stock transfer to Gulshan branch"
}
```

Rules: Central item must have `is_central=TRUE` and sufficient `quantity_on_hand` (INV-5).

Side effects:
- Deducts from central item; creates `transfer_out` movement
- Finds/creates matching outlet item; adds stock; creates `transfer_in` movement

**Response `200`:** `{ "transferred": "5.000", "central_remaining": "15.000" }`

---

### `GET /inventory/central`

Roles: `super_admin`, `platform_admin`

**Response `200`:** `list[InventoryItemResponse]` where `is_central=TRUE`

---

### `GET /inventory/reports`

**Response `200`:** `StockSummaryResponse` (same as `/analytics/inventory-value`)

---

## QR Codes — `/qr`

### `GET /qr/order/{order_id}/base64`

Auth: Required | Roles: `student`, `customer` (own orders only)

**Response `200`:**
```json
{ "base64": "data:image/png;base64,iVBORw0KGgo..." }
```

QR content: `{SERVER_HOST}/{tenant_slug}/track/{order_id}`

---

### `GET /qr/order/{order_id}/png`

Auth: Required | Roles: `student`, `customer` (own orders only)

**Response:** PNG binary (`Content-Type: image/png`)

---

### `GET /qr/table/{table_id}/png`

Auth: Required | Roles: Admin roles

**Response:** PNG binary

QR content: `{SERVER_HOST}/{tenant_slug}/scan/{table_id}`

---

## Memo — `/memo`

### `POST /memo/generate`

Auth: Required | Roles: Admin roles

**Request body:**
```json
{
  "title": "Weekly Report — W26",
  "period": "week",
  "include_revenue": true,
  "include_top_items": true,
  "include_inventory": false
}
```

**Response:** PDF binary (`Content-Type: application/pdf`)  
Generated by: reportlab 4.1.0

---

## Receipts — `/receipts`

### `GET /receipts/{order_id}/pdf`

Auth: Required | Roles: `student`, `customer` (own orders only)

**Response:** PDF binary (`Content-Type: application/pdf`)

---

## Tenants — `/tenants`

All tenant management endpoints: Auth Required | Roles: `platform_admin` (unless noted).

### `GET /tenants/`

**Response `200`:** `TenantListResponse`
```json
{ "items": [ ... ], "total": 6 }
```

---

### `POST /tenants/`

**Request body:** `TenantCreate`
```json
{
  "name": "BRACU Cafeteria",
  "slug": "bracu",
  "tenant_type": "academic",
  "subscription_tier": "professional",
  "parent_tenant_id": null,
  "logo_url": null,
  "brand_color": "#1A4D2E",
  "allowed_email_domain": "@g.bracu.ac.bd",
  "address": "66 Mohakhali, Dhaka",
  "city": "Dhaka",
  "phone": "+8801700000000",
  "contact_email": "cafe@bracu.ac.bd",
  "homemade_enabled": false,
  "inventory_strict_mode": true
}
```

| Field | Type | Constraint |
|---|---|---|
| `slug` | str | 2–80 chars, pattern `^[a-z0-9-]+$` |
| `brand_color` | str | max 7 chars (hex e.g. `#1A4D2E`) |

**Response `201`:** `TenantResponse`

---

### `GET /tenants/{tenant_id}`

**Response `200`:** `TenantResponse`

---

### `PUT /tenants/{tenant_id}`

**Request body:** `TenantUpdate` (all fields optional)

**Response `200`:** `TenantResponse`

---

### `PATCH /tenants/{tenant_id}/activate`

**Response `200`:** `{ "is_active": true }`

---

### `PATCH /tenants/{tenant_id}/suspend`

**Response `200`:** `{ "is_active": false }`

---

### `GET /tenants/public` ❌ [Phase 14 — Not yet implemented]

Auth: **None** (public)

**Response `200`:** `[{ "name": "...", "slug": "...", "tenant_type": "...", "logo_url": "...", "city": "..." }]`

See RFC: [RFC-001](../rfcs/RFC-001-tenant-discovery.md)

---

### `GET /tenants/public/{slug}` ❌ [Phase 14 — Not yet implemented]

Auth: **None** (public)

**Response `200`:** Single public tenant profile (subset of `TenantResponse`)

---

### `PATCH /tenants/me/settings` ❌ [Phase 15 — Not yet implemented]

Auth: Required | Roles: `tenant_admin`, `outlet_admin`, `food_court_admin`

See RFC: [RFC-002](../rfcs/RFC-002-admin-settings.md)

---

### `POST /tenants/me/logo` ❌ [Phase 15 — Not yet implemented]

Auth: Required | Roles: Admin roles

Body: `multipart/form-data` with image file.

**Response `200`:** `{ "logo_url": "/media/logos/{tenant_id}.png" }`

---

## Users — `/users`

### `GET /users/`

Auth: Required | Roles: Admin roles

**Response `200`:** `list[UserResponse]` — all users in this tenant

---

### `PATCH /users/{user_id}/activate`

Auth: Required | Roles: Admin roles

**Response `200`:** `{ "is_active": true }`

---

### `PATCH /users/{user_id}/deactivate`

Auth: Required | Roles: Admin roles

**Response `200`:** `{ "is_active": false }`

---

### `POST /users/invite` ❌ [Phase 21 — Not yet implemented]

Auth: Required | Roles: Admin roles

**Request body:** `{ "email": "...", "role": "staff" }`

---

### `POST /users/accept-invite` ❌ [Phase 21 — Not yet implemented]

Auth: **None**

---

## Food Court — `/food-court`

> **Guard:** ALL endpoints below require `tenant_type == food_court` in the JWT (rule FC-1). A `food_court_vendor` JWT returns `403` regardless of role.

### `GET /food-court/vendors`

Roles: `food_court_admin`, `customer`, `server`, `cleaner`

**Response `200`:** `[{ "tenant_id": "<uuid>", "name": "Burger Joint", "slug": "unimart-burger", "is_active": true }]`

---

### `GET /food-court/menu`

Roles: `food_court_admin`, `customer`, `server`

**Response `200`:** Items from ALL active vendor tenants (not the parent food court tenant itself — rule FC-6). Each item includes vendor context.

---

### `GET /food-court/tables`

Roles: `food_court_admin`, `server`, `customer`

**Response `200`:** `list[TableResponse]` — tables owned by the food court parent tenant (shared floor)

---

### `POST /food-court/tables`

Roles: `food_court_admin` only

**Request body:** Same as `POST /tables/`

**Response `201`:** `TableResponse`

---

### `PATCH /food-court/tables/{table_id}/status`

Roles: `food_court_admin`, `server`

**Request body:** `{ "status": "occupied" }`

**Response `200`:** `TableResponse`

---

### `GET /food-court/orders/active`

Roles: `food_court_admin`, `server`

**Response `200`:** All orders with `status IN (pending, confirmed, preparing, ready)` across ALL vendor tenants in the family scope (uses `accessible_tenant_ids()`).

---

### `PATCH /food-court/orders/{order_id}/deliver`

Roles: `server` only

Rules: Order `status` must be `ready` (FC-5); `400` otherwise.

**Response `200`:** `{ "order_id": "<uuid>", "status": "delivered" }`

---

### `GET /food-court/staff`

Roles: `food_court_admin` only

**Response `200`:** `list[UserResponse]` — users with role `server` or `cleaner` in the food court parent tenant

---

### `GET /food-court/analytics`

Roles: `food_court_admin` only

**Response `200`:**
```json
{
  "table_occupancy": {
    "available": 12, "reserved": 2, "occupied": 5, "cleaning": 1
  },
  "vendor_order_counts": [
    { "vendor_id": "<uuid>", "vendor_name": "Burger Joint", "order_count": 18 }
  ]
}
```

---

### `GET /food-court/settlements`

Roles: `food_court_admin` only

Query: `?period=today` (`today` | `week` | `month`)

**Response `200`:**
```json
[
  {
    "vendor_id": "<uuid>",
    "vendor_name": "Burger Joint",
    "total_revenue": "4200.00",
    "order_count": 35
  }
]
```

---

## Planned Auth Endpoints ❌ [Phase 19]

See RFC: [RFC-004](../rfcs/RFC-004-password-reset.md)

| Endpoint | Purpose |
|---|---|
| `POST /auth/forgot-password` | Send password reset OTP to email |
| `POST /auth/reset-password` | Accept OTP + new password |
| `POST /auth/change-password` | Authenticated user changes own password |
| `POST /auth/refresh` | Issue new token from valid non-expired token |
| `PATCH /auth/me` | Update own profile: full_name, phone, student_id |

---

## Notifications ❌ [Phase 21]

| Endpoint | Purpose |
|---|---|
| `GET /notifications` | List own notifications |
| `PATCH /notifications/{id}/read` | Mark one notification as read |

---

## Health Check

### `GET /health`

Auth: None

**Response `200`:** `{ "status": "ok", "service": "SCMS API", "version": "3.1.0" }`

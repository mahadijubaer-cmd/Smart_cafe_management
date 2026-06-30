# Spec 06 — Business Rules

**Last updated:** 2026-06-30  
**Status:** Authoritative

> These rules are the contract between the product and its users. Any rule change requires updating this file first (spec-first), then updating the relevant test in `tests/` to assert the new behaviour, then updating the implementation.

---

## 1. Order Rules

### OR-1: Time Slot Must Be in the Future
`time_slot` must be strictly in the future at the moment of order placement.  
Violation: `400 "Time slot must be in the future"`

### OR-2: All Items Must Be Available
Every item in the order must have `is_available = TRUE`.  
Violation: `400 "Item '{name}' is currently unavailable"`

### OR-3: Strict Inventory Mode Blocks Out-of-Stock Items
When `tenant.inventory_strict_mode = TRUE`:  
For each order item with recipe entries, compute: `required = quantity_per_serving × order_quantity`.  
If `inventory_item.quantity < required`: `400 "Insufficient stock for '{menu_item_name}'"`  
When `inventory_strict_mode = FALSE`: orders go through regardless of stock level; stock can go negative (deficit is flagged in movement records with `notes = "deficit"`).

### OR-4: Table Lock Prevents Double-Booking
When `table_id` is provided in the order request:  
Acquire Redis lock `lock:order:{table_id}` with NX (set if not exists) and 30s TTL.  
If lock already held: `409 "Table is currently being reserved. Please try again."`  
Lock is released after the order transaction commits (success or failure).

### OR-5: Total Amount Is Calculated Server-Side
The client MUST NOT send a total amount. The server calculates `total_amount = Σ (unit_price_snapshot × quantity)` for all items. Client-submitted totals are ignored.

### OR-6: Wallet Deduction Is Atomic
The wallet deduction and order creation happen in a single database transaction.  
If wallet balance < `total_amount`: `400 "Insufficient wallet balance"`  
If the transaction fails for any reason, the wallet balance is NOT decreased.

### OR-7: Price Snapshot
`order_items.unit_price` = `menu_items.price` at the moment the order is placed.  
Subsequent changes to `menu_items.price` do NOT affect existing `order_items`.

### OR-8: Status Transition Machine
Valid transitions:
```
pending    → confirmed
pending    → cancelled
confirmed  → preparing
confirmed  → cancelled
preparing  → ready
ready      → delivered
```
Any other transition is rejected: `400 "Invalid status transition from {current} to {requested}"`

### OR-9: Cancellation Refunds the Full Amount
On order cancellation:  
`users.wallet_balance += order.total_amount`  
A new `wallet_transaction` with positive `amount` is created.  
A `payment` record is NOT created for the refund (refunds only appear in wallet_transactions).

### OR-10: Customers Cancel Own Orders (Pending Only)
A customer can only cancel their own orders when `status = pending`.  
Admin roles can cancel any order in `pending` or `confirmed` status.

---

## 2. Inventory Rules

### INV-1: Consumption Movement on Order
When an order is placed, for each `order_item`:  
For each recipe entry: deduct `quantity_per_serving × order_item.quantity` from `inventory_items.quantity_on_hand`.  
A `consumption` movement record is created for each deduction with `performed_by = order.user_id`, including `quantity_before` and `quantity_after` snapshots.

### INV-2: Inventory Lock During Deduction
Before decrementing any inventory item, acquire Redis lock `lock:inv:{item_id}` (10s TTL, NX).  
If lock cannot be acquired within 3 retries (each 100ms): `503 "Inventory temporarily locked. Retry."`  
Lock is released immediately after the deduction commits.

### INV-3: Quantity Cannot Go Below Zero (Strict Mode)
When `inventory_strict_mode = TRUE`: quantity is pre-validated before any deduction.  
Quantity never goes below 0 in strict mode.  
When `inventory_strict_mode = FALSE`: quantity can go negative (deficit tracking).

### INV-4: Low Stock Alert After Consume
After every `consumption` movement, if `quantity_on_hand <= reorder_level`:  
Send WebSocket `LOW_STOCK` event to all connections in the tenant.  
(Notification record creation is planned; currently only WebSocket event is emitted.)

### INV-5: Transfer Requires Sufficient Central Stock
`POST /inventory/transfer` requires `central_item.quantity_on_hand >= transfer_quantity`.  
Violation: `400 "Insufficient central stock"`  
On success: two movement records created — one `transfer_out` on the central item (negative delta) and one `transfer_in` on the outlet item (positive delta).

### INV-6: Purchase Order Receive Adds Stock
`PATCH /inventory/purchase-orders/{id}/receive` changes PO status to `received` and adds `received_quantities` to `quantity_on_hand` for each line item.  
A `purchase` movement record is created per line item, with `purchase_order_id` set.  
Receiving an already-received PO: `400 "Purchase order already received"`

### INV-7: Manual Adjust Cannot Result in Negative Quantity
`PATCH /inventory/items/{id}/adjust` with a negative `quantity_delta` is rejected if the result would be < 0.  
Violation: `400 "Adjustment would result in negative stock"`

---

## 3. Food Court Rules

### FC-1: Vendor JWT Cannot Access Food Court Endpoints
The `_require_food_court()` guard reads `ctx.tenant_type` from the request.  
If `ctx.tenant_type != food_court`: `403 "Food court access only"`  
This runs before any role check — vendor admins cannot access any `/food-court/*` endpoint, regardless of their role.

### FC-2: Family Scope in Food Court Router Only
The `accessible_tenant_ids()` function (returns food_court_id + all vendor_ids) is ONLY used inside `backend/app/routers/food_court.py`.  
All other routers use strict `tenant_id = ctx.tenant_id`. A vendor tenant's admin accessing `/orders/` sees ONLY their own vendor's orders — not other vendors' orders.

### FC-3: Shared Tables Belong to Food Court Parent
Tables at a food court (shared dining floor tables) are owned by the food court parent tenant (`tenant_id = food_court_id`).  
Vendor tenants have no tables in `tables_map`. Vendors do not call `/tables/*` — only the food court parent does.

### FC-4: Shared Staff Belong to Food Court Parent
Users with role `server` or `cleaner` at a food court have `tenant_id = food_court_id`.  
They do NOT belong to any vendor tenant.

### FC-5: Server Can Only Deliver "Ready" Orders
`PATCH /food-court/orders/{order_id}/deliver` requires the order's `status = ready`.  
If status is `pending`, `confirmed`, or `preparing`: `400 "Order is not ready for delivery"`

### FC-6: Unified Menu Excludes Parent Items
`GET /food-court/menu` queries: `tenant_id IN (vendor_ids only)` — excludes the food court parent's own tenant_id.  
The parent food court has no menu items of its own.

### FC-7: Vendor-to-Vendor Isolation Still Applies
Even within a food court, vendor A cannot read vendor B's orders, menu items, or inventory via any standard API endpoint. Only the food court admin (via food-court endpoints) can see cross-vendor data.

---

## 4. Tenant Isolation Rules

### TI-1: Every Tenant-Scoped Query Must Filter by tenant_id
Every `SELECT`, `UPDATE`, or `DELETE` on a tenant-scoped table MUST include `.where(Model.tenant_id == ctx.tenant_id)`.  
Absence of this filter is a critical security bug that allows cross-tenant data leakage.

### TI-2: Tenant Isolation Via JWT Claims
The backend middleware (`TenantContextMiddleware`) reads `tenant_id` directly from the JWT payload and populates `request.state.tenant_ctx`. All DB queries then filter by `ctx.tenant_id`. A user cannot access another tenant's data because their JWT embeds only their own `tenant_id`.

### TI-3: Slugs Are Globally Unique
The `slug` column in the `tenants` table has a UNIQUE constraint. Each slug maps to exactly one tenant. Routes are scoped to `[tenant_slug]` so the JWT tenant_id is verified at the DB query layer.

### TI-4: Inactive Users Cannot Access the System
If a user's `is_active = FALSE`, `get_current_user()` returns `401 "Could not validate credentials"`. Tenant-level deactivation is handled by deactivating all users in that tenant — there is no middleware-level tenant `is_active` check currently.

---

## 5. Wallet Rules

### WAL-1: Only Tenant-Scoped Top-Up
An admin can top up any user's wallet only within their own tenant (`ctx.tenant_id` from JWT enforces this).  
`platform_admin` can top up any user but must be authenticated with a tenant-scoped JWT.

### WAL-2: Wallet Cannot Go Negative
Order placement fails before deduction if `wallet_balance < total_amount` (Rule OR-6).  
There is no credit/overdraft facility.

### WAL-3: Wallet Balance Is Stored Denormalized
`users.wallet_balance` is kept up-to-date with every transaction. This is a denormalized field for performance.  
The authoritative audit trail is `wallet_transactions`. In case of discrepancy, `wallet_transactions` is the source of truth.

---

## 6. Reward Points Rules

### RWD-1: Reward Points Accumulate on Every Order
Every successful order placement awards the customer `floor(total_amount / 10)` reward points.  
Example: order totalling ৳240 → 24 points added to `users.reward_points`.

### RWD-2: Redeeming Points for Discount
If `OrderCreate.redeem_points = true` and `user.reward_points >= 10`:  
- Discount = `floor(user.reward_points / 10)` taka, capped at 20% of `total_amount`  
- `order.discount_amount` is set to this discount  
- `order.total_amount` is reduced accordingly before wallet deduction  
- `users.reward_points` is reset to 0 after redemption  

If `reward_points < 10`: `400 "Insufficient reward points"`

### RWD-3: Points Are Awarded After Discount Is Applied
Reward points for a discounted order are earned on the post-discount total, not the pre-discount total.

### RWD-4: Points Are Not Awarded on Cancelled Orders
If an order is cancelled and refunded (OR-9), reward points credited for that order are also reversed.  
`users.reward_points -= floor(original_total / 10)`  
Reward points balance cannot go below 0.

---

## 7. Stock Movement Types

All inventory changes are recorded as movements in `inventory_movements`. Valid `movement_type` values:

| Type | When Created |
|---|---|
| `purchase` | When a PO is received (`PATCH /inventory/purchase-orders/{id}/receive`) |
| `transfer_in` | Outlet receives stock from central store (`POST /inventory/transfer`) |
| `transfer_out` | Central store sends stock to outlet (`POST /inventory/transfer`) |
| `consumption` | Ingredient consumed when an order is placed (INV-1) |
| `adjustment` | Manual positive stock adjustment (`PATCH /inventory/items/{id}/adjust`) |
| `waste` | Manual negative stock write-off (`PATCH /inventory/items/{id}/adjust` with negative delta) |

Every movement record stores `quantity_before`, `quantity_after`, and `quantity_delta` (negative means decrease).

---

## 8. Email / Domain Restriction Rules

### DOM-1: Domain Restriction Applies Only at Registration
`allowed_email_domain` is checked only during `POST /auth/register`.  
Users who were registered before the domain restriction was set are not affected.

### DOM-2: Domain Restriction Format
The value in `allowed_email_domain` must start with `@`, e.g. `@g.bracu.ac.bd`.  
Validation: `email.endswith(tenant.allowed_email_domain)`.

---

## 7. OTP Rules

### OTP-1: OTP Is Single-Use
Once an OTP is successfully verified, the Redis key is immediately deleted.  
Reuse of the same code on the same purpose returns `400 "OTP expired or not found"`.

### OTP-2: Maximum 5 Attempts
If `attempt_count >= 5`, the OTP key is deleted and the response is `400 "Too many failed attempts. Request a new OTP."`.  
The user must request a new OTP.

### OTP-3: Purpose Namespace Isolation
OTP codes for different purposes are stored under separate keys:  
`otp:email_verification:alice@bracu.ac.bd` vs `otp:login:alice@bracu.ac.bd`  
An OTP issued for `email_verification` cannot be used for `login` — purpose must match exactly.  
Valid purpose values: `email_verification` | `login` | `password_reset`

### OTP-4: 10-Minute Expiry
OTP keys in Redis have TTL = 600 seconds. After 600 seconds the key no longer exists and any verify attempt returns `400 "OTP expired or not found"`.

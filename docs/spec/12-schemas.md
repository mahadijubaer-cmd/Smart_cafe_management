# Spec 12 — Pydantic Schema Reference

**Last updated:** 2026-06-30  
**Status:** Authoritative

> This file documents every Pydantic request and response schema in `backend/app/schemas/`. Each field lists its Python type, whether it is required, its default, and any validators (min/max length, pattern, numeric bounds). This is the ground-truth contract between the frontend and the backend.
>
> **Rule:** When changing a validator or field, update this file first. The FastAPI auto-docs at `/docs` are generated from the actual code — they do NOT override this spec; the spec drives code changes.

---

## Module: Auth — `schemas/user.py`

### `UserCreate` (Request — `POST /auth/register`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `email` | `EmailStr` | Yes | — | Valid email format (pydantic EmailStr) |
| `password` | `str` | Yes | — | `min_length=8` |
| `full_name` | `str` | Yes | — | `min_length=2`, `max_length=100` |
| `role` | `UserRole` | No | `"customer"` | Must be one of 10 valid UserRole values |
| `tenant_slug` | `str` | Yes | — | Must resolve to an active tenant |
| `student_id` | `str \| None` | No | `None` | — |
| `phone` | `str \| None` | No | `None` | — |

### `UserLogin` (Request — `POST /auth/login`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `email` | `EmailStr` | Yes | — | — |
| `password` | `str` | Yes | — | — |
| `tenant_slug` | `str` | Yes | — | — |

### `UserResponse` (Response)

| Field | Type | Notes |
|---|---|---|
| `user_id` | `UUID` | — |
| `email` | `str` | — |
| `full_name` | `str` | — |
| `role` | `str` | One of 10 UserRole values |
| `tenant_id` | `UUID` | — |
| `outlet_id` | `UUID \| None` | Set for franchise_outlet users |
| `employee_id` | `str \| None` | For staff/admin roles |
| `wallet_balance` | `Decimal` | Serialized as string e.g. `"350.00"` |
| `reward_points` | `int` | Accumulated order reward points |
| `email_verified` | `bool` | Set to True after OTP email_verification |
| `is_active` | `bool` | Account active flag |
| `created_at` | `datetime` | UTC ISO-8601 |

### `Token` (Response — `POST /auth/register`, `POST /auth/login`)

| Field | Type | Notes |
|---|---|---|
| `access_token` | `str` | JWT string |
| `token_type` | `str` | Always `"bearer"` |
| `user_id` | `UUID` | — |
| `tenant_id` | `UUID` | — |
| `tenant_type` | `str` | One of 7 TenantType values |
| `tenant_slug` | `str` | — |
| `outlet_id` | `UUID \| None` | — |
| `role` | `str` | One of 10 UserRole values |

### `UserUpdate` (Request — `PATCH /auth/me` — Phase 19)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `full_name` | `str \| None` | No | 2–100 chars |
| `phone` | `str \| None` | No | — |
| `student_id` | `str \| None` | No | — |

---

## Module: OTP — `schemas/otp.py`

### `OtpSendRequest` (Request — `POST /otp/send`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `email` | `EmailStr` | Yes | — |
| `purpose` | `str` | Yes | Pattern: `^(login\|email_verification\|password_reset)$` |
| `tenant_slug` | `str` | Yes | — |

### `OtpVerifyRequest` (Request — `POST /otp/verify`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `email` | `EmailStr` | Yes | — |
| `purpose` | `str` | Yes | Pattern: `^(login\|email_verification\|password_reset)$` |
| `otp_code` | `str` | Yes | `min_length=6`, `max_length=6`, pattern `^[0-9]{6}$` |
| `tenant_slug` | `str` | Yes | — |

**Important:** The field is `otp_code`, NOT `code`.

---

## Module: Menu — `schemas/menu.py`

### `CategoryCreate` (Request)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `name` | `str` | Yes | — |
| `display_order` | `int` | No | Default `0` |
| `icon_url` | `str \| None` | No | — |

### `CategoryResponse` (Response)

| Field | Type |
|---|---|
| `category_id` | `int` |
| `name` | `str` |
| `icon_url` | `str \| None` |
| `display_order` | `int` |

### `MenuItemCreate` (Request — `POST /menu/items`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `category_id` | `int` | Yes | — | Must exist in tenant |
| `name` | `str` | Yes | — | `min_length=1`, `max_length=100` |
| `description` | `str \| None` | No | `None` | — |
| `price` | `Decimal` | Yes | — | `ge=0` |
| `image_url` | `str \| None` | No | `None` | — |
| `is_available` | `bool` | No | `True` | — |
| `is_homemade` | `bool` | No | `False` | — |
| `prep_time_mins` | `int` | No | `10` | — |

### `MenuItemUpdate` (Request — `PUT /menu/items/{item_id}`)

All fields from `MenuItemCreate`; same constraints; all required for a full replacement.

### `MenuItemResponse` (Response)

| Field | Type |
|---|---|
| `item_id` | `UUID` |
| `category_id` | `int` |
| `name` | `str` |
| `description` | `str \| None` |
| `price` | `Decimal` |
| `image_url` | `str \| None` |
| `is_available` | `bool` |
| `is_homemade` | `bool` |
| `prep_time_mins` | `int` |
| `created_at` | `datetime` |

### `RecipeLineCreate` (Request — `POST /menu/items/{item_id}/recipe`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `inventory_item_id` | `UUID` | Yes | Must exist in tenant |
| `quantity_per_serving` | `Decimal` | Yes | `gt=0` |

### `RecipeLineResponse` (Response)

| Field | Type |
|---|---|
| `recipe_id` | `UUID` |
| `tenant_id` | `UUID` |
| `menu_item_id` | `UUID` |
| `inventory_item_id` | `UUID` |
| `quantity_per_serving` | `Decimal` |

---

## Module: Orders — `schemas/order.py`

### `OrderItemCreate` (nested inside `OrderCreate`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `item_id` | `UUID` | Yes | — |
| `quantity` | `int` | Yes | `gt=0` |

### `OrderCreate` (Request — `POST /orders/`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `items` | `list[OrderItemCreate]` | Yes | — | `min_length=1` |
| `table_id` | `int \| None` | No | `None` | Table SERIAL integer |
| `time_slot` | `datetime` | Yes | — | Must be in the future (OR-1) |
| `special_notes` | `str \| None` | No | `None` | — |
| `redeem_points` | `bool` | No | `False` | See RWD-1 in `06-business-rules.md` |

**Note:** Field is `special_notes`, NOT `notes`.

### `OrderUpdateStatus` (Request — `PATCH /orders/{order_id}/status`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `status` | `OrderStatus` | Yes | One of: `pending\|confirmed\|preparing\|ready\|delivered\|cancelled` |

### `OrderItemResponse` (nested in `OrderResponse`)

| Field | Type |
|---|---|
| `order_item_id` | `UUID` |
| `item_id` | `UUID` |
| `quantity` | `int` |
| `unit_price` | `Decimal` |
| `subtotal` | `Decimal` |

**Note:** `subtotal` is a PostgreSQL GENERATED column (`unit_price * quantity`), not set by backend code.

### `OrderResponse` (Response)

| Field | Type | Notes |
|---|---|---|
| `order_id` | `UUID` | — |
| `user_id` | `UUID` | — |
| `table_id` | `int \| None` | SERIAL integer, not UUID |
| `time_slot` | `datetime` | — |
| `status` | `str` | OrderStatus value |
| `total_amount` | `Decimal` | Server-calculated (OR-5) |
| `discount_amount` | `Decimal` | From reward point redemption |
| `payment_status` | `str` | `unpaid\|paid\|refunded` |
| `payment_method` | `str \| None` | `wallet\|simulation\|bkash\|nagad\|card` |
| `special_notes` | `str \| None` | — |
| `created_at` | `datetime` | — |
| `updated_at` | `datetime` | — |
| `items` | `list[OrderItemResponse]` | — |

---

## Module: Tables — `schemas/table.py`

### `TableCreate` (Request — `POST /tables/`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `table_number` | `str` | Yes | — | — |
| `zone` | `str` | No | `"indoor"` | — |
| `capacity` | `int` | Yes | — | — |
| `position_x` | `int \| None` | No | `None` | — |
| `position_y` | `int \| None` | No | `None` | — |

### `TableUpdateStatus` (Request — `PATCH /tables/{table_id}/status`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `status` | `str` | Yes | One of: `available\|reserved\|occupied\|cleaning` |

### `TableResponse` (Response)

| Field | Type | Notes |
|---|---|---|
| `table_id` | `int` | SERIAL INTEGER, not UUID |
| `table_number` | `str` | — |
| `zone` | `str` | Default `"indoor"` |
| `capacity` | `int` | — |
| `status` | `str` | Table status enum |
| `position_x` | `int \| None` | — |
| `position_y` | `int \| None` | — |

**Note:** There is NO `last_cleaned_at` field on `TableResponse`.

---

## Module: Cleaners — `schemas/cleaner.py`

### `CleanerAssignmentCreate` (Request — `POST /cleaners/logs`)

| Field | Type | Req? |
|---|---|---|
| `table_id` | `int` | Yes |
| `cleaner_id` | `UUID` | Yes |

### `CleanerAssignmentResponse` (Response — cleaner viewing own assignments)

| Field | Type |
|---|---|
| `log_id` | `UUID` |
| `cleaner_id` | `UUID` |
| `table_id` | `int` |
| `status` | `str` |
| `assigned_at` | `datetime` |
| `cleaned_at` | `datetime \| None` |
| `table` | `TableResponse` |

### `CleanerAssignmentAdminResponse` (Response — admin viewing logs)

All fields from `CleanerAssignmentResponse` PLUS:

| Field | Type |
|---|---|
| `cleaner` | `UserResponse` |

---

## Module: Payments — `schemas/payment.py`

### `PaymentCreate` (Request — `POST /payments/pay`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `order_id` | `UUID` | Yes | — |
| `method` | `str` | Yes | Pattern: `^(wallet\|simulation)$` — only these two accepted currently |

**Note:** `bkash`, `nagad`, `card` appear in the `PaymentMethod` enum but the `PaymentCreate` schema restricts to `wallet|simulation` until payment gateway integration is complete.

### `TopupRequest` (Request — `POST /payments/topup`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `amount` | `Decimal` | Yes | `gt=0`, `le=10000` |

### `PaymentResponse` (Response)

| Field | Type |
|---|---|
| `payment_id` | `UUID` |
| `order_id` | `UUID` |
| `amount` | `Decimal` |
| `method` | `str` |
| `status` | `str` |

### `PaymentHistoryResponse` (Response — `GET /payments/history`)

All fields from `PaymentResponse` PLUS:

| Field | Type |
|---|---|
| `created_at` | `datetime` |
| `transaction_ref` | `str \| None` |
| `order` | nested order summary |

---

## Module: Inventory — `schemas/inventory.py`

### `InventoryCategoryCreate` (Request)

| Field | Type | Req? |
|---|---|---|
| `name` | `str` | Yes |
| `description` | `str \| None` | No |

### `InventoryCategoryResponse` (Response)

| Field | Type |
|---|---|
| `inv_category_id` | `int` |
| `tenant_id` | `UUID` |
| `name` | `str` |
| `description` | `str \| None` |

### `InventoryItemCreate` (Request — `POST /inventory/items`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `inv_category_id` | `int` | Yes | — | Must exist in tenant |
| `outlet_id` | `UUID \| None` | No | `None` | — |
| `is_central` | `bool` | No | `False` | — |
| `name` | `str` | Yes | — | — |
| `sku` | `str \| None` | No | `None` | — |
| `unit` | `InventoryUnit` | Yes | — | One of: `kg\|g\|liter\|ml\|piece\|dozen\|box` |
| `quantity_on_hand` | `Decimal` | No | `0` | — |
| `reorder_level` | `Decimal` | No | `0` | — |
| `reorder_quantity` | `Decimal` | No | `0` | — |
| `unit_cost` | `Decimal` | No | `0` | — |
| `supplier_name` | `str \| None` | No | `None` | — |
| `supplier_contact` | `str \| None` | No | `None` | — |
| `notes` | `str \| None` | No | `None` | — |

### `InventoryItemUpdate` (Request — `PUT /inventory/items/{item_id}`)

All fields from `InventoryItemCreate`; all optional (PATCH-like semantics despite HTTP PUT verb).

### `InventoryItemResponse` (Response)

All fields from `InventoryItemCreate` as read back PLUS:
- `inventory_item_id: UUID`
- `tenant_id: UUID`
- `is_low_stock: bool` (computed: `quantity_on_hand <= reorder_level`)

### `StockAdjustRequest` (Request — `PATCH /inventory/items/{item_id}/adjust`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `quantity_delta` | `Decimal` | Yes | Cannot make `quantity_on_hand` go below 0 (INV-7) |
| `notes` | `str \| None` | No | — |

### `InventoryMovementResponse` (Response)

| Field | Type |
|---|---|
| `movement_id` | `UUID` |
| `tenant_id` | `UUID` |
| `inventory_item_id` | `UUID` |
| `movement_type` | `str` |
| `quantity_delta` | `Decimal` |
| `quantity_before` | `Decimal` |
| `quantity_after` | `Decimal` |
| `order_id` | `UUID \| None` |
| `purchase_order_id` | `UUID \| None` |
| `performed_by` | `UUID \| None` |
| `notes` | `str \| None` |
| `created_at` | `datetime` |

### `PurchaseOrderLineCreate` (nested in `PurchaseOrderCreate`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `inventory_item_id` | `UUID` | Yes | Must exist in tenant |
| `quantity_ordered` | `Decimal` | Yes | `gt=0` |
| `unit_cost` | `Decimal` | No | — |

### `PurchaseOrderCreate` (Request — `POST /inventory/purchase-orders`)

| Field | Type | Req? | Default |
|---|---|---|---|
| `outlet_id` | `UUID \| None` | No | `None` |
| `is_transfer` | `bool` | No | `False` |
| `from_tenant_id` | `UUID \| None` | No | `None` |
| `po_number` | `str \| None` | No | `None` |
| `supplier_name` | `str \| None` | No | `None` |
| `supplier_contact` | `str \| None` | No | `None` |
| `expected_delivery` | `datetime \| None` | No | `None` |
| `notes` | `str \| None` | No | `None` |
| `line_items` | `list[PurchaseOrderLineCreate]` | Yes | — |

**Note:** `line_items` is required and must be a list. The PO is multi-line — a single PO can cover multiple inventory items.

### `ReceivePORequest` (Request — `PATCH /inventory/purchase-orders/{po_id}/receive`)

| Field | Type | Req? | Constraints |
|---|---|---|---|
| `received_quantities` | `dict[str, Decimal]` | Yes | Key = `po_item_id` (UUID as string), value = received quantity |
| `notes` | `str \| None` | No | — |

**Example:**
```json
{
  "received_quantities": {
    "3fa85f64-5717-4562-b3fc-2c963f66afa6": "18.000"
  }
}
```

### `TransferRequest` (Request — `POST /inventory/transfer`)

| Field | Type | Req? |
|---|---|---|
| `inventory_item_id` | `UUID` | Yes |
| `outlet_id` | `UUID` | Yes |
| `quantity` | `Decimal` | Yes |
| `notes` | `str \| None` | No |

### `PurchaseOrderResponse` (Response)

| Field | Type |
|---|---|
| `po_id` | `UUID` |
| `tenant_id` | `UUID` |
| `outlet_id` | `UUID \| None` |
| `is_transfer` | `bool` |
| `from_tenant_id` | `UUID \| None` |
| `po_number` | `str \| None` |
| `status` | `str` |
| `supplier_name` | `str \| None` |
| `supplier_contact` | `str \| None` |
| `expected_delivery` | `datetime \| None` |
| `notes` | `str \| None` |
| `created_at` | `datetime` |
| `line_items` | `list[PurchaseOrderLineResponse]` |

### `StockSummaryResponse` (Response — `GET /analytics/inventory-value`, `GET /inventory/reports`)

| Field | Type |
|---|---|
| `tenant_id` | `UUID` |
| `total_items` | `int` |
| `low_stock_count` | `int` |
| `total_inventory_value` | `Decimal` |
| `items` | `list[InventoryItemResponse]` |

---

## Module: Tenants — `schemas/tenant.py`

### `TenantCreate` (Request — `POST /tenants/`)

| Field | Type | Req? | Default | Constraints |
|---|---|---|---|---|
| `name` | `str` | Yes | — | — |
| `slug` | `str` | Yes | — | `min_length=2`, `max_length=80`, pattern `^[a-z0-9-]+$` |
| `tenant_type` | `TenantType` | Yes | — | One of 7 TenantType values |
| `subscription_tier` | `SubscriptionTier` | No | `"starter"` | `free\|starter\|professional\|enterprise` |
| `parent_tenant_id` | `UUID \| None` | No | `None` | — |
| `logo_url` | `str \| None` | No | `None` | `max_length=255` |
| `brand_color` | `str` | No | `"#1A4D2E"` | `max_length=7` |
| `allowed_email_domain` | `str \| None` | No | `None` | Must start with `@` if set |
| `address` | `str \| None` | No | `None` | — |
| `city` | `str \| None` | No | `None` | — |
| `phone` | `str \| None` | No | `None` | — |
| `contact_email` | `EmailStr \| None` | No | `None` | — |
| `homemade_enabled` | `bool` | No | `False` | — |
| `inventory_strict_mode` | `bool` | No | `True` | — |

### `TenantUpdate` (Request — `PUT /tenants/{tenant_id}`)

All fields from `TenantCreate`; all optional.

### `TenantResponse` (Response)

All `TenantCreate` fields read back PLUS:
- `tenant_id: UUID`
- `is_active: bool`
- `created_at: datetime`

### `TenantListResponse` (Response — `GET /tenants/`)

```json
{ "items": [ TenantResponse, ... ], "total": 6 }
```

---

## Enums Reference

These enums are defined in `backend/app/models/` and used by schemas as valid values.

### `TenantType` (7 values)
`franchise_brand` | `franchise_outlet` | `corporate` | `academic` | `independent_restaurant` | `food_court` | `food_court_vendor`

### `SubscriptionTier` (4 values)
`free` | `starter` | `professional` | `enterprise`

### `UserRole` (10 values)
`platform_admin` | `super_admin` | `outlet_admin` | `tenant_admin` | `food_court_admin` | `staff` | `cleaner` | `server` | `student` | `customer`

> `admin` is a legacy alias for `customer` in the TypeScript frontend types only. The backend enum does not have `admin`.

### `OrderStatus` (6 values)
`pending` | `confirmed` | `preparing` | `ready` | `delivered` | `cancelled`

### `PaymentStatus` (3 values)
`unpaid` | `paid` | `refunded`

### `PaymentMethod` (5 values)
`wallet` | `simulation` | `bkash` | `nagad` | `card`

> Only `wallet` and `simulation` are accepted in `PaymentCreate.method` currently. Others are enum values reserved for future gateway integration.

### `StockMovementType` (6 values)
`purchase` | `transfer_in` | `transfer_out` | `consumption` | `adjustment` | `waste`

### `PurchaseOrderStatus` (5 values)
`draft` | `submitted` | `approved` | `received` | `cancelled`

### `InventoryUnit` (7 values)
`kg` | `g` | `liter` | `ml` | `piece` | `dozen` | `box`

---

## Common Validator Patterns

| Pattern | Used in |
|---|---|
| `^[a-z0-9-]+$` | `TenantCreate.slug` |
| `^(wallet\|simulation)$` | `PaymentCreate.method` |
| `^(login\|email_verification\|password_reset)$` | `OtpSendRequest.purpose`, `OtpVerifyRequest.purpose` |
| `^[0-9]{6}$` | `OtpVerifyRequest.otp_code` |

## Field Naming Conventions

| Convention | Examples |
|---|---|
| UUID primary keys | `user_id`, `tenant_id`, `order_id`, `item_id` |
| Integer primary keys (SERIAL) | `table_id`, `category_id`, `inv_category_id` |
| Timestamps | `created_at`, `updated_at`, `assigned_at`, `cleaned_at` — always UTC ISO-8601 |
| Nullable fields | All optional fields use `| None` union type and default to `None` |
| Decimals | Monetary and quantity fields use `Decimal` (not `float`). Serialized as strings by Pydantic with 2 decimal places for money, variable for quantities. |

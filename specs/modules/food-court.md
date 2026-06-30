# Module: Food Court

**Router:** `backend/app/routers/food_court.py`  
**Last verified:** 2026-06-30

---

## Overview

The food court module enables a multi-vendor shared dining floor. A `food_court` parent tenant manages shared tables and server staff. Multiple `food_court_vendor` child tenants operate independent kitchens with their own menus, inventory, and orders. The `food_court_admin` sees cross-vendor aggregated views through this module.

---

## Guard Rule (FC-1)

**Every endpoint in this module checks `tenant_type == food_court` before any role check.**

If the requesting JWT has `tenant_type != food_court`: `403 "Food court access only"`

A `food_court_vendor` admin (who has a vendor JWT, not a food court JWT) cannot access any `/food-court/*` endpoint, even with an admin role.

---

## API Endpoints

### `GET /api/v1/food-court/vendors`

**Auth:** Required | **Roles:** `food_court_admin`, `customer`, `server`, `cleaner`

**Response `200`:**

```json
[
  {
    "tenant_id": "3fa85f64-...",
    "name": "Burger Joint",
    "slug": "unimart-burger",
    "is_active": true
  }
]
```

Returns all `food_court_vendor` tenants where `parent_tenant_id = ctx.tenant_id`.

---

### `GET /api/v1/food-court/menu`

**Auth:** Required | **Roles:** `food_court_admin`, `customer`, `server`

**Response `200`:** Combined menu items from ALL active vendor tenants.

> Excludes the parent food court tenant's own items (rule FC-6). The food court parent has no menu items of its own.

Each item includes vendor context (which vendor it belongs to).

---

### `GET /api/v1/food-court/tables`

**Auth:** Required | **Roles:** `food_court_admin`, `server`, `customer`

**Response `200`:** `list[TableResponse]` — tables owned by the food court parent tenant

---

### `POST /api/v1/food-court/tables`

**Auth:** Required | **Roles:** `food_court_admin` only

**Request body:** Same as `POST /tables/` (see `modules/tables.md`)

**Response `201`:** `TableResponse`

---

### `PATCH /api/v1/food-court/tables/{table_id}/status`

**Auth:** Required | **Roles:** `food_court_admin`, `server`

**Request body:** `{ "status": "occupied" }`

**Response `200`:** `TableResponse`

---

### `GET /api/v1/food-court/orders/active`

**Auth:** Required | **Roles:** `food_court_admin`, `server`

**Response `200`:** All orders with `status IN (pending, confirmed, preparing, ready)` across ALL vendor tenants in the family scope.

Uses `accessible_tenant_ids()` — returns food court parent + all vendor tenant IDs.

---

### `PATCH /api/v1/food-court/orders/{order_id}/deliver`

**Auth:** Required | **Roles:** `server` only

**Business logic:**
- Order `status` must be `ready` (FC-5)
- `400 "Order is not ready for delivery"` otherwise
- Sets `order.status = delivered`
- Publishes `ORDER_DELIVERED` WebSocket event

**Response `200`:** `{ "order_id": "...", "status": "delivered" }`

---

### `GET /api/v1/food-court/staff`

**Auth:** Required | **Roles:** `food_court_admin` only

**Response `200`:** `list[UserResponse]` — users with role `server` or `cleaner` in the food court parent tenant

---

### `GET /api/v1/food-court/analytics`

**Auth:** Required | **Roles:** `food_court_admin` only

**Response `200`:**

```json
{
  "table_occupancy": {
    "available": 12,
    "reserved": 2,
    "occupied": 5,
    "cleaning": 1
  },
  "vendor_order_counts": [
    { "vendor_id": "...", "vendor_name": "Burger Joint", "order_count": 18 }
  ]
}
```

---

### `GET /api/v1/food-court/settlements`

**Auth:** Required | **Roles:** `food_court_admin` only

**Query params:** `?period=today` — valid: `today | week | month`

**Response `200`:**

```json
[
  {
    "vendor_id": "3fa85f64-...",
    "vendor_name": "Burger Joint",
    "total_revenue": 4200.0,
    "order_count": 35
  }
]
```

---

## Business Rules

### FC-1: Vendor JWT Cannot Access Food Court Endpoints
`tenant_type != food_court` → `403 "Food court access only"`. Checked before role check. A `food_court_vendor` admin cannot access this module regardless of role.

### FC-2: Family Scope Only in Food Court Router
`accessible_tenant_ids()` is used **only inside `food_court.py`**. All other routers use strict `tenant_id = ctx.tenant_id`. A vendor admin accessing `GET /orders/` sees ONLY their own vendor's orders.

### FC-3: Shared Tables Belong to Food Court Parent
Tables in `tables_map` with `tenant_id = food_court_id` are the shared dining floor. Vendor tenants have no tables.

### FC-4: Shared Staff Belong to Food Court Parent
Users with `role = server | cleaner` at a food court have `tenant_id = food_court_id`. They do not belong to any vendor tenant.

### FC-5: Server Can Only Deliver "Ready" Orders
`PATCH /food-court/orders/{id}/deliver` requires `order.status = ready`.  
Error: `400 "Order is not ready for delivery"`

### FC-6: Unified Menu Excludes Parent Items
`GET /food-court/menu` queries `tenant_id IN (vendor_ids only)` — the food court parent's `tenant_id` is excluded. The parent food court has no menu items.

### FC-7: Vendor-to-Vendor Isolation Still Applies
Vendor A cannot read Vendor B's orders, inventory, or menu via standard `/orders/`, `/inventory/`, `/menu/` endpoints. Only the food court admin (via `/food-court/*`) can see cross-vendor data.

---

## Architecture Diagram

```
food_court tenant (parent)
├── tables_map          (shared dining floor)
├── users: server, cleaner   (shared floor staff)
└── food_court_admin role

food_court_vendor A
├── menu_items          (Vendor A's menu)
├── orders              (Vendor A's orders)
├── inventory_items     (Vendor A's stock)
└── tenant_admin role

food_court_vendor B
├── menu_items          (Vendor B's menu)
├── orders              (Vendor B's orders)
├── inventory_items     (Vendor B's stock)
└── tenant_admin role

food_court_admin → sees:
  - All tables (via /food-court/tables)
  - All vendor menus (via /food-court/menu)
  - All active orders (via /food-court/orders/active)
  - Settlement reports (via /food-court/settlements)
```

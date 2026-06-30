# Module: Analytics

**Router:** `backend/app/routers/analytics.py`  
**Last verified:** 2026-06-30

---

## Overview

Provides aggregated reporting for tenant admins. All endpoints are read-only. All responses are plain `dict` or `list[dict]` (not custom Pydantic schemas) serialised directly from DB aggregate queries.

---

## Access

**Auth:** Required | **Roles:** All admin roles (`outlet_admin`, `tenant_admin`, `food_court_admin`, `super_admin`, `platform_admin`)

Exception: `GET /analytics/outlets` is restricted to `super_admin` only.

---

## API Endpoints

### `GET /api/v1/analytics/summary`

**Query params:** `?period=today` — valid: `today | week | month`

**Response `200`:**

```json
{
  "total_orders": 42,
  "total_revenue": 5040.0,
  "avg_order_value": 120.0,
  "total_customers_served": 28,
  "pending_orders": 3,
  "active_tables": 8,
  "cleaners_on_duty": 2
}
```

> `total_revenue`, `avg_order_value` are floats (not Decimal strings).  
> `active_tables` = count of tables with status ≠ `available`.  
> `cleaners_on_duty` = count of active users with role `cleaner`.

---

### `GET /api/v1/analytics/orders-by-hour`

No query params. Always covers the last 7 days grouped by hour of day.

**Response `200`:** `list[dict]`

```json
[
  { "hour": 0, "order_count": 0 },
  { "hour": 11, "order_count": 8 },
  { "hour": 12, "order_count": 18 },
  { "hour": 13, "order_count": 22 }
]
```

Only hours with at least one order are returned (sparse list, not all 24 hours).

---

### `GET /api/v1/analytics/top-items`

**Query params:** `?days=7` — valid: `ge=1, le=90` (default: 7)

**Response `200`:** `list[dict]` (up to 10 items, ordered by quantity descending)

```json
[
  {
    "item_name": "Chicken Biryani",
    "total_quantity": 98,
    "total_revenue": 11760.0
  }
]
```

---

### `GET /api/v1/analytics/revenue`

**Query params:** `?days=30` — valid: `ge=1, le=365` (default: 30)

**Response `200`:** `list[dict]` (one entry per day with at least one order)

```json
[
  { "date": "2026-06-24", "revenue": 3200.0, "order_count": 26 },
  { "date": "2026-06-25", "revenue": 4100.0, "order_count": 33 }
]
```

---

### `GET /api/v1/analytics/outlets`

**Roles:** `super_admin` only (for `franchise_brand` tenant type)

**Query params:** `?period=month` — valid: `today | week | month`

**Response `200`:** `list[dict]` (one entry per outlet; empty list if no outlets under this brand)

```json
[
  {
    "outlet_tenant_id": "3fa85f64-...",
    "outlet_name": "Gulshan Branch",
    "order_count": 104,
    "revenue": 12500.0,
    "unique_customers": 67
  }
]
```

> `outlet_tenant_id` is the outlet's `tenant_id` — not an `outlet_id` field.

---

### `GET /api/v1/analytics/inventory-value`

**Response `200`:**

```json
{
  "tenant_id": "3fa85f64-...",
  "total_inventory_value": 48500.0,
  "item_count": 25,
  "outlets": null
}
```

For `franchise_brand` tenants (`super_admin`), the `outlets` key is populated:

```json
{
  "tenant_id": "...",
  "total_inventory_value": 48500.0,
  "item_count": 25,
  "outlets": [
    {
      "outlet_tenant_id": "...",
      "outlet_name": "Gulshan Branch",
      "total_inventory_value": 12000.0,
      "item_count": 8
    }
  ]
}
```

---

### `GET /api/v1/analytics/table-usage`

**Response `200`:** `list[dict]` (one entry per table in the tenant, ordered by `table_number`)

```json
[
  {
    "table_number": "T-01",
    "zone": "indoor",
    "times_used_today": 5,
    "times_cleaned_today": 4,
    "current_status": "available"
  }
]
```

`times_used_today` = number of distinct orders for this table today.  
`times_cleaned_today` = number of cleaner log completions for this table today.

---

## Notes

- All monetary values in analytics responses are **floats**, not Decimal strings (different from order/payment responses which use Decimal)
- `period=today` uses `DATE_TRUNC('day', NOW())` as the start boundary — PostgreSQL server time
- `period=week` = last 7 days from now (not Monday–Sunday calendar week)
- `period=month` = last 30 days from now (not a calendar month)
- All queries are tenant-scoped via `Order.tenant_id == ctx.tenant_id`

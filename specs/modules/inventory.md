# Module: Inventory

**Router:** `backend/app/routers/inventory.py`  
**Schemas:** `backend/app/schemas/inventory.py`  
**Service:** `backend/app/services/inventory_service.py`  
**Last verified:** 2026-07-08

---

## Overview

Tracks raw ingredient stock. Supports categories, individual items with supplier info, purchase orders (multi-line), stock movements, inter-outlet transfers, and recipe links to menu items. Each movement records before/after quantities for full audit trail. `LOW_STOCK` WebSocket event fires automatically after consumption movements.

---

## Access

**Auth:** Required | **Roles:** All admin roles **except** `food_court_admin`

`food_court_admin` cannot access `/inventory/*` — food court parent tenant has no inventory of its own.

---

## API Endpoints

### `GET /api/v1/inventory/categories`

**Response `200`:** `list[InventoryCategoryResponse]`

```json
[{ "inv_category_id": 1, "tenant_id": "...", "name": "Proteins", "description": null }]
```

---

### `POST /api/v1/inventory/categories`

**Request body:** `InventoryCategoryCreate`

| Field | Type | Required |
|---|---|---|
| `name` | str | Yes |
| `description` | str \| null | No |

**Response `201`:** `InventoryCategoryResponse`

---

### `GET /api/v1/inventory/items`

**Response `200`:** `list[InventoryItemResponse]`

---

### `POST /api/v1/inventory/items`

**Request body:** `InventoryItemCreate`

| Field | Type | Required | Default | Constraint |
|---|---|---|---|---|
| `inv_category_id` | int | Yes | — | Must exist in tenant |
| `outlet_id` | UUID \| null | No | null | — |
| `is_central` | bool | No | false | Marks franchise brand central warehouse item |
| `name` | str | Yes | — | — |
| `sku` | str \| null | No | null | — |
| `unit` | InventoryUnit | Yes | — | `kg\|g\|litre\|ml\|piece\|packet\|dozen` |
| `quantity_on_hand` | Decimal | No | 0 | — |
| `reorder_level` | Decimal | No | 0 | — |
| `reorder_quantity` | Decimal | No | 0 | — |
| `unit_cost` | Decimal | No | null | — |
| `supplier_name` | str \| null | No | null | — |
| `supplier_contact` | str \| null | No | null | — |
| `notes` | str \| null | No | null | — |

**Response `201`:** `InventoryItemResponse`

---

### `PUT /api/v1/inventory/items/{item_id}`

**Request body:** `InventoryItemUpdate` — same fields as `InventoryItemCreate`, all optional (PATCH-like semantics despite PUT verb)

**Response `200`:** `InventoryItemResponse`

---

### `PATCH /api/v1/inventory/items/{item_id}/adjust`

Manual stock adjustment (positive or negative).

**Request body:** `StockAdjustRequest`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `quantity_delta` | Decimal | Yes | Result cannot go below 0 (INV-7) |
| `notes` | str \| null | No | — |

**Side effects:**
- Negative delta: creates `adjustment` or `waste` movement
- Positive delta: creates `adjustment` movement

**Response `200`:** `InventoryItemResponse`

---

### `GET /api/v1/inventory/movements`

**Query params:** `?item_id=<uuid>&movement_type=consumption&skip=0&limit=50`

**Response `200`:** `list[InventoryMovementResponse]`

```json
[
  {
    "movement_id": "...",
    "tenant_id": "...",
    "inventory_item_id": "...",
    "movement_type": "consumption",
    "quantity_delta": "-0.400",
    "quantity_before": "10.000",
    "quantity_after": "9.600",
    "order_id": "...",
    "purchase_order_id": null,
    "performed_by": "...",
    "notes": null,
    "created_at": "..."
  }
]
```

---

### `GET /api/v1/inventory/purchase-orders`

**Response `200`:** `list[PurchaseOrderResponse]`

---

### `POST /api/v1/inventory/purchase-orders`

**Request body:** `PurchaseOrderCreate`

| Field | Type | Required | Default |
|---|---|---|---|
| `outlet_id` | UUID \| null | No | null |
| `is_transfer` | bool | No | false |
| `from_tenant_id` | UUID \| null | No | null |
| `po_number` | str \| null | No | null |
| `supplier_name` | str \| null | No | null |
| `supplier_contact` | str \| null | No | null |
| `expected_delivery` | datetime \| null | No | null |
| `notes` | str \| null | No | null |
| `line_items` | list[PurchaseOrderLineCreate] | Yes | — |

`line_items` is required. A single PO can cover multiple inventory items.

**PurchaseOrderLineCreate (nested):**

| Field | Type | Required | Constraint |
|---|---|---|---|
| `inventory_item_id` | UUID | Yes | Must exist in tenant |
| `quantity_ordered` | Decimal | Yes | `gt=0` |
| `unit_cost` | Decimal | No | — |

**Response `201`:** `PurchaseOrderResponse` (status: `draft`)

---

### `PATCH /api/v1/inventory/purchase-orders/{po_id}/submit`

Moves PO: `draft → submitted`

**Response `200`:** `PurchaseOrderResponse`

---

### `PATCH /api/v1/inventory/purchase-orders/{po_id}/approve`

Moves PO: `submitted → approved`

**Response `200`:** `PurchaseOrderResponse`

---

### `PATCH /api/v1/inventory/purchase-orders/{po_id}/receive`

**Request body:** `ReceivePORequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `received_quantities` | dict[str, Decimal] | Yes | Key = `po_item_id` (UUID as string), value = quantity received |
| `notes` | str \| null | No | — |

```json
{
  "received_quantities": {
    "3fa85f64-5717-4562-b3fc-2c963f66afa6": "18.000"
  },
  "notes": "2kg short — supplier to follow up"
}
```

**Side effects:**
- PO status → `received`; sets `received_at = now()`
- For each `po_item_id`: `quantity_on_hand += received_qty`; creates `purchase` movement

**Errors:** `400 "Purchase order already received"`

**Response `200`:** `PurchaseOrderResponse`

---

### `POST /api/v1/inventory/transfer`

**Roles:** `super_admin`, `platform_admin` only

**Request body:** `TransferRequest`

| Field | Type | Required |
|---|---|---|
| `inventory_item_id` | UUID | Yes (must be `is_central=TRUE`) |
| `outlet_id` | UUID | Yes (target outlet tenant) |
| `quantity` | Decimal | Yes |
| `notes` | str \| null | No |

**Side effects:**
- Deducts from central item: creates `transfer_out` movement
- Finds/creates matching outlet item: adds stock; creates `transfer_in` movement

**Errors:** `400 "Insufficient central stock"` (INV-5)

**Response `200`:** `{ "transferred": "5.000", "central_remaining": "15.000" }`

---

### `GET /api/v1/inventory/central`

**Roles:** `super_admin`, `platform_admin`

**Response `200`:** `list[InventoryItemResponse]` where `is_central=TRUE`

---

### `GET /api/v1/inventory/reports`

**Response `200`:** `StockSummaryResponse`

```json
{
  "tenant_id": "...",
  "total_items": 25,
  "low_stock_count": 2,
  "total_inventory_value": "48500.00",
  "items": [ ... ]
}
```

---

## Pydantic Schemas

### `InventoryCategoryCreate`
```python
class InventoryCategoryCreate(BaseModel):
    name: str
    description: str | None = None
```

### `InventoryCategoryResponse`
```python
class InventoryCategoryResponse(BaseModel):
    inv_category_id: int
    tenant_id: UUID
    name: str
    description: str | None
```

### `InventoryItemCreate`
```python
class InventoryItemCreate(BaseModel):
    inv_category_id: int
    outlet_id: UUID | None = None
    is_central: bool = False
    name: str
    sku: str | None = None
    unit: InventoryUnit              # kg|g|litre|ml|piece|packet|dozen
    quantity_on_hand: Decimal = 0
    reorder_level: Decimal = 0
    reorder_quantity: Decimal = 0
    unit_cost: Decimal | None = None
    supplier_name: str | None = None
    supplier_contact: str | None = None
    notes: str | None = None
```

### `InventoryItemResponse`
All `InventoryItemCreate` fields plus:
```python
    item_id: UUID
    tenant_id: UUID
    is_low_stock: bool    # computed: quantity_on_hand <= reorder_level
    created_at: datetime
    updated_at: datetime
```

### `StockAdjustRequest`
```python
class StockAdjustRequest(BaseModel):
    quantity_delta: Decimal
    notes: str | None = None
```

### `InventoryMovementResponse`
```python
class InventoryMovementResponse(BaseModel):
    movement_id: UUID
    tenant_id: UUID
    inventory_item_id: UUID
    movement_type: str             # stock_movement_type value
    quantity_delta: Decimal
    quantity_before: Decimal
    quantity_after: Decimal
    order_id: UUID | None
    purchase_order_id: UUID | None
    performed_by: UUID | None
    notes: str | None
    created_at: datetime
```

### `PurchaseOrderLineCreate` (nested)
```python
class PurchaseOrderLineCreate(BaseModel):
    inventory_item_id: UUID
    quantity_ordered: Decimal = Field(..., gt=0)
    unit_cost: Decimal | None = None
```

### `PurchaseOrderCreate`
```python
class PurchaseOrderCreate(BaseModel):
    outlet_id: UUID | None = None
    is_transfer: bool = False
    from_tenant_id: UUID | None = None
    po_number: str | None = None
    supplier_name: str | None = None
    supplier_contact: str | None = None
    expected_delivery: datetime | None = None
    notes: str | None = None
    line_items: list[PurchaseOrderLineCreate]
```

### `ReceivePORequest`
```python
class ReceivePORequest(BaseModel):
    received_quantities: dict[str, Decimal]    # {po_item_id: quantity}
    notes: str | None = None
```

### `TransferRequest`
```python
class TransferRequest(BaseModel):
    inventory_item_id: UUID
    outlet_id: UUID
    quantity: Decimal
    notes: str | None = None
```

---

## Business Rules

### INV-1: Consumption Movement on Order
When an order is placed, for each `order_item`, for each recipe entry:  
Deduct `quantity_per_serving × quantity` from `quantity_on_hand`.  
Create a `consumption` movement with `quantity_before`, `quantity_after`, and `performed_by = order.user_id`.

### INV-2: Inventory Lock During Deduction
Acquire Redis lock `lock:inv:{item_id}` (10s TTL, NX) before decrementing.  
If lock cannot be acquired within 3 retries (100ms apart): `503 "Inventory temporarily locked. Retry."`  
Lock released after deduction commits.

### INV-3: Quantity Cannot Go Below Zero (Strict Mode)
When `inventory_strict_mode=TRUE`: quantity is pre-validated. Never goes below 0 in strict mode.  
When `inventory_strict_mode=FALSE`: quantity can go negative (deficit tracking).

### INV-4: Low Stock Alert After Consumption
After every `consumption` movement:  
If `quantity_on_hand <= reorder_level`: publish `LOW_STOCK` WebSocket event to tenant channel.

```json
{
  "type": "LOW_STOCK",
  "inventory_item_id": "...",
  "item_name": "Chicken",
  "quantity_on_hand": "1.500",
  "reorder_level": "5.000"
}
```

### INV-5: Transfer Requires Sufficient Central Stock
`POST /inventory/transfer` requires `central_item.quantity_on_hand >= transfer_quantity`.  
Error: `400 "Insufficient central stock"`  
On success: `transfer_out` movement on central item; `transfer_in` movement on outlet item.

### INV-6: Purchase Order Receive Adds Stock
`PATCH /inventory/purchase-orders/{id}/receive` → status `received`, `received_at = now()`.  
For each line item: `quantity_on_hand += received_quantities[po_item_id]`.  
Creates `purchase` movement per line item with `purchase_order_id` set.  
Error if already received: `400 "Purchase order already received"`

### INV-7: Manual Adjust Cannot Result in Negative Quantity
`quantity_on_hand + quantity_delta < 0` → `400 "Adjustment would result in negative stock"`

### INV-8: inv_category_id Must Belong to the Caller's Own Tenant
✅ [2026-07-08 — cafeteria-admin sweep]. `POST /inventory/items` and `PUT /inventory/items/{item_id}`
validate that a submitted `inv_category_id` exists and belongs to the caller's own tenant —
`400 "inv_category_id does not exist for this tenant"` if not. Same class of gap as `BR-MENU-1`
(`modules/menu.md`): the FK alone doesn't reject a category_id that belongs to a *different* tenant,
only one that doesn't exist at all — silently creating a cross-tenant category link. Enforced in
`app/routers/inventory.py::_validate_inv_category_id()`.

---

## Stock Movement Types Reference

| Type | When Created |
|---|---|
| `purchase` | When a PO is received |
| `transfer_in` | Outlet receives from central |
| `transfer_out` | Central sends to outlet |
| `consumption` | Ingredient consumed on order placement |
| `adjustment` | Manual positive adjustment |
| `waste` | Manual negative write-off |

---

## WebSocket Events

`LOW_STOCK` — emitted by `inventory_service.py` after each consumption movement.  
See `modules/websocket.md` for full event payload format.

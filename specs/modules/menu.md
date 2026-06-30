# Module: Menu

**Router:** `backend/app/routers/menu.py`  
**Schemas:** `backend/app/schemas/menu.py`  
**Service:** `backend/app/services/menu_service.py`  
**Last verified:** 2026-06-30

---

## Overview

Manages menu categories, items, and recipe links (which inventory ingredients an item consumes). Menu responses are Redis-cached per tenant and invalidated on any write.

---

## API Endpoints

### `GET /api/v1/menu/categories`

**Auth:** Required | **Roles:** All authenticated

**Response `200`:** `list[CategoryResponse]`

```json
[
  { "category_id": 1, "name": "Rice", "icon_url": null, "display_order": 0 }
]
```

---

### `POST /api/v1/menu/categories`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `CategoryCreate`

| Field | Type | Required | Default |
|---|---|---|---|
| `name` | str | Yes | — |
| `display_order` | int | No | 0 |
| `icon_url` | str \| null | No | null |

**Response `201`:** `CategoryResponse`

---

### `PUT /api/v1/menu/categories/{category_id}`

**Auth:** Required | **Roles:** Admin roles

**Request body:** All `CategoryCreate` fields (full replacement)

**Response `200`:** `CategoryResponse`

---

### `DELETE /api/v1/menu/categories/{category_id}`

**Auth:** Required | **Roles:** Admin roles

**Rules:** `400` if any active menu items are linked to this category.

**Response `204`**

---

### `GET /api/v1/menu/items`

**Auth:** Required | **Roles:** All except `cleaner`

**Query params:** `?category_id=<int>&is_available=true`

**Response `200`:** `list[MenuItemResponse]`

```json
[
  {
    "item_id": "3fa85f64-...",
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

### `POST /api/v1/menu/items`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `MenuItemCreate`

| Field | Type | Required | Default | Constraint |
|---|---|---|---|---|
| `category_id` | int | Yes | — | Must exist in tenant (SERIAL integer) |
| `name` | str | Yes | — | `min_length=1`, `max_length=100` |
| `description` | str \| null | No | null | — |
| `price` | Decimal | Yes | — | `ge=0` |
| `image_url` | str \| null | No | null | — |
| `is_available` | bool | No | true | — |
| `is_homemade` | bool | No | false | — |
| `prep_time_mins` | int | No | 10 | — |

**Response `201`:** `MenuItemResponse`

**Side effect:** Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `PUT /api/v1/menu/items/{item_id}`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `MenuItemUpdate` — all fields from `MenuItemCreate`, all required

**Response `200`:** `MenuItemResponse`

**Side effect:** Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `PATCH /api/v1/menu/items/{item_id}/availability`

**Auth:** Required | **Roles:** Admin roles, `staff`

**Request body:** `{ "is_available": false }`

**Response `200`:** `{ "is_available": false }`

**Side effect:** Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `DELETE /api/v1/menu/items/{item_id}`

**Auth:** Required | **Roles:** Admin roles

**Rules:** `400` if the item has historical orders (data integrity).

**Response `204`**

---

### `GET /api/v1/menu/items/{item_id}/recipe`

**Auth:** Required | **Roles:** Admin roles

**Response `200`:** `list[RecipeLineResponse]`

```json
[
  {
    "recipe_id": "...",
    "tenant_id": "...",
    "menu_item_id": "...",
    "inventory_item_id": "...",
    "quantity_per_serving": "0.2500"
  }
]
```

---

### `POST /api/v1/menu/items/{item_id}/recipe`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `RecipeLineCreate`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `inventory_item_id` | UUID | Yes | Must exist in tenant |
| `quantity_per_serving` | Decimal | Yes | `gt=0` |

**Response `201`:** `RecipeLineResponse`

---

### `DELETE /api/v1/menu/items/{item_id}/recipe/{recipe_id}`

**Auth:** Required | **Roles:** Admin roles

**Response `204`**

---

## Pydantic Schemas

### `CategoryCreate`
```python
class CategoryCreate(BaseModel):
    name: str
    display_order: int = 0
    icon_url: str | None = None
```

### `CategoryResponse`
```python
class CategoryResponse(BaseModel):
    category_id: int    # UUID in DB but may be serialized differently
    name: str
    icon_url: str | None
    display_order: int
```

### `MenuItemCreate`
```python
class MenuItemCreate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    image_url: str | None = None
    is_available: bool = True
    is_homemade: bool = False
    prep_time_mins: int = 10
```

### `MenuItemResponse`
```python
class MenuItemResponse(BaseModel):
    item_id: UUID
    category_id: int
    name: str
    description: str | None
    price: Decimal
    image_url: str | None
    is_available: bool
    is_homemade: bool
    prep_time_mins: int
    created_at: datetime
```

### `RecipeLineCreate`
```python
class RecipeLineCreate(BaseModel):
    inventory_item_id: UUID
    quantity_per_serving: Decimal = Field(..., gt=0)
```

### `RecipeLineResponse`
```python
class RecipeLineResponse(BaseModel):
    recipe_id: UUID
    tenant_id: UUID
    menu_item_id: UUID
    inventory_item_id: UUID
    quantity_per_serving: Decimal
```

---

## Redis Caching

- Key: `cache:menu:{tenant_id}`
- Invalidated on: `POST`, `PUT`, `DELETE`, and `PATCH /availability` for both categories and items
- Cache miss: fresh DB query; result cached
- No TTL — cache lives until next write (menu changes are low-frequency)

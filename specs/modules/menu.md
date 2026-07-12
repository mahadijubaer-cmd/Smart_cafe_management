# Module: Menu

**Router:** `backend/app/routers/menu.py`  
**Schemas:** `backend/app/schemas/menu.py`  
**Service:** `backend/app/services/menu_service.py`  
**Last verified:** 2026-07-11

---

## Overview

Manages menu categories and items. Menu responses are Redis-cached per tenant and invalidated on any write. (There is no recipe/ingredient-linkage functionality in this module — inventory consumption is tracked separately, if at all; see `modules/inventory.md`.)

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

**Request params:** bare function parameters passed as **query params**, not a JSON body — there is
no `CategoryCreate` schema in the code.

| Param | Type | Required | Default |
|---|---|---|---|
| `name` | str | Yes | — |
| `display_order` | int | No | 0 |

`icon_url` is **not** settable via the API at all currently — `Category` has no such column exposed
here.

**Response `201`:** `CategoryResponse`

---

### `PUT /api/v1/menu/categories/{category_id}`

**Auth:** Required | **Roles:** Admin roles

**Request params:** same as `POST` above — `name` and `display_order` as query params (full
replacement of those two fields only).

**Response `200`:** `CategoryResponse`

---

### `DELETE /api/v1/menu/categories/{category_id}`

**Auth:** Required | **Roles:** Admin roles

**Rules:** `400` if any active menu items are linked to this category.

**Response `204`**

---

### `GET /api/v1/menu/items`

**Auth:** Required | **Roles:** All authenticated — there is no `require_role` restriction on this
endpoint; any authenticated user, including `cleaner`, can call it.

**Query params:** `?category_id=<int>&is_available=true&is_homemade=false`

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
| `category_id` | int | Yes | — | Must exist in tenant (SERIAL integer) — see BR-MENU-1 |
| `name` | str | Yes | — | `min_length=1`, `max_length=100` |
| `description` | str \| null | No | null | — |
| `price` | Decimal | Yes | — | `ge=0` |
| `image_url` | str \| null | No | null | — |
| `is_available` | bool | No | true | — |
| `is_homemade` | bool | No | false | — |
| `prep_time_mins` | int | No | 10 | — |

**Business logic:** rejects with `402 Payment Required` if the tenant's subscription tier's
`max_menu_items` cap is already reached — see **PA-2/PA-3** in `modules/platform.md` (RFC-009).

**Response `201`:** `MenuItemResponse`

**Side effect:** Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `PUT /api/v1/menu/items/{item_id}`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `MenuItemUpdate` — all fields from `MenuItemCreate`, all required

**Response `200`:** `MenuItemResponse`

**Side effect:** Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `PATCH /api/v1/menu/items/{item_id}/toggle`

**Auth:** Required | **Roles:** `WORK_ROLES` (includes admin roles and `server`)

Flips `item.is_available` (no request body — always toggles to the opposite of its current value).
Any work role, including `outlet_admin`, can toggle any item visible to their scope.

**Response `200`:** `MenuItemResponse` (updated `is_available` reflected)

**Side effect:** Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `PATCH /api/v1/menu/items/{item_id}`

**Auth:** Required | **Roles:** Admin roles

**Request body:** `MenuItemPatch` — a generic partial update; every field optional, only submitted
fields are applied (`model_dump(exclude_unset=True)`).

| Field | Type |
|---|---|
| `category_id` | int \| null |
| `name` | str \| null |
| `description` | str \| null |
| `price` | Decimal \| null |
| `image_url` | str \| null |
| `is_available` | bool \| null |
| `is_homemade` | bool \| null |
| `prep_time_mins` | int \| null |

Same franchise guards as `PUT` (an `outlet_admin` may only patch their own outlet's items; a
`super_admin` may only patch brand-level items). If `category_id` is submitted, it is re-validated
against the effective tenant (BR-MENU-1).

**Response `200`:** `MenuItemResponse`

**Side effect:** Invalidates `cache:menu:{tenant_id}` in Redis.

---

### `POST /api/v1/menu/items/{item_id}/image`

**Auth:** Required | **Roles:** Admin roles

**Request:** `multipart/form-data` with a single `image` file field (PNG, JPEG, or WebP only,
≤ 5 MB).

**Business logic:**
1. Reject non-allowed content types → `400 "Only PNG, JPEG, and WebP images are accepted"`.
2. Reject files over 5 MB → `400 "Image must be ≤ 5 MB"`.
3. Save to `MEDIA_ROOT/menu/{item_id}.{ext}`, set `item.image_url = "/media/menu/{item_id}.{ext}"`.

**Response `200`:** `{ "image_url": "/media/menu/<item_id>.<ext>" }`

---

### `DELETE /api/v1/menu/items/{item_id}`

**Auth:** Required | **Roles:** Admin roles

**Rules:** `400` if the item has historical orders (data integrity).

**Response `204`**

---

## Pydantic Schemas

> There is no `CategoryCreate` schema in the code — `POST`/`PUT /menu/categories` take bare `name`
> and `display_order` query params (see endpoints above).

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

### `MenuItemPatch`
```python
class MenuItemPatch(BaseModel):
    """Partial update — all fields optional."""
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    image_url: str | None = None
    is_available: bool | None = None
    is_homemade: bool | None = None
    prep_time_mins: int | None = None
```

> There are no recipe-line endpoints or schemas (`RecipeLineCreate`/`RecipeLineResponse`) in
> `menu.py` — recipe/ingredient linkage is not implemented in this module.

---

## Business Rules

### BR-MENU-1: category_id Must Belong to the Caller's Own Tenant
✅ [2026-07-08 — cafeteria-admin sweep]. `POST /menu/items`, `PUT /menu/items/{item_id}`, and
`PATCH /menu/items/{item_id}` all validate that the submitted `category_id` exists, is active, and
belongs to the caller's effective tenant (the brand tenant for `franchise_outlet`/`super_admin`
callers — categories live on the brand, same scoping `GET /menu/categories` already uses; the
caller's own `tenant_id` for everyone else) — `400 "category_id does not exist for this tenant"` if
not. Enforced in `app/routers/menu.py::_validate_category_id()`.

Before this fix, the only guard was the DB's `menu_items_category_id_fkey` foreign key, which:
- Let a nonexistent `category_id` reach Postgres and crash with an unhandled `IntegrityError` → a
  raw `500 Internal Server Error` instead of a clean `400`.
- Did **not** stop a `category_id` that exists but belongs to a *different* tenant — Postgres has
  no way to know that's wrong, so the insert/update silently succeeded, linking one tenant's menu
  item to another tenant's category. Confirmed exploitable end-to-end: a `bracu` (cafeteria)
  tenant_admin could `POST /menu/items` with another tenant's `category_id` and get a `201`.

The `CUSTOMER_ROLES` (homemade-listing) branch is unaffected — it always overwrites `category_id`
server-side with the caller's own tenant's Homemade category via `_get_homemade_category_id()`, so
it never trusts client input for this field.

- Key: `cache:menu:{tenant_id}`
- Invalidated on: `POST`, `PUT`, `PATCH` (`/toggle` and generic), `DELETE`, and image upload, for
  both categories and items
- Cache miss: fresh DB query; result cached
- No TTL — cache lives until next write (menu changes are low-frequency)

# Spec 02 — Data Model

**Last updated:** 2026-06-30  
**Status:** Authoritative

> **Rule:** Any change to the database schema requires:
> 1. Update this file first
> 2. Create an Alembic migration
> 3. Update affected API spec sections in `04-api-reference.md`

---

## 1. Enum Types

```sql
-- 7 tenant types (no 'platform' type — platform admin is a role, not a tenant type)
CREATE TYPE tenant_type AS ENUM (
  'franchise_brand', 'franchise_outlet',
  'corporate', 'academic', 'independent_restaurant',
  'food_court', 'food_court_vendor'
);

-- 4 subscription tiers
CREATE TYPE subscription_tier AS ENUM (
  'free', 'starter', 'professional', 'enterprise'
);

-- 10 user roles (no 'employee' role)
CREATE TYPE user_role AS ENUM (
  'platform_admin', 'super_admin', 'outlet_admin', 'tenant_admin',
  'food_court_admin', 'staff', 'cleaner', 'server',
  'student', 'customer'
);

CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'paid', 'refunded'
);

CREATE TYPE payment_method AS ENUM (
  'wallet', 'simulation', 'bkash', 'nagad', 'card'
);

CREATE TYPE table_status AS ENUM (
  'available', 'reserved', 'occupied', 'cleaning'
);

-- 6 stock movement types
CREATE TYPE stock_movement_type AS ENUM (
  'purchase', 'transfer_in', 'transfer_out', 'consumption', 'adjustment', 'waste'
);

CREATE TYPE purchase_order_status AS ENUM (
  'draft', 'submitted', 'approved', 'received', 'cancelled'
);

CREATE TYPE inventory_unit AS ENUM (
  'kg', 'g', 'litre', 'ml', 'piece', 'packet', 'dozen'
);
```

---

## 2. Table Definitions

### `tenants`

```sql
CREATE TABLE tenants (
    tenant_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_type           tenant_type NOT NULL,
    name                  VARCHAR(150) NOT NULL,
    slug                  VARCHAR(80) NOT NULL UNIQUE,     -- 80 chars, not 60
    parent_tenant_id      UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
    subscription_tier     subscription_tier NOT NULL DEFAULT 'starter',
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,

    -- Customization (editable by tenant admin via PATCH /tenants/me/settings)
    brand_color           VARCHAR(7) NOT NULL DEFAULT '#1A4D2E',  -- Default BRACU green
    logo_url              VARCHAR(255),        -- Path to uploaded image
    address               TEXT,
    city                  VARCHAR(100),
    phone                 VARCHAR(20),
    contact_email         VARCHAR(150),

    -- Access control
    allowed_email_domain  VARCHAR(100),        -- e.g. "@g.bracu.ac.bd"

    -- Feature toggles
    homemade_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    inventory_strict_mode BOOLEAN NOT NULL DEFAULT FALSE,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key constraints:**
- `slug` is globally unique — used as the URL identifier
- `parent_tenant_id` must reference a `franchise_brand` for `franchise_outlet`, or a `food_court` for `food_court_vendor`
- `allowed_email_domain` blocks registration from other domains when set
- `inventory_strict_mode = TRUE` blocks orders when ingredient stock reaches zero

---

### `users`

```sql
CREATE TABLE users (
    user_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id         UUID REFERENCES tenants(tenant_id),     -- Only for outlet_admin
    email             VARCHAR(150) NOT NULL,
    full_name         VARCHAR(100) NOT NULL,                  -- 100 chars, not 150
    password_hash     VARCHAR(255) NOT NULL,
    role              user_role NOT NULL,
    student_id        VARCHAR(30),                            -- For academic tenants (30 chars)
    employee_id       VARCHAR(30),                            -- For corporate/staff users
    phone             VARCHAR(20),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,          -- TRUE by default; OTP flow sets this
    email_verified    BOOLEAN NOT NULL DEFAULT FALSE,         -- Set TRUE after OTP verify
    email_verified_at TIMESTAMPTZ,                            -- Timestamp of verification
    wallet_balance    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reward_points     INTEGER NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (email, tenant_id)   -- Same email can exist in multiple tenants
);
```

**Key constraints:**
- `is_active = TRUE` on creation (current implementation). OTP verification sets `email_verified = TRUE`.
  > **Phase 19 intent:** Registration flow will be updated to set `is_active = FALSE` until OTP completes.
- `(email, tenant_id)` unique pair allows the same email to be registered at multiple tenants
- `wallet_balance` is stored on the user record (single-currency system); audit trail in `wallet_transactions`
- `outlet_id` is only populated for `outlet_admin` role (references the outlet they manage)
- `reward_points` earned through order completions (loyalty system)

---

### `categories`

```sql
CREATE TABLE categories (
    category_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `menu_items`

```sql
CREATE TABLE menu_items (
    item_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(10, 2) NOT NULL,
    prep_time_mins  INTEGER DEFAULT 10,
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    is_homemade     BOOLEAN NOT NULL DEFAULT FALSE,
    image_url       VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key behaviour:** `image_url` stores a relative path under `MEDIA_ROOT`. Served as static file at `/media/{path}`.

---

### `recipe_items`

Links a menu item to inventory items it consumes when ordered.

```sql
CREATE TABLE recipe_items (
    recipe_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id              UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    menu_item_id           UUID NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
    inventory_item_id      UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    quantity_per_serving   NUMERIC(10, 3) NOT NULL,
    unit                   VARCHAR(20) NOT NULL DEFAULT 'unit'
);
```

**Key behaviour:** When an order is placed, for each order item, the system multiplies `quantity_per_serving × order_quantity` and deducts that amount from `inventory_items.quantity`.

---

### `tables_map`

```sql
CREATE TABLE tables_map (
    table_id        SERIAL PRIMARY KEY,                       -- INTEGER autoincrement, not UUID
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id       UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,  -- Franchise outlet scoping
    table_number    VARCHAR(10) NOT NULL,
    zone            VARCHAR(30) NOT NULL DEFAULT 'indoor',    -- 30 chars, default 'indoor' not 'main'
    capacity        INTEGER NOT NULL DEFAULT 4,
    status          table_status NOT NULL DEFAULT 'available',
    position_x      INTEGER NOT NULL DEFAULT 0,   -- Column (0–11) for floor plan editor
    position_y      INTEGER NOT NULL DEFAULT 0,   -- Row (0–7) for floor plan editor

    UNIQUE (tenant_id, table_number)
);
```

**Key behaviour:** `position_x` and `position_y` define placement on a 12×8 virtual grid used by the admin floor plan editor. Default grid is 12 columns × 8 rows.

---

### `orders`

```sql
CREATE TABLE orders (
    order_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id       UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,  -- For franchise
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    table_id        INTEGER REFERENCES tables_map(table_id) ON DELETE SET NULL,  -- INTEGER FK (matches table PK)
    time_slot       TIMESTAMPTZ NOT NULL,
    status          order_status NOT NULL DEFAULT 'pending',
    total_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_status  payment_status NOT NULL DEFAULT 'pending',
    payment_method  payment_method,               -- NULL until payment is made
    special_notes   TEXT,                         -- Column is 'special_notes', not 'notes'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `order_items`

```sql
CREATE TABLE order_items (
    order_item_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    order_id        UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES menu_items(item_id) ON DELETE RESTRICT,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(8, 2) NOT NULL,    -- Snapshot: price at time of order
    subtotal        NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
```

**Key behaviour:** `unit_price` is a snapshot of the price at order time. Changes to `menu_items.price` after the order is placed do not affect historical `order_items`.

---

### `inventory_categories`

```sql
CREATE TABLE inventory_categories (
    inv_category_id SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name            VARCHAR(80) NOT NULL,
    description     TEXT,
    UNIQUE (tenant_id, name)
);
```

---

### `inventory_items`

```sql
CREATE TABLE inventory_items (
    item_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id          UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id          UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    inv_category_id    INTEGER REFERENCES inventory_categories(inv_category_id) ON DELETE SET NULL,
    is_central         BOOLEAN NOT NULL DEFAULT FALSE,
    name               VARCHAR(150) NOT NULL,
    sku                VARCHAR(50),
    unit               inventory_unit NOT NULL DEFAULT 'piece',
    quantity_on_hand   NUMERIC(12, 3) NOT NULL DEFAULT 0,
    reorder_level      NUMERIC(12, 3) NOT NULL DEFAULT 0,
    reorder_quantity   NUMERIC(12, 3) NOT NULL DEFAULT 0,
    unit_cost          NUMERIC(10, 2),
    supplier_name      VARCHAR(150),
    supplier_contact   VARCHAR(100),
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, outlet_id, sku)
);
```

**Key behaviour:**
- `is_central = TRUE` marks items managed by a franchise brand's central warehouse
- `LOW_STOCK` WebSocket event fires when `quantity_on_hand <= reorder_level` after a consumption movement
- `quantity_on_hand` can go to 0 but not below 0

---

### `menu_item_recipes`

Links a menu item to the inventory items it consumes when ordered.

```sql
CREATE TABLE menu_item_recipes (
    recipe_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id              UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    menu_item_id           UUID NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
    inventory_item_id      UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    quantity_per_serving   NUMERIC(10, 4) NOT NULL CHECK (quantity_per_serving > 0),
    UNIQUE (menu_item_id, inventory_item_id)
);
```

**Key behaviour:** When an order is placed, for each order item the system multiplies `quantity_per_serving × order_quantity` and deducts from `inventory_items.quantity_on_hand`.

---

### `inventory_movements`

```sql
CREATE TABLE inventory_movements (
    movement_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    movement_type       stock_movement_type NOT NULL,
    quantity_delta      NUMERIC(12, 3) NOT NULL,   -- Positive = increase, Negative = decrease
    quantity_before     NUMERIC(12, 3) NOT NULL,
    quantity_after      NUMERIC(12, 3) NOT NULL,
    order_id            UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    purchase_order_id   UUID REFERENCES purchase_orders(po_id) ON DELETE SET NULL,
    performed_by        UUID REFERENCES users(user_id) ON DELETE SET NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `purchase_orders`

```sql
CREATE TABLE purchase_orders (
    po_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id          UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id          UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    is_transfer        BOOLEAN NOT NULL DEFAULT FALSE,    -- TRUE for inter-outlet transfers
    from_tenant_id     UUID REFERENCES tenants(tenant_id),  -- Source tenant for transfers
    po_number          VARCHAR(50) NOT NULL,
    status             purchase_order_status NOT NULL DEFAULT 'draft',
    supplier_name      VARCHAR(150),
    supplier_contact   VARCHAR(100),
    expected_delivery  TIMESTAMPTZ,
    received_at        TIMESTAMPTZ,
    notes              TEXT,
    created_by         UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_by        UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
    po_item_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id               UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    quantity_ordered    NUMERIC(12, 3) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received   NUMERIC(12, 3) NOT NULL DEFAULT 0,
    unit_cost           NUMERIC(10, 2)
);
```

**PO status lifecycle:** `draft` → `submitted` → `approved` → `received` | `cancelled`

---

### `payments`

```sql
CREATE TABLE payments (
    payment_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    order_id         UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    amount           NUMERIC(10, 2) NOT NULL,
    method           payment_method NOT NULL DEFAULT 'wallet',
    status           payment_status NOT NULL DEFAULT 'pending',
    transaction_ref  VARCHAR(100),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Payment methods:** `wallet` (internal balance) | `simulation` (test mode) | `bkash` | `nagad` | `card`

---

### `wallet_transactions`

```sql
CREATE TABLE wallet_transactions (
    txn_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    amount          NUMERIC(10, 2) NOT NULL,    -- Positive = topup, Negative = debit
    description     VARCHAR(255),
    reference_id    UUID,                       -- order_id or topup reference
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `cleaner_assignments`

```sql
CREATE TABLE cleaner_assignments (
    assignment_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    table_id        UUID NOT NULL REFERENCES tables_map(table_id) ON DELETE CASCADE,
    cleaner_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    assigned_by     UUID REFERENCES users(user_id) ON DELETE SET NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
```

**Valid statuses:** `pending` | `in_progress` | `done`

---

### `notifications`

```sql
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(150) NOT NULL,
    body            TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    reference_id    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Valid types:** `order_update` | `low_stock` | `assignment` | `system`

---

## 3. Entity Relationship Summary

```
tenants ──< users              (one tenant, many users)
tenants ──< categories
categories ──< menu_items
menu_items ──< recipe_items ──> inventory_items
tenants ──< tables_map
users ──< orders ──< order_items ──> menu_items
tables_map ──< orders
tenants ──< inventory_items ──< inventory_movements
inventory_items ──< purchase_orders
orders ──< payments
users ──< wallet_transactions
tables_map ──< cleaner_assignments ──> users (cleaner)
users ──< notifications
tenants ──< tenants            (parent_tenant_id self-reference)
```

---

## 4. Planned Schema Additions (Not Yet Implemented)

### `staff_invitations` — Phase 21

```sql
CREATE TABLE staff_invitations (
    invite_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email           VARCHAR(150) NOT NULL,
    role            user_role NOT NULL,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    invited_by      UUID REFERENCES users(user_id) ON DELETE SET NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

> See RFC: [rfcs/RFC-005-staff-invitation.md](../rfcs) (to be written in Phase 21)

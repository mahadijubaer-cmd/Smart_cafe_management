# Database Schema

**Last verified against code:** 2026-07-11  
**Database:** PostgreSQL 15  
**ORM:** SQLAlchemy 2.0 async

> Any schema change requires:
> 1. Update this file first
> 2. Create an Alembic migration in `backend/alembic/versions/`
> 3. Update the relevant module spec in `specs/modules/`

---

## Enum Types

```sql
-- 7 tenant types (no 'platform' type)
CREATE TYPE tenant_type AS ENUM (
  'franchise_brand', 'franchise_outlet', 'corporate', 'academic',
  'independent_restaurant', 'food_court', 'food_court_vendor'
);

-- 4 subscription tiers
CREATE TYPE subscription_tier AS ENUM (
  'free', 'starter', 'professional', 'enterprise'
);

-- 10 user roles (no 'employee' role)
CREATE TYPE user_role AS ENUM (
  'platform_admin', 'super_admin', 'outlet_admin', 'tenant_admin',
  'food_court_admin', 'staff', 'cleaner', 'server', 'student', 'customer'
);

-- Order lifecycle
CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'
);

CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded');

CREATE TYPE payment_method AS ENUM (
  'wallet', 'simulation', 'bkash', 'nagad', 'card'
);

-- Table occupancy
CREATE TYPE table_status AS ENUM (
  'available', 'reserved', 'occupied', 'cleaning'
);

-- Cleaner assignment status
CREATE TYPE cleaner_status AS ENUM ('assigned', 'in_progress', 'done');

-- Inventory
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

## Table: `tenants`

```sql
CREATE TABLE tenants (
    tenant_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_type           tenant_type NOT NULL,
    name                  VARCHAR(150) NOT NULL,
    slug                  VARCHAR(80) NOT NULL UNIQUE,
    parent_tenant_id      UUID REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
    subscription_tier     subscription_tier NOT NULL DEFAULT 'starter',
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    brand_color           VARCHAR(7) NOT NULL DEFAULT '#1A4D2E',
    logo_url              VARCHAR(255),
    address               TEXT,
    city                  VARCHAR(100),
    phone                 VARCHAR(20),
    contact_email         VARCHAR(150),
    allowed_email_domain  VARCHAR(100),     -- e.g. "@g.bracu.ac.bd"
    homemade_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    inventory_strict_mode BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notes:**
- `slug`: globally unique URL identifier; pattern `^[a-z0-9-]+$`; immutable after creation
- `inventory_strict_mode = FALSE` by default — must be explicitly enabled
- `allowed_email_domain` blocks self-registration from other email domains when set (checked only at register time)
- `inventory_strict_mode = TRUE` blocks orders when any ingredient stock is insufficient

**✅ [Phase 22 — Implemented 2026-07-05] Planned columns (RFC-007, migration `v3_2_guest_orders`):**

```sql
ALTER TABLE tenants
  ADD COLUMN public_menu_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN public_slug          VARCHAR(60) UNIQUE,       -- short, printable on QR
  ADD COLUMN guest_checkout_mode  VARCHAR(16) NOT NULL DEFAULT 'counter'
    CHECK (guest_checkout_mode IN ('counter','online'));    -- 'online' = Phase 2
```

- `public_slug` is distinct from `slug` — it is the short, guest-facing identifier used in
  `/m/{public_slug}` and on printed table QR codes; `slug` remains the tenant-scoped app URL.
- See `system/segments.md` and `modules/public-surface.md`.

---

## Table: `users`

```sql
CREATE TABLE users (
    user_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id         UUID REFERENCES tenants(tenant_id),    -- franchise outlet admin only
    email             VARCHAR(150) NOT NULL,
    full_name         VARCHAR(100) NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    role              user_role NOT NULL,
    student_id        VARCHAR(30),           -- academic tenant students
    employee_id       VARCHAR(30),           -- corporate/staff users
    phone             VARCHAR(20),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    wallet_balance    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reward_points     INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (email, tenant_id)
);
```

**Notes:**
- `is_active = TRUE` at creation (Phase 19 will change to `FALSE` until OTP complete)
- `email_verified = FALSE` until `POST /otp/verify` with `purpose=email_verification` succeeds
- `(email, tenant_id)` unique — same email can register at multiple tenants
- `wallet_balance` is a denormalized field; `wallet_transactions` is the authoritative audit trail

---

## Table: `categories`

```sql
CREATE TABLE categories (
    category_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Table: `menu_items`

```sql
CREATE TABLE menu_items (
    item_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    category_id    UUID NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    name           VARCHAR(150) NOT NULL,
    description    TEXT,
    price          NUMERIC(10, 2) NOT NULL,
    prep_time_mins INTEGER DEFAULT 10,
    is_available   BOOLEAN NOT NULL DEFAULT TRUE,
    is_homemade    BOOLEAN NOT NULL DEFAULT FALSE,
    image_url      VARCHAR(500),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notes:**
- `image_url` stores a relative path under `MEDIA_ROOT`; served at `/media/{path}`

---

## Table: `menu_item_recipes`

Links a menu item to the inventory ingredients it consumes per serving.

```sql
CREATE TABLE menu_item_recipes (
    recipe_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    menu_item_id          UUID NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
    inventory_item_id     UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    quantity_per_serving  NUMERIC(10, 4) NOT NULL CHECK (quantity_per_serving > 0),

    UNIQUE (menu_item_id, inventory_item_id)
);
```

---

## Table: `tables_map`

```sql
CREATE TABLE tables_map (
    table_id      SERIAL PRIMARY KEY,    -- INTEGER autoincrement, NOT UUID
    tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id     UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    table_number  VARCHAR(10) NOT NULL,
    zone          VARCHAR(30) NOT NULL DEFAULT 'indoor',
    capacity      INTEGER NOT NULL DEFAULT 4,
    status        table_status NOT NULL DEFAULT 'available',
    position_x    INTEGER NOT NULL DEFAULT 0,    -- floor plan grid column (0–11)
    position_y    INTEGER NOT NULL DEFAULT 0,    -- floor plan grid row (0–7)

    UNIQUE (tenant_id, table_number)
);
```

**Notes:**
- `table_id` is SERIAL INTEGER — not UUID. All FKs and API references use integer.
- `position_x`, `position_y`: 12×8 virtual grid for the Phase 16 floor plan editor

---

## Table: `orders`

```sql
CREATE TABLE orders (
    order_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id       UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    table_id        INTEGER REFERENCES tables_map(table_id) ON DELETE SET NULL,
    time_slot       TIMESTAMPTZ NOT NULL,
    status          order_status NOT NULL DEFAULT 'pending',
    total_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_status  payment_status NOT NULL DEFAULT 'pending',
    payment_method  payment_method,
    special_notes   TEXT,                  -- field is "special_notes", NOT "notes"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**✅ [Phase 22 — Implemented 2026-07-05] Planned columns (RFC-007, migration `v3_2_guest_orders`):**

```sql
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE orders
  ADD COLUMN order_source VARCHAR(16) NOT NULL DEFAULT 'customer_app'
    CHECK (order_source IN ('customer_app','staff_pos','guest_qr','kiosk')),
  ADD COLUMN guest_token UUID,               -- see index note below (NOT unique)
  ADD COLUMN guest_name VARCHAR(80),
  ADD COLUMN guest_phone VARCHAR(20);

-- integrity: an order is either a user order or a guest order
ALTER TABLE orders ADD CONSTRAINT chk_order_identity CHECK (
  (user_id IS NOT NULL AND guest_token IS NULL)
  OR (user_id IS NULL AND guest_token IS NOT NULL AND order_source IN ('guest_qr','kiosk'))
);
```

- `user_id` becomes nullable **only** for guest orders; `chk_order_identity` is the invariant that
  keeps every other order (`customer_app`, `staff_pos`) tied to exactly one user.
- Every `JOIN users` in `modules/analytics.md` queries must become a `LEFT JOIN` once this ships —
  tracked as a risk in RFC-007.
- See `modules/orders.md` (OR-11) and `modules/public-surface.md`.

**✅ [Phase D — Implemented 2026-07-05] `guest_token` is NOT unique** (migration
`0007_food_court_guest_sessions.py` dropped `uq_orders_guest_token` in favour of a plain index
`ix_orders_guest_token`). A food-court guest cart spanning multiple vendors is split into one
`Order` row **per vendor tenant**, all sharing one `guest_token` — a "guest session". Single-vendor
restaurants still get exactly one order per `guest_token` in practice, but the schema no longer
enforces that as an invariant. See `modules/public-surface.md` "Guest Sessions".

---

## Table: `order_items`

```sql
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    order_id      UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    item_id       UUID NOT NULL REFERENCES menu_items(item_id) ON DELETE RESTRICT,
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(8, 2) NOT NULL,
    subtotal      NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
```

**Notes:**
- `unit_price` = snapshot of `menu_items.price` at order time
- `subtotal` is a PostgreSQL GENERATED column — never set by application code

---

## Table: `inventory_categories`

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

## Table: `inventory_items`

```sql
CREATE TABLE inventory_items (
    item_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id         UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    inv_category_id   INTEGER REFERENCES inventory_categories(inv_category_id) ON DELETE SET NULL,
    is_central        BOOLEAN NOT NULL DEFAULT FALSE,
    name              VARCHAR(150) NOT NULL,
    sku               VARCHAR(50),
    unit              inventory_unit NOT NULL DEFAULT 'piece',
    quantity_on_hand  NUMERIC(12, 3) NOT NULL DEFAULT 0,
    reorder_level     NUMERIC(12, 3) NOT NULL DEFAULT 0,
    reorder_quantity  NUMERIC(12, 3) NOT NULL DEFAULT 0,
    unit_cost         NUMERIC(10, 2),
    supplier_name     VARCHAR(150),
    supplier_contact  VARCHAR(100),
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, outlet_id, sku)
);
```

**Notes:**
- `is_central = TRUE`: managed by franchise brand's central warehouse
- LOW_STOCK event fires when `quantity_on_hand <= reorder_level` after a consumption movement

---

## Table: `inventory_movements`

```sql
CREATE TABLE inventory_movements (
    movement_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    movement_type     stock_movement_type NOT NULL,
    quantity_delta    NUMERIC(12, 3) NOT NULL,    -- positive = increase, negative = decrease
    quantity_before   NUMERIC(12, 3) NOT NULL,
    quantity_after    NUMERIC(12, 3) NOT NULL,
    order_id          UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    purchase_order_id UUID REFERENCES purchase_orders(po_id) ON DELETE SET NULL,
    performed_by      UUID REFERENCES users(user_id) ON DELETE SET NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Table: `purchase_orders`

```sql
CREATE TABLE purchase_orders (
    po_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id         UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    is_transfer       BOOLEAN NOT NULL DEFAULT FALSE,
    from_tenant_id    UUID REFERENCES tenants(tenant_id),
    po_number         VARCHAR(50) NOT NULL,
    status            purchase_order_status NOT NULL DEFAULT 'draft',
    supplier_name     VARCHAR(150),
    supplier_contact  VARCHAR(100),
    expected_delivery TIMESTAMPTZ,
    received_at       TIMESTAMPTZ,
    notes             TEXT,
    created_by        UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_by       UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
    po_item_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id             UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE CASCADE,
    quantity_ordered  NUMERIC(12, 3) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received NUMERIC(12, 3) NOT NULL DEFAULT 0,
    unit_cost         NUMERIC(10, 2)
);
```

**Status lifecycle:** `draft → submitted → approved → received | cancelled`

---

## Table: `payments`

```sql
CREATE TABLE payments (
    payment_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    order_id        UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    amount          NUMERIC(10, 2) NOT NULL,
    method          payment_method NOT NULL DEFAULT 'wallet',
    status          payment_status NOT NULL DEFAULT 'pending',
    transaction_ref VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Table: `wallet_transactions`

```sql
CREATE TABLE wallet_transactions (
    txn_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    amount       NUMERIC(10, 2) NOT NULL,    -- positive = topup/refund, negative = debit
    description  VARCHAR(255),
    reference_id UUID,                       -- order_id or topup reference
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Table: `cleaner_logs`

```sql
CREATE TABLE cleaner_logs (
    log_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    cleaner_id          UUID NOT NULL REFERENCES users(user_id),
    table_id            INTEGER NOT NULL REFERENCES tables_map(table_id),
    triggered_by_order  UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cleaned_at          TIMESTAMPTZ,
    status              cleaner_status NOT NULL DEFAULT 'assigned'
);
```

**Valid statuses:** `assigned | in_progress | done`

---

## Table: `receipt_logs`

```sql
CREATE TABLE receipt_logs (
    receipt_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    order_id     UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    receipt_no   VARCHAR(50) NOT NULL UNIQUE,    -- Format: RCP-YYYYMMDD-XXXXXX
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emailed      BOOLEAN NOT NULL DEFAULT FALSE,
    emailed_at   TIMESTAMPTZ
);
```

---

## Table: `notifications`

```sql
CREATE TABLE notifications (
    notif_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(user_id),
    type            VARCHAR(80) NOT NULL,
    message         TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

There is a single `message: TEXT` column — no separate `title`/`body` split, and no `reference_id`
column. The `user_id` foreign key has no `ON DELETE CASCADE` (unlike `tenant_id`).

---

## Table: `reward_logs`

```sql
CREATE TABLE reward_logs (
    log_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    order_id    UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    points      INTEGER NOT NULL,
    action      VARCHAR(50) NOT NULL,    -- 'earn' | 'redeem' | 'reverse'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Entity Relationships

```
tenants ──────────────< users
tenants ──────────────< categories ──< menu_items
menu_items ───────────< menu_item_recipes >──── inventory_items
tenants ──────────────< tables_map
users ─────────────────< orders ──< order_items >──── menu_items
tables_map ────────────< orders
tenants ──────────────< inventory_items ──< inventory_movements
tenants ──────────────< purchase_orders ──< purchase_order_items >──── inventory_items
orders ────────────────< payments
users ─────────────────< wallet_transactions
tables_map ────────────< cleaner_logs >──── users (cleaner)
orders ────────────────< receipt_logs
users ─────────────────< notifications
users ─────────────────< reward_logs
tenants ──────────────< tenants  (parent_tenant_id self-reference)
```

---

## Planned Schema Additions

### `staff_invitations` — Phase 21

```sql
CREATE TABLE staff_invitations (
    invite_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email       VARCHAR(150) NOT NULL,
    role        user_role NOT NULL,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    invited_by  UUID REFERENCES users(user_id) ON DELETE SET NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `platform_audit_logs` — Phase 24 (RFC-009, Platform Admin Control Plane)

Not tenant-scoped — this table has no `tenant_id` column of its own; `target_tenant_id` refers to
the tenant an action was *performed on*, which may be null (no future action can ever be tied back to
it) once that tenant is hard-deleted. `actor_id`/`target_tenant_id` use `SET NULL` rather than
`CASCADE` deliberately: an audit log's entire purpose is to outlive the account or tenant it
describes, so the denormalized `actor_email`/`target_tenant_name`/`target_tenant_slug` columns exist
so a log entry remains readable even after the row it references is gone.

```sql
CREATE TABLE platform_audit_logs (
    log_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id           UUID REFERENCES users(user_id) ON DELETE SET NULL,
    actor_email        VARCHAR(150) NOT NULL,
    action             VARCHAR(50) NOT NULL,
    target_tenant_id   UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    target_tenant_name VARCHAR(150),
    target_tenant_slug VARCHAR(80),
    details            TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_platform_audit_logs_target_tenant_id ON platform_audit_logs(target_tenant_id);
CREATE INDEX ix_platform_audit_logs_created_at ON platform_audit_logs(created_at);
```

See `specs/modules/platform.md` for the full `AuditAction` value list and business rules PA-1–PA-5.

### Device terminals — Phase 25 (RFC-010, Kiosk + Signage) ✅ Implemented

Migration `0009_add_devices_and_signage.py`. Model file `backend/app/models/device.py`. See
`specs/modules/devices.md` / `kiosk.md` / `signage.md`, ADR-013.

```sql
CREATE TYPE device_type AS ENUM ('kiosk', 'signage');

CREATE TYPE signage_slide_type AS ENUM (
  'menu_board', 'promo_image', 'announcement',
  'order_status_board', 'trending_items', 'offers'
);

CREATE TABLE devices (
    device_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id    UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    name         VARCHAR(80) NOT NULL,
    device_type  device_type NOT NULL,
    token_hash   VARCHAR(64) UNIQUE,          -- sha256 hex of opaque token; NULL = unpaired (ADR-013)
    token_prefix VARCHAR(16),                  -- first 12 chars, admin display only
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    settings     JSONB NOT NULL DEFAULT '{}',  -- kiosk: idle_timeout override; signage: playlist_id
    paired_at    TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_by   UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_devices_tenant_id ON devices(tenant_id);

CREATE TABLE signage_playlists (
    playlist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id   UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,
    name        VARCHAR(80) NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_signage_playlists_tenant_id ON signage_playlists(tenant_id);
-- SGN-4: at most one default per scope (COALESCE handles NULL outlet)
CREATE UNIQUE INDEX uq_signage_playlists_default
  ON signage_playlists (tenant_id, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'))
  WHERE is_default;

CREATE TABLE signage_slides (
    slide_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playlist_id      UUID NOT NULL REFERENCES signage_playlists(playlist_id) ON DELETE CASCADE,
    slide_type       signage_slide_type NOT NULL,
    position         INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 10 CHECK (duration_seconds >= 5),  -- SGN-1
    config           JSONB NOT NULL DEFAULT '{}',   -- per-type shape: modules/signage.md
    active_from      TIMESTAMPTZ,                    -- schedule window (client-filtered, SGN-2)
    active_until     TIMESTAMPTZ,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_signage_slides_playlist_id ON signage_slides(playlist_id);

CREATE TABLE kiosk_configs (
    config_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id  UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    outlet_id  UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    config     JSONB NOT NULL DEFAULT '{}',  -- shape: modules/kiosk.md (welcome text, attract images, featured items, accent, idle timeout)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX uq_kiosk_configs_scope
  ON kiosk_configs (tenant_id, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'));

-- Column additions
ALTER TABLE orders     ADD COLUMN pickup_number INTEGER;                  -- OR-12
ALTER TABLE menu_items ADD COLUMN allergens    JSONB NOT NULL DEFAULT '[]';  -- BR-MENU-4 (EU FIC 14)
ALTER TABLE menu_items ADD COLUMN dietary_tags JSONB NOT NULL DEFAULT '[]';  -- BR-MENU-4
```

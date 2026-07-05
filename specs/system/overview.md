# System Overview

**Last verified against code:** 2026-06-30

---

## What Is SCMS?

SCMS (Smart Cafe Management System) is a **multi-tenant SaaS platform** for managing cafeterias, restaurants, and food courts. A single deployment serves multiple independent organisations (called **tenants**). Each tenant's data is completely isolated from all others at the database row level.

---

## Tenant Types

Seven `tenant_type` values exist. "Platform" is a role (`platform_admin`), not a tenant type.

| Value | Description | `parent_tenant_id` |
|---|---|---|
| `franchise_brand` | A brand owning multiple outlet locations | `NULL` |
| `franchise_outlet` | One physical outlet under a franchise brand | → `franchise_brand` tenant |
| `corporate` | A corporate cafeteria for one company | `NULL` |
| `academic` | A university or college cafeteria | `NULL` |
| `independent_restaurant` | A standalone restaurant | `NULL` |
| `food_court` | A food court housing multiple vendor stalls | `NULL` |
| `food_court_vendor` | One vendor stall inside a food court | → `food_court` tenant |

### Hierarchy

```
franchise_brand
└── franchise_outlet  (1..N per brand)

food_court
└── food_court_vendor (1..N per food court)

corporate              (standalone)
academic               (standalone)
independent_restaurant (standalone)
```

Enforcement rules:
- `franchise_outlet.parent_tenant_id` MUST point to an existing `franchise_brand` tenant
- `food_court_vendor.parent_tenant_id` MUST point to an existing `food_court` tenant
- All other types: `parent_tenant_id = NULL`

### Segments

✅ [Phase 22 — Implemented 2026-07-05] (RFC-007). Every tenant also has a **derived** segment —
`cafeteria` (`corporate`, `academic`) or `restaurant` (everything else) — computed from
`tenant_type` by one function. No `segment` column exists or will be added. See
`system/segments.md` for the full capability matrix and business rules.

---

## Actors (User Roles)

Every user belongs to exactly one tenant. Their `role` field determines what they can do.

| Role | Typical Tenant Type | Responsibilities |
|---|---|---|
| `platform_admin` | Any (cross-tenant) | Manages all tenants, subscriptions, platform-level settings |
| `super_admin` | `franchise_brand` | Manages all outlets under their brand; cross-outlet analytics |
| `outlet_admin` | `franchise_outlet` | Manages one franchise outlet |
| `tenant_admin` | `academic`, `corporate`, `independent_restaurant` | Manages one organisation |
| `food_court_admin` | `food_court` | Manages shared floor (tables, vendors, server staff) |
| `staff` | Any | Fulfils orders (kitchen / counter) |
| `cleaner` | Any | Receives and completes table-cleaning assignments |
| `server` | `food_court` | Delivers cross-vendor orders to tables |
| `student` | `academic` | Places orders at an academic institution |
| `customer` | Any | General customer — places orders |

> `student` and `customer` are treated identically in all permission checks (both are in `CUSTOMER_ROLES`). The distinction exists for domain-specific display only.

---

## Role Groups (as defined in `dependencies.py`)

```python
CUSTOMER_ROLES = (UserRole.customer, UserRole.student)

ADMIN_ROLES = (
    UserRole.outlet_admin,
    UserRole.tenant_admin,
    UserRole.food_court_admin,
    UserRole.super_admin,
    UserRole.platform_admin,
)

FLOOR_STAFF_ROLES = (UserRole.staff, UserRole.cleaner, UserRole.server)

ALL_STAFF = ADMIN_ROLES + FLOOR_STAFF_ROLES
```

---

## Core Features

| Feature | API Prefix | Description |
|---|---|---|
| Multi-tenancy | Core | Row-level isolation; `tenant_id` on every tenant-scoped table |
| Authentication | `/auth`, `/otp` | JWT; OTP for email verification and admin 2FA |
| Menu Management | `/menu` | Categories, items, recipes linked to inventory |
| Table Management | `/tables` | QR-based scanning; real-time occupancy status |
| Order Management | `/orders` | Time-slotted; wallet payment; status machine |
| Cleaning Assignment | `/cleaners` | Admin assigns cleaner to table; cleaner marks done |
| Inventory | `/inventory` | Categories, items, purchase orders, stock movements, transfers |
| Payments / Wallet | `/payments` | Pre-paid wallet; top-up; debit on order; reward points |
| QR Codes | `/qr` | Per-order and per-table PNG QR codes |
| PDF Generation | `/receipts`, `/memo` | Money receipts and institutional memos via reportlab |
| Real-time Events | WebSocket | Order status, table status, low-stock alerts via Redis pub/sub |
| Analytics | `/analytics` | Revenue trends, top items, hourly distribution, table usage |
| Food Court | `/food-court` | Multi-vendor unified floor management and settlement reports |
| Tenant Management | `/tenants` | Platform-admin CRUD for all tenants |

---

## Subscription Tiers

| Tier | Description |
|---|---|
| `free` | Trial access; limited features |
| `starter` | Basic features; limited inventory; 1 admin user |
| `professional` | Full features; unlimited inventory; 5 admin users |
| `enterprise` | Professional + dedicated support; custom integrations |

Default tier for new tenants: `starter`.

---

## Key System Facts (Anti-Hallucination Reference)

These are frequently confused. Verify against this list before generating any code.

| Fact | Correct Value |
|---|---|
| Number of tenant types | 7 (no `platform` type) |
| Number of user roles | 10 (no `employee` role) |
| Number of subscription tiers | 4 (`free`, `starter`, `professional`, `enterprise`) |
| JWT algorithm | HS256 |
| Password hashing | pbkdf2_sha256 (passlib) |
| Redis blacklist key format | `blacklist:jti:{jti}` |
| WebSocket URL | `ws://host/ws/{user_id}?token={jwt}` |
| WebSocket message format | Flat JSON with `type` field — NOT `{event, data}` wrapper |
| `table_id` type | SERIAL INTEGER (not UUID) |
| Order cancel method | `DELETE /orders/{order_id}` (not POST) |
| Tenant update method | `PATCH /tenants/{id}` (partial; not PUT) |
| OTP purpose values | `email_verification` \| `login` \| `password_reset` |
| OTP verify field name | `otp_code` (not `code`) |
| Order notes field | `special_notes` (not `notes`) |
| PDF library | reportlab 4.1.0 (not WeasyPrint) |
| Email library | fastapi-mail 1.4.1 (not aiosmtplib) |
| UI component library | Custom Tailwind CSS (shadcn/ui NOT installed) |
| Payment methods in `PaymentCreate` | `wallet` \| `simulation` only (gateway not wired yet) |
| `inventory_strict_mode` default | `False` |
| Segment is stored in a DB column | **No** — always derived via `SEGMENT_MAP[tenant_type]` (`system/segments.md`) |

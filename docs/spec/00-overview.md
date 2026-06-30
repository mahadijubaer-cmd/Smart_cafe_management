# Spec 00 — System Overview

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. What Is SCMS?

SCMS (Smart Cafe Management System) is a **multi-tenant SaaS platform** for managing cafeterias, restaurants, and food courts. A single deployment serves multiple independent organizations (called **tenants**). Each tenant's data is completely isolated from all others.

## 2. Tenant Types

Seven `tenant_type` enum values exist in the system. "Platform" is a role (`platform_admin`), not a tenant type.

| Value | Description | Parent |
|---|---|---|
| `franchise_brand` | A brand that owns multiple outlet locations | None |
| `franchise_outlet` | One physical outlet under a franchise brand | `franchise_brand` |
| `corporate` | A corporate cafeteria (single company) | None |
| `academic` | A university or college cafeteria | None |
| `independent_restaurant` | A single restaurant, no brand structure | None |
| `food_court` | A food court housing multiple vendor stalls | None |
| `food_court_vendor` | One vendor stall inside a food court | `food_court` |

### Hierarchy

```
franchise_brand
└── franchise_outlet (many per brand)

food_court
└── food_court_vendor (many per food court)

corporate          (standalone)
academic           (standalone)
independent_restaurant (standalone)
```

Rules:
- `franchise_outlet.parent_tenant_id` must point to a `franchise_brand` tenant
- `food_court_vendor.parent_tenant_id` must point to a `food_court` tenant
- All other types: `parent_tenant_id = NULL`

## 3. Actors

Every user belongs to exactly one tenant. A user's `role` field determines what they can do within that tenant.

| Role | Typical Tenant Type | What They Do |
|---|---|---|
| `platform_admin` | Any (cross-tenant) | Manages all tenants, subscriptions, platform settings |
| `super_admin` | `franchise_brand` | Manages all outlets under their brand |
| `outlet_admin` | `franchise_outlet` | Manages one franchise outlet |
| `tenant_admin` | `academic`, `corporate`, `independent_restaurant` | Manages one organization |
| `food_court_admin` | `food_court` | Manages the shared floor (tables, vendors, server staff) |
| `staff` | Any | Fulfills orders (kitchen/counter) |
| `cleaner` | Any | Receives and completes table-cleaning assignments |
| `server` | `food_court` | Delivers cross-vendor orders to tables |
| `student` | `academic` | Places orders at an academic institution (legacy alias for customer) |
| `customer` | Any | General customer — places orders |

> `student` is a legacy alias for `customer`. Both have identical permission checks (CUSTOMER_ROLES group).

## 4. Core Features

| Feature | Module | Description |
|---|---|---|
| Multi-tenancy | Core | Row-level isolation; every table carries `tenant_id` |
| Menu Management | `/menu` | Categories and items; recipe links to inventory |
| Table / Seating | `/tables` | QR-based table scanning; real-time status tracking |
| Order Management | `/orders` | Time-slotted orders; wallet deduction; status machine |
| Inventory | `/inventory` | Stock tracking, POs, transfers, strict mode |
| Wallet / Payments | `/payments` | Prepaid wallet; topup; debit on order |
| OTP Verification | `/otp` | Email OTP for registration and admin 2FA login |
| QR Codes | `/qr` | Per-order and per-table QR images |
| PDF Generation | `/memo`, `/receipts` | Receipts and institutional memos as PDFs |
| Real-time Events | WebSocket | Order status, table status, low-stock alerts |
| Analytics | `/analytics` | Revenue, top items, hourly orders, inventory value |
| Food Court | `/food-court` | Multi-vendor floor; unified menu; settlement reports |

## 5. Subscription Tiers

| Tier | Limits |
|---|---|
| `free` | Trial access, limited features |
| `starter` | Basic features, limited inventory, 1 admin user |
| `professional` | Full features, unlimited inventory, 5 admin users |
| `enterprise` | Professional + dedicated support, custom integrations |

## 6. Related Documents

- Architecture: [01-architecture.md](01-architecture.md)
- Full permissions: [03-auth.md](03-auth.md)
- Tenant database fields: [02-data-model.md](02-data-model.md) → `tenants` table

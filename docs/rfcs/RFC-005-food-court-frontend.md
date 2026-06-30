# RFC-005: Food Court Frontend Pages

**Date:** 2026-06-30  
**Author:** Mahadi Jubaer  
**Status:** Accepted  
**Related spec files:** spec/04-api-reference.md, spec/07-frontend.md, spec/08-workflows.md

---

## 1. Motivation

The backend food court router (`/food-court/*`) has 10 fully implemented and tested endpoints (Phase 13). However, no frontend pages exist for the food court user experience. The food court admin, server staff, and customers cannot use any of these features through the UI.

Features without frontend:
- Food court admin: vendor overview, shared table management, floor analytics, settlements
- Server: cross-vendor delivery queue
- Customer: unified vendor menu browsing

---

## 2. Proposed Design

### 2.1 Overview

Add a `(food-court)` route segment under `[tenant_slug]` with pages for each food court actor role.

### 2.2 Route Guard

`src/app/[tenant_slug]/(food-court)/layout.tsx` must:
1. Verify user is authenticated
2. Verify `tenantType === 'food_court'` from JWT claims (food_court_vendor users accessing this route get redirected)
3. Show food court navigation: Dashboard | Unified Menu | Tables | Delivery | Analytics | Settlements

### 2.3 Pages

#### Dashboard (`/(food-court)/dashboard`)
**Who sees it:** `food_court_admin`  
**Data:** `GET /food-court/vendors`, `GET /food-court/tables`, `GET /food-court/analytics`  

Layout:
- Top row: vendor status tiles — one tile per vendor showing name + open/busy/closed indicator
- Middle: shared floor occupancy mini-map (read-only version of ActiveTableMap)
- Bottom: active order counts per vendor, live-updating via WebSocket

---

#### Unified Menu (`/(food-court)/menu`)
**Who sees it:** `food_court_admin`, `customer`, `server`  
**Data:** `GET /food-court/vendors`, `GET /food-court/menu`  

Layout:
- Horizontal vendor tab strip (one tab per vendor)
- Selecting a vendor shows their menu items as `MenuItemCard` grid
- Customers can add items to cart (redirects to vendor's own order page for payment)
- "All Vendors" tab shows all items grouped by vendor

---

#### Shared Tables (`/(food-court)/tables`)
**Who sees it:** `food_court_admin`, `server`  
**Data:** `GET /food-court/tables`, WebSocket `TABLE_STATUS_CHANGED`  

Layout:
- Color-coded table map (same visual style as admin tables page)
- Zone filter tabs
- `food_court_admin`: click to change table status, assign cleaner
- `server`: can update status to occupied/available only

---

#### Delivery Queue (`/(food-court)/deliver`)
**Who sees it:** `server`  
**Data:** `GET /food-court/orders/active` (poll every 15s + WebSocket `ORDER_NEW`)  

Layout:
- List of all orders with status `ready` across all vendors
- Each card: vendor name badge, table number, items list, time since order placed
- "Deliver" button → `PATCH /food-court/orders/{id}/deliver`
- On success: card removed from list, toast "Delivered to table {number}"
- Scroll below: orders still in `preparing` / `confirmed` / `pending` (not yet ready)

---

#### Analytics (`/(food-court)/analytics`)
**Who sees it:** `food_court_admin`  
**Data:** `GET /food-court/analytics`  

Layout:
- Table occupancy donut chart (available/reserved/occupied/cleaning)
- Per-vendor order count bar chart
- Refresh every 60s

---

#### Settlements (`/(food-court)/settlements`)
**Who sees it:** `food_court_admin`  
**Data:** `GET /food-court/settlements`  

Layout:
- Period selector: today / this week / this month
- Table: vendor name, total orders, total revenue, average order value
- Export as CSV (optional, Phase 21)

---

### 2.4 New Frontend Files

| File | Who | Description |
|---|---|---|
| `src/app/[tenant_slug]/(food-court)/layout.tsx` | All FC roles | Guard + FC nav |
| `src/app/[tenant_slug]/(food-court)/dashboard/page.tsx` | `food_court_admin` | Vendor tiles + floor map |
| `src/app/[tenant_slug]/(food-court)/menu/page.tsx` | All FC roles | Unified vendor menu |
| `src/app/[tenant_slug]/(food-court)/tables/page.tsx` | Admin + server | Shared table status |
| `src/app/[tenant_slug]/(food-court)/deliver/page.tsx` | `server` | Cross-vendor delivery queue |
| `src/app/[tenant_slug]/(food-court)/analytics/page.tsx` | `food_court_admin` | Floor analytics |
| `src/app/[tenant_slug]/(food-court)/settlements/page.tsx` | `food_court_admin` | Revenue settlements |
| `src/components/food-court/VendorTile.tsx` | NEW | Vendor status card |
| `src/components/food-court/DeliveryCard.tsx` | NEW | Order ready-for-delivery card |
| `src/components/food-court/VendorMenuTabs.tsx` | NEW | Horizontal vendor tab strip |

---

### 2.5 No New Backend Endpoints Needed

All required endpoints already exist from Phase 13. This RFC is frontend-only.

---

## 3. Alternatives Considered

**Embed food court features in the existing `(admin)` segment:** Rejected — food court has different nav, different actors (server role), and different data scope. A separate route segment is cleaner and avoids role confusion.

---

## 4. Open Questions

- [x] Should the server's delivery page auto-refresh or rely on WebSocket? Decision: Both — WebSocket ORDER_NEW updates the count, periodic 15s poll ensures reliability.
- [x] Should customers order from the unified menu? Decision: Yes — selecting an item redirects to the vendor's own order page with the item pre-loaded.
- [ ] Should settlements be exportable as PDF or CSV? (Deferred to Phase 21)

---

## 5. Implementation Checklist

- [x] spec/07-frontend.md updated (food court route tree added)
- [x] spec/08-workflows.md updated (WF-7 added for server flow)
- [ ] `(food-court)/layout.tsx` with tenant_type guard
- [ ] Dashboard page with vendor tiles + floor map
- [ ] Unified menu page with vendor tabs
- [ ] Shared tables page (read-only for server; editable for food_court_admin)
- [ ] Delivery queue page with real-time updates
- [ ] Analytics page with charts
- [ ] Settlements page with period filter
- [ ] `VendorTile`, `DeliveryCard`, `VendorMenuTabs` components
- [ ] Food court segment wired into app nav
- [ ] CHANGELOG.md updated

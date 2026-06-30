# Spec 08 — User Workflows

**Last updated:** 2026-06-30  
**Status:** Authoritative

> These workflows describe the end-to-end experience for each actor. Implementation must produce exactly these steps. If a step is changed in code, update this document first.

---

## WF-1: New Customer Registration

**Actor:** New user who wants to register at a tenant

**Pre-condition:** Tenant exists and is active

```
Step 1 — Discover tenant [Phase 14]
  User navigates to /discover
  Sees search bar + list of all active tenants
  Finds their organization (search by name or browse by type)
  Clicks "Register here" on the tenant card

Step 2 — Welcome & profile type selection [Phase 14 redesign]
  Navigated to /{slug}/register
  Page loads tenant: GET /tenants/public/{slug}
  Shows: org logo, name, "You're registering for {Name}"
  Shows profile type cards based on tenant_type:
    academic → "I'm a Student" | "I'm a Staff Member"
    corporate → "I'm an Employee"
    independent_restaurant / food_court → "I'm a Customer / Diner"
  User selects their profile type
  (Staff and Cleaner are NOT self-registerable — admin-invited only)

Step 3 — Fill registration form
  Form fields adapt to selection:
    Student → Name, Email (@domain validated), Password, Student ID (required)
    Employee → Name, Email (@domain validated), Password, Employee ID
    Customer → Name, Email, Password
  User submits form
  → POST /api/v1/auth/register

Step 4 — OTP verification
  6-digit OTP input shown (frontend sends OTP after register returns Token)
  → POST /api/v1/otp/send { email, purpose: "email_verification", tenant_slug }
  User checks email, enters code
  → POST /api/v1/otp/verify { email, purpose: "email_verification", otp_code: "...", tenant_slug }
  On success: sets email_verified=TRUE on user account

Step 5 — Redirect to login
  Toast: "Registration successful! Please log in."
  Redirect: /{slug}/login
```

**Error paths:**
- Email domain not allowed → show inline error with correct domain
- Email already registered → "Already have an account? Sign in"
- OTP expired → resend button (60s cooldown)
- OTP max attempts → "Too many attempts. Please request a new code."

---

## WF-2: Login (All Roles)

**Actor:** Any registered and verified user

```
Step 1 — Enter credentials
  Navigate to /{slug}/login
  Enter email + password
  → POST /api/v1/auth/login

Step 2 — Backend always returns Token immediately
  Response (ALL roles): { access_token, token_type, user_id, tenant_id, tenant_type, tenant_slug, outlet_id, role }
  No backend 2FA step — token is issued for all roles unconditionally

Step 3a — Customer/staff/cleaner/server
  Frontend decodes role from token (see src/lib/auth.ts: getRoleFromToken)
  Store token in Zustand (persisted to localStorage)
  Redirect to role-based home:
    customer/student → /{slug}/(customer)/menu
    staff → /{slug}/(staff)/orders
    cleaner → /{slug}/(cleaner)/tables
    server → /{slug}/(food-court)/deliver [Phase 20]

Step 3b — Admin roles (platform_admin, super_admin, outlet_admin, tenant_admin, food_court_admin)
  Frontend holds token in memory (not stored yet)
  Shows OTP step on the login page (UI gate)
  → POST /api/v1/otp/send { email, purpose: "login", tenant_slug }
  User enters code
  → POST /api/v1/otp/verify { email, purpose: "login", otp_code: "...", tenant_slug }
  On success: store token in Zustand, redirect to /{slug}/(admin)/dashboard
```

---

## WF-3: Customer Order Flow

**Actor:** Customer, Student, or Employee

**Pre-condition:** Logged in with wallet balance ≥ 0

```
Step 1 — Browse menu
  Navigate to /{slug}/(customer)/menu
  → GET /menu/categories (render as tabs)
  → GET /menu/items (render as cards)
  Click "+" on card to add to CartSidebar

Step 2 — Cart review
  CartSidebar shows: items, quantities, subtotals, running total
  User can change quantities or remove items

Step 3 — Checkout
  Click "Checkout" → navigate to /{slug}/(customer)/order
  Shows: cart summary, wallet balance, time slot picker, table grid

Step 4 — Pick time slot
  30-minute interval dropdown during service hours
  Must be in the future (OR-1)

Step 5 — Pick table (optional)
  TableGrid shows current status (color coded)
    Green = available, Amber = reserved, Red = occupied, Blue = cleaning
  Customer clicks an available table

Step 6 — Place order
  Click "Place Order" → POST /api/v1/orders/
  Success → navigate to /{slug}/(customer)/track/{order_id}
  Failure → toast with specific error

Step 7 — Track order
  Order status shown in real-time (WebSocket ORDER_CONFIRMED, ORDER_READY)
  QR code displayed (GET /qr/order/{id}/base64)
  When status = delivered: "Download Receipt" button appears
```

---

## WF-4: Staff Kitchen Flow

**Actor:** Staff

```
Step 1 — Open order queue
  Navigate to /{slug}/(staff)/orders
  → GET /orders/?status=pending (initial load)
  WebSocket connected: ORDER_PLACED events trigger queue refresh + toast

Step 2 — Process orders in sequence
  For each incoming order:
    a. Review: items, table, time slot, notes
    b. Click "Confirm" → PATCH /orders/{id}/status { status: "confirmed" }
       → WebSocket ORDER_CONFIRMED sent to customer
    c. Begin preparing → "Start Cooking" → status: "preparing"
    d. Done cooking → "Mark Ready" → status: "ready"
       → WebSocket ORDER_READY sent to customer

Step 3 — Completed orders
  status = "delivered" is set by server staff (food court) or the customer scanning at pickup
  Admin can also mark delivered
```

---

## WF-5: Cleaner Flow

**Actor:** Cleaner

```
Step 1 — View assignments
  Navigate to /{slug}/(cleaner)/tables
  → GET /cleaners/logs?status=pending (own assignments)
  WebSocket CLEAN_ASSIGNED fires when new assignment created

Step 2 — Complete assignment
  Go to the table physically
  Click "Mark Done" → PATCH /cleaners/logs/{id}/complete
  → Table status set to "available"
  → WebSocket TABLE_CLEAN sent to all admin/staff
```

---

## WF-6: Admin Day-to-Day

**Actor:** Tenant Admin / Outlet Admin / Super Admin

```
Step 1 — Login with 2FA (WF-2 steps 2b + 3)

Step 2 — Dashboard /{slug}/(admin)/dashboard
  Summary: orders today, revenue today, active tables, pending orders, low stock count
  7-day revenue chart
  Live table occupancy widget

Step 3 — Handle low-stock alert
  If LOW_STOCK WebSocket fires → InventoryAlertBanner [Phase 15] shows
  Click banner → /{slug}/(admin)/inventory/items
  Create purchase order: POST /inventory/purchase-orders
  Receive it: PATCH /inventory/purchase-orders/{id}/receive

Step 4 — Manage tables [Phase 16]
  /{slug}/(admin)/tables
  Live view: see all table statuses
  Assign cleaner: POST /cleaners/logs
  Edit layout: drag tables to new positions → PATCH /tables/layout

Step 5 — View analytics [Phase 17]
  /{slug}/(admin)/analytics
  Filter by period: today / week / month
  Review revenue chart, top items, hourly heatmap

Step 6 — Manage menu [Phase 18]
  /{slug}/(admin)/menu
  Add/edit/delete categories
  Toggle item availability

Step 7 — Customize settings [Phase 15]
  /{slug}/(admin)/settings
  Update logo, brand color, org info
  Toggle homemade marketplace / strict inventory mode
```

---

## WF-7: Food Court Server Flow

**Actor:** Server (belongs to food court parent tenant)

```
Step 1 — Open delivery queue [Phase 20]
  Navigate to /{slug}/(food-court)/deliver
  → GET /food-court/orders/active
    Shows all "ready" orders from ALL vendors in one list
  Each card: vendor name, table number, items, order time

Step 2 — Deliver order
  Pick up order from vendor stall
  Click "Deliver"
  → PATCH /food-court/orders/{order_id}/deliver
  Order must be status = ready (FC-5 rule)
  Success → order removed from queue

Step 3 — View all vendor activity
  Food court admin sees unified dashboard [Phase 20]
  Vendor throughput, table occupancy, settlements
```

---

## WF-8: Platform Admin — Tenant Management

**Actor:** Platform Admin

```
Step 1 — Login (with 2FA)

Step 2 — Manage tenants
  Navigate to /(platform)/admin/tenants
  → GET /tenants/ (all tenants with status)
  Create new tenant: POST /tenants/
  Suspend tenant: PATCH /tenants/{id}/suspend
  Reactivate: PATCH /tenants/{id}/activate

Step 3 — View platform analytics [Phase 21]
  /(platform)/admin/analytics
  Total tenants, total orders, revenue by tenant

Step 4 — Manage subscriptions [Phase 21]
  /(platform)/admin/subscriptions
  Change tenant tier, apply enterprise features
```

---

## WF-9: Password Reset [Phase 19]

**Actor:** Any user who forgot their password

```
Step 1 — Initiate reset
  Click "Forgot password?" on /{slug}/login
  Navigate to /{slug}/(auth)/forgot-password

Step 2 — Enter email
  Enter registered email
  → POST /auth/forgot-password { email, tenant_slug }
  OTP sent to email

Step 3 — Enter OTP + new password
  6-digit OTP input
  New password + confirm password fields
  → POST /auth/reset-password { email, otp_code, new_password }

Step 4 — Success
  Toast: "Password updated! Please log in."
  Redirect to /{slug}/login
```

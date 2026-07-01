# Frontend Workflows

**Source of truth for all user journeys (WF-1 through WF-9)**  
**Last verified:** 2026-06-30

---

## WF-1: Customer Self-Registration

**Actor:** New user (customer or student)  
**Start:** `/{tenant_slug}/register`

```
1. User fills form: full_name, email, password, role (customer|student)
2. Frontend calls POST /auth/register
   Body: { full_name, email, password, role, tenant_slug }

3. Backend returns: { message: "Registration successful. Please verify your email." }

4. Frontend navigates to OTP verification step
   - Shows: "Enter the 6-digit code sent to {email}"

5. User enters 6-digit code
6. Frontend calls POST /auth/verify-email
   Body: { email, otp_code }
   ← Note field name: otp_code (not "code")

7. On success: { message: "Email verified successfully" }
8. Frontend redirects to /{tenant_slug}/login

9. User logs in (see WF-2)
```

**OTP details:**
- Redis key: `otp:email_verification:{email}` (purpose = `email_verification`)
- OTP expires in 10 minutes
- Unused: `otp:login:{email}`, `otp:password_reset:{email}`

---

## WF-2: Login (All Roles)

**Actor:** Any registered user  
**Start:** `/{tenant_slug}/login`

```
STEP 1: Submit credentials
1. User enters email + password
2. Frontend calls POST /auth/login
   Body: { email, password, tenant_slug }

3. Backend ALWAYS returns Token immediately (for ALL roles):
   { access_token, token_type: "bearer" }

STEP 2: Frontend JWT decode
4. Frontend decodes JWT claims: sub, role, tenant_id, tenant_slug, tenant_type, outlet_id
5. Store in Zustand: { token, user, tenantId, tenantSlug, tenantType, outletId }

STEP 3: Admin 2FA (frontend-only gate)
6. IF role is admin/staff:
   a. Frontend calls POST /auth/request-otp
      Body: { email, purpose: "login" }
   b. Shows 2FA code entry screen
   c. User enters code → frontend calls POST /auth/verify-otp
      Body: { email, otp_code, purpose: "login" }
   d. On success → navigate to dashboard
   e. On failure → clear token from store → redirect to login

7. IF role is customer/student → navigate to /menu directly (no 2FA)

⚠ Backend does NOT gate on 2FA. The Token is valid immediately. 
  Admin 2FA is purely a frontend UI gate.
```

**Post-login routing by role:**

| Role | Landing page |
|---|---|
| `platform_admin` | /{slug}/admin/tenants |
| `super_admin`, `outlet_admin`, `tenant_admin`, `food_court_admin` | /{slug}/admin/dashboard |
| `staff` | /{slug}/staff/orders |
| `cleaner` | /{slug}/cleaner/tables |
| `server` | /{slug}/staff/orders |
| `student`, `customer` | /{slug}/menu |

---

## WF-3: Customer Order Flow

**Actor:** Customer or student  
**Start:** `/{tenant_slug}/menu`

```
1. Fetch menu categories: GET /menu/categories
2. Fetch items by category: GET /menu/items?category_id={id}
   (or GET /menu/items for all)

3. User browses, adds items to cart (Zustand `cart` state)

4. User opens cart → navigates to /{tenant_slug}/order

5. Review: items, quantities, special_notes, time_slot
   Optionally: check "Use reward points" (sets redeem_points: true)

6. Submit: POST /orders/
   Body: {
     table_id: number | null,
     time_slot: "12:30",
     items: [{ item_id, quantity, special_notes }],
     special_notes: "...",
     redeem_points: false
   }
   ← table_id is an integer (SERIAL), not UUID

7. Backend responds: OrderResponse (with order_id, status: "pending")
   WebSocket event published: ORDER_PLACED
   { type: "ORDER_PLACED", order_id, status: "pending", total_amount }

8. Frontend clears cart, navigates to /{tenant_slug}/track/{order_id}

9. Track page subscribes to WebSocket: ws://host/ws/{user_id}?token={jwt}
10. Shows status updates as WS events arrive:
    ORDER_CONFIRMED, ORDER_PREPARING, ORDER_READY, ORDER_DELIVERED
```

---

## WF-4: Staff Kitchen Flow

**Actor:** Staff  
**Start:** `/{tenant_slug}/staff/orders`

```
1. Staff connects to WebSocket on mount
   ws://host/ws/{user_id}?token={jwt}

2. Fetch current pending/confirmed orders:
   GET /orders/?status=pending (or confirmed)

3. Staff sees ORDER_PLACED events from WebSocket → new order appears in queue

4. For each incoming order:
   a. Click "Confirm" → PATCH /orders/{order_id}/status
      Body: { status: "confirmed" }
      WS event emitted: ORDER_CONFIRMED
      { type: "ORDER_CONFIRMED", order_id, status: "confirmed" }

   b. Click "Start Preparing" → PATCH /orders/{order_id}/status
      Body: { status: "preparing" }
      WS event emitted: ORDER_PREPARING

   c. Click "Mark Ready" → PATCH /orders/{order_id}/status
      Body: { status: "ready" }
      WS event emitted: ORDER_READY

   d. Click "Deliver" → PATCH /orders/{order_id}/status
      Body: { status: "delivered" }
      WS event emitted: ORDER_DELIVERED

5. If order must be cancelled (at any point):
   DELETE /orders/{order_id}
   ← There is NO POST /orders/{id}/cancel endpoint
   WS event emitted: ORDER_CANCELLED
```

---

## WF-5: Cleaner Assignment Flow

**Actor:** Cleaner  
**Start:** `/{tenant_slug}/cleaner/tables`

```
1. Cleaner connects to WebSocket on mount

2. Fetch assigned cleaning tasks:
   GET /cleaners/logs/?status=assigned

3. WebSocket: receive CLEAN_ASSIGNED event
   { type: "CLEAN_ASSIGNED", log_id, table_id, assigned_to }
   ← Event is CLEAN_ASSIGNED (not CLEANER_ASSIGNED)

4. Cleaner clicks "Start Cleaning" → PATCH /cleaners/logs/{log_id}/status
   Body: { status: "in_progress" }

5. Cleaner clicks "Done" → PATCH /cleaners/logs/{log_id}/status
   Body: { status: "done" }
   WebSocket event emitted: TABLE_CLEAN

6. Table status returns to available
   WebSocket event: TABLE_UPDATE { type: "TABLE_UPDATE", table_id, status: "available" }
```

**DB details:**  
- Table: `cleaner_logs` (not `cleaner_assignments`)  
- PK: `log_id` UUID  
- Statuses: `assigned | in_progress | done`

---

## WF-6: Admin Day-to-Day

**Actor:** `tenant_admin` or `outlet_admin`  
**Start:** `/{tenant_slug}/admin/dashboard`

```
1. Dashboard loads analytics summary:
   GET /analytics/summary?period=today
   Returns: { total_orders, total_revenue, avg_order_value, total_customers_served,
              pending_orders, active_tables, cleaners_on_duty }

2. Revenue chart: GET /analytics/revenue?days=30
   Orders-by-hour: GET /analytics/orders-by-hour
   Top items: GET /analytics/top-items?days=7

3. Inventory management:
   - GET /inventory/items → list stock levels
   - POST /inventory/items → add item
   - POST /inventory/receive-po → receive purchase order
     Body: { vendor_name, notes, items: { [item_id]: quantity_decimal } }
   - LOW_STOCK WebSocket event received →
     { type: "LOW_STOCK", item_id, item_name, current_quantity, min_threshold }

4. User management:
   GET /users/ → list all users in tenant
   PATCH /users/{id}/deactivate → suspend staff
   PATCH /users/{id}/activate → reinstate staff

5. Generate receipt PDF:
   GET /receipts/{order_id}/pdf → PDF download

6. Generate memo:
   POST /memo/generate → PDF download
   ← Only staff, outlet_admin, tenant_admin can do this
```

---

## WF-7: Food Court Server Flow

**Actor:** `server` (at food_court tenant)  
**Start:** `/{tenant_slug}/staff/orders`

```
1. Server connects to WebSocket (food court channel)

2. Fetch active cross-vendor orders:
   GET /food-court/orders/active
   (Requires tenant_type == food_court in JWT)

3. WebSocket: ORDER_READY event arrives from any vendor kitchen
   { type: "ORDER_READY", order_id, status: "ready", table_id }

4. Server delivers order to table:
   PATCH /food-court/orders/{order_id}/deliver
   ← Only works when order.status == "ready" (FC-5)
   ← Returns 400 if status is not "ready"

5. WebSocket: ORDER_DELIVERED emitted

6. Check shared floor tables:
   GET /food-court/tables → all tables owned by food court parent

7. Update table status:
   PATCH /food-court/tables/{table_id}/status
   Body: { status: "available" | "occupied" | "reserved" | "cleaning" }
```

---

## WF-8: Platform Admin Tenant Management

**Actor:** `platform_admin`  
**Start:** `/{tenant_slug}/admin/tenants`

```
1. List all tenants:
   GET /tenants?skip=0&limit=50
   Response: { items: [...], total: N }

2. Create new tenant:
   POST /tenants
   Body: { name, slug, tenant_type, subscription_tier, ... }
   ← slug and tenant_type are immutable after creation
   ← inventory_strict_mode defaults to false

3. Create franchise outlet under a brand:
   POST /tenants/{brand_tenant_id}/outlets
   Body: OutletCreate (slug, name, etc.)
   Server sets: tenant_type=franchise_outlet, parent_tenant_id={brand_tenant_id}

4. Update tenant:
   PATCH /tenants/{tenant_id}
   ← PATCH not PUT
   ← Cannot update slug or tenant_type

5. Suspend/activate tenant:
   POST /tenants/{tenant_id}/suspend
   POST /tenants/{tenant_id}/activate

6. View franchise outlets:
   GET /tenants/{tenant_id}/outlets
```

---

## WF-9: Password Reset ❌ [Phase 19 — Not Yet Implemented]

**Status:** Planned only. No endpoints exist yet.

```
Planned flow:
1. User clicks "Forgot Password" on login page
2. Frontend calls POST /auth/forgot-password (❌ not built)
   Body: { email }

3. Backend sends OTP with purpose: "password_reset"
   Redis key: otp:password_reset:{email}

4. User enters OTP + new password
5. Frontend calls POST /auth/reset-password (❌ not built)
   Body: { email, otp_code, new_password }
```

**Do NOT implement this flow until Phase 19 spec is approved and code is written.**

---

## WF-10: Organization Registration (Tenant Onboarding) ✅ [RFC-006]

**Actor:** An owner/manager who wants to put their organization on the platform.

```
Step 0 — Entry
  From landing page / customer login / customer register:
  click "Register your organization" → /register-organization

Step 1 — Choose category
  Radio grid of self-serve tenant types (generic label + description):
    Independent Restaurant · Corporate Cafeteria · Academic Cafeteria ·
    Franchise Brand · Food Court
  (franchise_outlet / food_court_vendor are NOT offered — BR-ORG-1)
  → Continue

Step 2 — Organization details
  name (slug auto-suggested from name, editable),
  city, contact email, brand colour,
  optional allowed_email_domain (academic/corporate)
  → Continue

Step 3 — Admin account
  first admin: full_name, email, password (BR-ORG-6 complexity)
  → POST /tenants/register { organization {...}, admin {...} }

Step 4 — Success (auto-login)
  Backend creates tenant + first admin (tenant_admin, or food_court_admin
  for a food court) atomically and returns a JWT (BR-ORG-4/5/7).
  Store token → redirect to /{slug}/dashboard.
```

Components: `app/register-organization/page.tsx` (3-step wizard), `components/auth/OrgCategorySelector.tsx` (self-serve type radio grid), reusing `lib/tenantTypes.ts` for labels/descriptions.

---

## WebSocket Connection Pattern (Frontend)

```typescript
// Connect on component mount
const ws = new WebSocket(
  `ws://localhost:8000/ws/${user.user_id}?token=${token}`
);

// Handle incoming events
ws.onmessage = (event) => {
  const msg: WsMessage = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'ORDER_PLACED':
      // { type, order_id, status, total_amount }
      break;
    case 'ORDER_CONFIRMED':
    case 'ORDER_PREPARING':
    case 'ORDER_READY':
    case 'ORDER_DELIVERED':
    case 'ORDER_CANCELLED':
      // { type, order_id, status }
      break;
    case 'TABLE_UPDATE':
      // { type, table_id, status }
      break;
    case 'TABLE_CLEAN':
      // { type, table_id }
      break;
    case 'CLEAN_ASSIGNED':
      // { type, log_id, table_id, assigned_to }
      break;
    case 'MEAL_DONE':
      // { type, order_id, vendor_id }
      break;
    case 'LOW_STOCK':
      // { type, item_id, item_name, current_quantity, min_threshold }
      break;
    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG' }));
      break;
  }
};

// Cleanup on unmount
ws.onclose = () => {};
```

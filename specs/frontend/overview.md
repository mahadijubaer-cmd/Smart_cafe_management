# Frontend Overview

**Framework:** Next.js 14 (App Router)  
**Language:** TypeScript 5.x  
**Last verified:** 2026-06-30

---

## Tech Stack

| Technology | Purpose | Notes |
|---|---|---|
| Next.js 14 | Framework (App Router) | `src/app/` directory |
| TypeScript | Type safety | Strict mode |
| Zustand | Client state | Persisted to localStorage |
| Axios | HTTP client | JWT injected via request interceptor |
| react-hook-form | Form management | — |
| zod | Schema validation (forms) | — |
| react-hot-toast | Toast notifications | — |
| date-fns | Date formatting | — |
| papaparse | CSV parsing | — |
| Tailwind CSS | Styling | Custom components only |
| @dnd-kit | Drag-and-drop | ❌ Phase 16 — NOT YET INSTALLED |

> shadcn/ui is **NOT** installed. All UI components are custom Tailwind.

---

## Routing Tree

```
src/app/
  page.tsx                           → Redirects to /{defaultSlug}/login
                                        ✅ [Phase 22] Becomes segment landing (Cafeteria /
                                        Restaurant cards → tenant directory filtered by segment) — RFC-007
  register-organization/page.tsx     → ✅ [RFC-006] Public org onboarding wizard
                                        (choose category → org details → admin account → auto-login)
  m/[public_slug]/                   → ✅ [Phase 22 — Implemented 2026-07-05] Public surface, no auth — RFC-007
    page.tsx                         → Public menu + cart + guest checkout (name+phone);
                                        `?mode=kiosk` = fullscreen locked kiosk variant
    track/[guestToken]/page.tsx      → Guest order tracking (live via public WS)

  [tenant_slug]/                     → Tenant-scoped routes
    layout.tsx                       → Loads tenant context from JWT
                                        ✅ [Phase 22] Also derives segment (`system/segments.md`)
                                        and hides/404s (customer) + register for restaurant tenants
    display/page.tsx                → ✅ [Phase 22] Signage: read-only auto-rotating menu board — RFC-007

    (auth)/
      login/page.tsx                 → Login form + admin OTP step
      register/page.tsx              → 2-step: form → OTP verify
    
    (customer)/                      → Roles: customer, student
      menu/page.tsx                  → Browse categories + items
      order/page.tsx                 → Cart review + checkout
      track/[orderId]/page.tsx       → Order status + QR + receipt
      wallet/page.tsx                → Balance + topup
      profile/page.tsx               → User profile
    
    (staff)/                         → Role: staff
      orders/page.tsx                → Kitchen order queue
    
    (cleaner)/                       → Role: cleaner
      tables/page.tsx                → Cleaning assignments
    
    (admin)/                         → Admin roles
      dashboard/page.tsx             → Summary cards + charts
      users/page.tsx                 → ✅ Manage users: search/filter/paginate,
                                        activate/deactivate (fixed 2026-07-02 — see modules/users.md);
                                        header links to users/invite/
      users/invite/page.tsx          → ✅ Invite Staff: send by email+role, sent-invitations
                                        table now loads from GET /users/invite (persists across
                                        refresh — fixed 2026-07-02); "← Back to Users" link
      inventory/
        page.tsx                     → Item list
        items/page.tsx               → — 
        movements/page.tsx           → Movement log
        purchase-orders/page.tsx     → PO management
        central/page.tsx             → Central stock (franchise)
      public-link/page.tsx           → ✅ [Phase 22 — Implemented 2026-07-05] Toggle public menu,
                                        edit public_slug, download table-QR PDF sheet — RFC-007
      outlets/page.tsx                → ✅ [Phase 23 — Implemented 2026-07-05] Franchise brand
                                        self-service: list + create franchise_outlet tenants.
                                        Nav item only rendered when tenant_type===franchise_brand
                                        (RFC-008)
  
  (platform)/
    admin/
      tenants/page.tsx               → Platform admin tenant CRUD
  
  unauthorized/page.tsx              → 403 fallback
```

Default slug (redirected to on root): `bracu`

---

## Zustand Store (`src/store/useStore.ts`)

```typescript
interface Store {
  // Auth
  token: string | null;
  user: User | null;
  tenantSlug: string | null;
  tenantId: string | null;
  tenantType: TenantType | null;
  outletId: string | null;
  brandColor: string | null;
  
  // Cart
  cart: CartItem[];
  isCartOpen: boolean;
  
  // Wallet
  walletBalance: number;
  rewardPoints: number;
  
  // Notifications
  notifications: WsMessage[];
  
  // Hydration
  hasHydrated: boolean;
  
  // Actions
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setTenantContext: (ctx: TenantContext) => void;
  setTenantSlug: (slug: string) => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, qty: number) => void;
  clearCart: () => void;
  addNotification: (msg: WsMessage) => void;
  setWalletBalance: (balance: number) => void;
  setRewardPoints: (points: number) => void;
  setHasHydrated: (value: boolean) => void;
}
```

**Persistence:** Uses `zustand/middleware persist` with `localStorage` key `scms-store`.  
**Excluded from persistence:** `cart`, `notifications` (ephemeral session data).

---

## API Client (`src/lib/api.ts`)

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
});

// Request interceptor: inject JWT
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('scms-store');
  if (stored) {
    const state = JSON.parse(stored);
    const token = state?.state?.token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;
```

**Key facts:**
- No `X-Tenant-Slug` header is sent — tenant context comes from JWT only
- No response interceptor (no automatic 401 redirect)
- Token read from `localStorage` key `scms-store` → nested `state.token`

---

## Auth Utilities (`src/lib/auth.ts`)

```typescript
interface JwtPayload {
  sub: string;           // user_id
  role: UserRole;
  tenant_id: string;
  tenant_type: TenantType;
  tenant_slug: string;
  outlet_id: string | null;
  exp: number;
  jti: string;
}

function getRoleFromToken(token: string): UserRole | null
function getClaimsFromToken(token: string): JwtPayload | null
function isTokenExpired(token: string): boolean
```

---

## TypeScript Types (`src/types/index.ts`)

### `TenantType`
```typescript
type TenantType =
  | 'franchise_brand'
  | 'franchise_outlet'
  | 'corporate'
  | 'academic'
  | 'independent_restaurant'
  | 'food_court'
  | 'food_court_vendor';
```

### `UserRole`
```typescript
type UserRole =
  | 'platform_admin'
  | 'super_admin'
  | 'outlet_admin'
  | 'tenant_admin'
  | 'food_court_admin'
  | 'staff'
  | 'cleaner'
  | 'server'
  | 'student'
  | 'customer'
  | 'admin';  // legacy alias — maps to customer in permission checks
```

### `User`
```typescript
interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  tenant_id: string;
  outlet_id: string | null;
  employee_id: string | null;
  wallet_balance: number;
  reward_points: number;
  email_verified: boolean;
  is_active: boolean;
  created_at: string;
}
```

### `MenuItem`
```typescript
interface MenuItem {
  item_id: string;
  category_id: number;    // integer, not UUID
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_homemade: boolean;
  prep_time_mins: number;
}
```

### `Order`
```typescript
interface Order {
  order_id: string;
  user_id: string;
  table_id: number | null;    // integer, not UUID
  time_slot: string;
  status: OrderStatus;
  total_amount: number;
  discount_amount: number;
  payment_status: string;
  payment_method: string | null;
  special_notes: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}
```

### `TableMap`
```typescript
interface TableMap {
  table_id: number;       // integer, not UUID
  table_number: string;
  zone: string;
  capacity: number;
  status: TableStatus;
  position_x: number | null;
  position_y: number | null;
}
```

### `WsMessage`
```typescript
interface WsMessage {
  type: string;           // e.g. "ORDER_PLACED", "LOW_STOCK"
  [key: string]: unknown; // additional fields per event type
}
```

### `CartItem`
```typescript
interface CartItem {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string | null;
}
```

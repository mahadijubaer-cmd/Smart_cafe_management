# Spec 07 — Frontend Architecture

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. Technology

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR/CSR hybrid rendering |
| Language | TypeScript 5.x | Type-safe development |
| Styling | Tailwind CSS 3.x | Utility-first CSS |
| Components | Custom Tailwind components | No external UI kit (shadcn/ui NOT installed) |
| State | Zustand + persist middleware | Global auth, cart, tenant context |
| Forms | react-hook-form + zod | Form state management and validation |
| HTTP client | axios | API calls with JWT interceptor |
| JWT parsing | jwt-decode | Read JWT claims client-side |
| Icons | Lucide React | Icon set |
| Charts | Recharts | Analytics charts |
| Toasts | react-hot-toast | User feedback notifications |
| Date utils | date-fns | Date formatting and manipulation |
| CSV | papaparse | CSV import/export |
| Drag & Drop | @dnd-kit/core | Phase 16 — NOT YET INSTALLED |

---

## 2. Routing Tree

Legend: ✅ Built | ❌ Not yet built | [Phase N] = planned implementation phase

```
src/app/
├── page.tsx                                    ✅ (currently: redirect to /bracu/login — needs Phase 14 redesign)
├── discover/
│   └── page.tsx                                ❌ [Phase 14] Public tenant discovery
├── (platform)/
│   └── admin/
│       ├── layout.tsx                          ✅ Platform admin guard
│       ├── tenants/page.tsx                    ✅ Tenant CRUD
│       ├── subscriptions/page.tsx              ❌ [Phase 21]
│       └── analytics/page.tsx                  ❌ [Phase 21]
└── [tenant_slug]/
    ├── layout.tsx                              ✅ Loads tenant branding; injects CSS vars
    ├── (auth)/
    │   ├── login/page.tsx                      ✅ Login + admin 2FA OTP step
    │   ├── register/page.tsx                   ✅ Register + OTP verify (Phase 14: redesign)
    │   └── forgot-password/page.tsx            ❌ [Phase 19]
    ├── (customer)/
    │   ├── menu/page.tsx                       ✅ Browse menu, add to cart
    │   ├── order/page.tsx                      ✅ Cart, time slot, table selection, pay
    │   ├── track/[order_id]/page.tsx           ✅ QR code + receipt download
    │   ├── wallet/page.tsx                     ✅ Balance + transaction history + topup
    │   └── profile/page.tsx                    ✅ View only (Phase 19: add edit + password change)
    ├── (staff)/
    │   ├── orders/page.tsx                     ✅ Kitchen order queue
    │   └── menu/page.tsx                       ❌ [Phase 15] Toggle item availability
    ├── (cleaner)/
    │   └── tables/page.tsx                     ✅ Assignment list + complete action
    ├── (admin)/
    │   ├── layout.tsx                          ✅ Admin guard (admin roles only)
    │   ├── dashboard/page.tsx                  ✅ Summary stats + 7-day revenue chart
    │   ├── orders/page.tsx                     ✅ All orders, filter, status update
    │   ├── users/page.tsx                      ✅ User list, activate/deactivate
    │   ├── inventory/
    │   │   ├── page.tsx                        ✅
    │   │   ├── items/page.tsx                  ✅
    │   │   ├── movements/page.tsx              ✅
    │   │   ├── purchase-orders/page.tsx        ✅
    │   │   └── central/page.tsx                ✅ Franchise central warehouse
    │   ├── reports/page.tsx                    ✅
    │   ├── tables/page.tsx                     ❌ [Phase 16] Floor plan + live status
    │   ├── analytics/page.tsx                  ❌ [Phase 17]
    │   ├── menu/page.tsx                       ❌ [Phase 18]
    │   ├── settings/page.tsx                   ❌ [Phase 15]
    │   └── memo/page.tsx                       ❌ [Phase 15]
    └── (food-court)/
        ├── layout.tsx                          ❌ [Phase 20]
        ├── dashboard/page.tsx                  ❌ [Phase 20]
        ├── menu/page.tsx                       ❌ [Phase 20]
        ├── deliver/page.tsx                    ❌ [Phase 20]
        └── analytics/page.tsx                  ❌ [Phase 20]
```

---

## 3. Global State (Zustand Store)

File: `frontend/src/store/useStore.ts`

```typescript
interface Store {
  // Auth
  user: User | null
  token: string | null
  hasHydrated: boolean

  // Tenant context (populated from JWT claims on login or tenant layout)
  tenantId: string | null
  tenantType: TenantType | null
  tenantSlug: string | null
  outletId: string | null
  brandColor: string               // Default: "#1A4D2E"

  // Shopping cart
  cart: CartItem[]                 // { item: MenuItem, quantity: number }
  isCartOpen: boolean

  // User financials
  walletBalance: number
  rewardPoints: number

  // Notifications (in-memory, not persisted)
  notifications: Notification[]

  // Auth actions
  setUser(user: User): void       // Also syncs walletBalance, rewardPoints, tenantId, outletId
  setToken(token: string): void
  clearAuth(): void               // Clears user, token, cart, notifications
  setHasHydrated(v: boolean): void
  setTenantContext(ctx: TenantContext): void
  setTenantSlug(slug: string): void

  // Cart actions
  addToCart(item: MenuItem): void
  removeFromCart(itemId: string): void
  updateQuantity(itemId: string, quantity: number): void
  clearCart(): void
  cartTotal(): number
  cartCount(): number
  cartItemCount(itemId: string): number

  // Wallet actions
  setWalletBalance(balance: number): void
  setRewardPoints(points: number): void
  addWalletBalance(amount: number): void
  deductWalletBalance(amount: number): void

  // Notification actions
  unreadCount(): number
  addNotification(notification: Notification): void
  markAllRead(): void

  // Cart UI
  toggleCart(): void
  openCart(): void
  closeCart(): void
}
```

**Persistence:** Uses `zustand/middleware/persist` with `localStorage` key `scms-store`.  
Fields persisted: `user`, `token`, `walletBalance`, `rewardPoints`, `tenantId`, `tenantType`, `tenantSlug`, `outletId`, `brandColor`.  
Fields NOT persisted: `cart`, `notifications`, `isCartOpen`, `hasHydrated`.

On hydration: `onRehydrateStorage` callback calls `setHasHydrated(true)` — components should check `hasHydrated` before rendering auth-gated content.

---

## 4. API Client

File: `frontend/src/lib/api.ts`

```typescript
// axios instance configured with:
baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

// Request interceptor:
//   Reads scms-store from localStorage
//   Adds: Authorization: Bearer {token}
//   (No X-Tenant-Slug header — tenant context is embedded in the JWT)

// No response interceptor currently implemented.
// Error handling is done at the component/page level.
```

**Important:** There is no `X-Tenant-Slug` header. The backend middleware derives tenant context from the Bearer JWT. Components calling the API are responsible for handling 401/403 responses.

---

## 5. Route Protection

Each layout file under role-specific segments checks:
1. Token exists in store → redirect to `/{slug}/login` if missing
2. `isTokenExpired(token)` → redirect if expired
3. Role matches the segment (e.g., only admin roles in `(admin)/`)

```typescript
// src/lib/auth.ts exports:
getRoleFromToken(token: string): UserRole
getClaimsFromToken(token: string): JWTClaims
isTokenExpired(token: string): boolean
```

---

## 6. Tenant Branding Injection

File: `frontend/src/app/[tenant_slug]/layout.tsx`

On every page load within a tenant route:
1. Fetch tenant branding (from store or `GET /tenants/public/{slug}`)
2. Inject CSS custom property: `document.documentElement.style.setProperty('--color-primary', tenant.brand_color ?? '#1A4D2E')`
3. Display tenant logo in navbar

In `tailwind.config.ts`:
```javascript
theme: { extend: { colors: { primary: 'var(--color-primary)' } } }
```

All hardcoded `#1A4D2E` references in Tailwind classes must be replaced with `bg-primary` / `text-primary` / `border-primary`.

---

## 7. Component Inventory

### Built Components ✅

| Component | File | Description |
|---|---|---|
| `OtpInput` | `components/auth/OtpInput.tsx` | 6-digit split-box, auto-advance, paste, 60s resend |
| `TableGrid` | `components/order/TableGrid.tsx` | Read-only table status grid for order placement |
| `OrderQrCode` | `components/order/OrderQrCode.tsx` | Fetches base64 QR, renders img |
| `ReceiptButton` | `components/order/ReceiptButton.tsx` | PDF blob download |
| `SalesChart` | `components/admin/SalesChart.tsx` | 7-day revenue line chart |
| `ActiveTableMap` | `components/admin/ActiveTableMap.tsx` | Real-time table status grid |
| `InventoryTable` | `components/inventory/InventoryTable.tsx` | CRUD data table |
| `MenuItemCard` | `components/menu/MenuItemCard.tsx` | Card with add-to-cart |
| `CategoryTabs` | `components/menu/CategoryTabs.tsx` | Horizontal filter tabs |
| `CartSidebar` | `components/order/CartSidebar.tsx` | Floating cart panel |
| `LowStockBadge` | `components/inventory/LowStockBadge.tsx` | Warning badge |
| `PurchaseOrderForm` | `components/inventory/PurchaseOrderForm.tsx` | Create/receive PO |
| `StockMovementLog` | `components/inventory/StockMovementLog.tsx` | Paginated movement table |
| `CentralInventoryPanel` | `components/inventory/CentralInventoryPanel.tsx` | Franchise central view |

### Planned Components ❌

| Component | Phase | Description |
|---|---|---|
| `TenantCard` | 14 | Discovery page org card |
| `ProfileTypeSelector` | 14 | Registration role selection (Student/Employee/Customer) |
| `TenantWelcomeBanner` | 14 | Shows org name + logo on register page |
| `BrandColorPicker` | 15 | Hex input + live preview for settings |
| `LogoUploader` | 15 | Drag-and-drop image upload |
| `DomainRestrictionInput` | 15 | Domain input with @-prefix validation |
| `OperationsToggle` | 15 | Styled toggle with explanation text |
| `FloorPlanEditor` | 16 | Drag-and-drop table canvas (12×8 grid) |
| `TableCard` | 16 | Admin-facing table card (editable) |
| `TableDetailPanel` | 16 | Slide-over panel with table details + actions |
| `ZoneFilter` | 16 | Zone tabs for table filtering |
| `HourlyHeatmap` | 17 | 24-column order volume heatmap |
| `TopItemsChart` | 17 | Horizontal bar chart for analytics |
| `MenuItemForm` | 18 | Admin menu item add/edit form |
| `CategoryManager` | 18 | Inline editable category list |
| `NotificationBell` | 21 | Navbar bell with unread count badge |
| `FoodCourtVendorGrid` | 20 | Vendor tiles for food court dashboard |

---

## 8. TypeScript Types

File: `frontend/src/types/index.ts`

Key types (kept in sync with backend Pydantic schemas):

```typescript
// 7 tenant types — no 'platform' type
type TenantType =
  | 'franchise_brand' | 'franchise_outlet'
  | 'corporate' | 'academic' | 'independent_restaurant'
  | 'food_court' | 'food_court_vendor'

// 4 subscription tiers
type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise'

// 10 roles + 1 legacy alias ('admin' → tenant_admin, used in old routes)
type UserRole =
  | 'platform_admin' | 'super_admin' | 'outlet_admin' | 'tenant_admin'
  | 'food_court_admin' | 'staff' | 'cleaner' | 'server'
  | 'student' | 'customer'
  | 'admin'   // legacy alias — maps to tenant_admin in old code

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
type PaymentStatus = 'pending' | 'paid' | 'refunded'
type PaymentMethod = 'wallet' | 'simulation' | 'bkash' | 'nagad' | 'card'
type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning'
type StockMovementType = 'purchase' | 'transfer_in' | 'transfer_out' | 'consumption' | 'adjustment' | 'waste'
type PurchaseOrderStatus = 'draft' | 'submitted' | 'approved' | 'received' | 'cancelled'
type InventoryUnit = 'kg' | 'g' | 'litre' | 'ml' | 'piece' | 'packet' | 'dozen'

interface User {
  user_id: string
  tenant_id: string
  outlet_id?: string | null
  full_name: string
  email: string
  role: UserRole
  student_id?: string | null
  employee_id?: string | null     // For corporate/staff users
  phone?: string | null
  wallet_balance: number          // number, not string
  reward_points: number           // Loyalty points
  email_verified: boolean         // TRUE after OTP verification
  is_active: boolean
  created_at: string
}

interface TenantContext {
  tenant_id: string
  tenant_type: TenantType
  tenant_slug: string
  outlet_id?: string | null
  brand_color?: string
}

interface MenuItem {
  item_id: string
  tenant_id?: string
  outlet_id?: string | null
  category_id: number             // number (category_id is SERIAL INTEGER)
  name: string
  description?: string
  price: number
  image_url?: string
  is_available: boolean
  is_homemade: boolean
  prep_time_mins: number
  created_at: string
}

interface Order {
  order_id: string
  tenant_id?: string
  user_id: string
  table_id?: number               // number (table_id is SERIAL INTEGER)
  time_slot: string
  status: OrderStatus
  total_amount: number
  discount_amount: number
  payment_status: PaymentStatus
  payment_method?: PaymentMethod
  special_notes?: string
  items: OrderItem[]
  created_at: string
  updated_at: string
}

interface TableMap {
  table_id: number                // number (SERIAL INTEGER)
  table_number: string
  zone: string
  capacity: number
  status: TableStatus
  position_x: number
  position_y: number
}

// JWT payload decoded client-side
type JwtPayload = {
  sub: string
  role: string
  tenant_id: string
  tenant_type: TenantType
  tenant_slug: string
  outlet_id?: string | null
  brand_color?: string
  jti?: string
  exp: number
}
```

---

## 9. WebSocket Hook

File: `frontend/src/hooks/useWebSocket.ts`

Usage (in layout or page components):

```typescript
const { lastEvent } = useWebSocket(tenantSlug, token)

useEffect(() => {
  if (!lastEvent) return
  switch (lastEvent.event) {
    case 'ORDER_NEW':    refetchOrders(); toast('New order received'); break
    case 'ORDER_READY':  toast('Your order is ready!'); break
    case 'TABLE_CLEAN':  refetchTables(); break
    case 'LOW_STOCK_ALERT': showLowStockBanner(lastEvent.data); break
  }
}, [lastEvent])
```

The hook manages connection lifecycle (connect/disconnect), ping/pong keepalive, and exponential backoff reconnection.

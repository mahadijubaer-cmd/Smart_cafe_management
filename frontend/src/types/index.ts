// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type TenantType =
  | 'franchise_brand'
  | 'franchise_outlet'
  | 'corporate'
  | 'academic'
  | 'independent_restaurant'
  | 'food_court'
  | 'food_court_vendor'

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise'

export type UserRole =
  | 'platform_admin'
  | 'super_admin'
  | 'outlet_admin'
  | 'tenant_admin'
  | 'food_court_admin'
  | 'staff'
  | 'server'
  | 'cleaner'
  | 'customer'
  | 'student'   // legacy alias — maps to customer
  | 'admin'     // legacy alias — maps to tenant_admin

export type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning'
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'refunded'
export type PaymentMethod = 'wallet' | 'simulation' | 'bkash' | 'nagad' | 'card'
export type NotificationStatus = 'success' | 'failed' | 'info' | 'warning'

export type InventoryUnit = 'kg' | 'g' | 'litre' | 'ml' | 'piece' | 'packet' | 'dozen'
export type StockMovementType = 'purchase' | 'transfer_in' | 'transfer_out' | 'consumption' | 'adjustment' | 'waste'
export type PurchaseOrderStatus = 'draft' | 'submitted' | 'approved' | 'received' | 'cancelled'

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface Tenant {
  tenant_id: string
  parent_tenant_id?: string | null
  tenant_type: TenantType
  name: string
  slug: string
  logo_url?: string | null
  brand_color: string
  subscription_tier: SubscriptionTier
  is_active: boolean
  allowed_email_domain?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  contact_email?: string | null
  homemade_enabled: boolean
  inventory_strict_mode: boolean
  created_at: string
  updated_at: string
}

export interface TenantContext {
  tenant_id: string
  tenant_type: TenantType
  tenant_slug: string
  outlet_id?: string | null
  brand_color?: string
}

export interface TenantCreate {
  tenant_type: TenantType
  name: string
  slug: string
  subscription_tier?: SubscriptionTier
  logo_url?: string | null
  brand_color?: string
  allowed_email_domain?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  contact_email?: string | null
  homemade_enabled?: boolean
  inventory_strict_mode?: boolean
}

export interface TenantPublicResponse {
  name: string
  slug: string
  tenant_type: TenantType
  logo_url: string | null
  city: string | null
  brand_color: string
  is_active: boolean
}

export interface TenantPublicDetailResponse extends TenantPublicResponse {
  allowed_email_domain: string | null
}

export interface TenantPublicListResponse {
  items: TenantPublicResponse[]
  total: number
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  user_id: string
  tenant_id: string
  outlet_id?: string | null
  full_name: string
  email: string
  role: UserRole
  student_id?: string | null
  employee_id?: string | null
  phone?: string | null
  wallet_balance: number
  reward_points: number
  email_verified: boolean
  is_active: boolean
  created_at: string
  updated_at?: string
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export interface Category {
  category_id: number
  name: string
  icon_url?: string
  display_order: number
  is_active?: boolean
  item_count?: number
}

export interface MenuItem {
  item_id: string
  tenant_id?: string
  outlet_id?: string | null
  category_id: number
  category?: Category
  listed_by?: string | null
  name: string
  description?: string
  price: number
  image_url?: string
  is_available: boolean
  is_homemade: boolean
  prep_time_mins: number
  created_at: string
  category_name?: string
}

export interface CartItem {
  item: MenuItem
  quantity: number
}

// ─── Tables ───────────────────────────────────────────────────────────────────

export interface TableMap {
  table_id: number
  table_number: string
  zone: string
  capacity: number
  status: TableStatus
  position_x: number
  position_y: number
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface OrderItem {
  order_item_id: string
  item_id: string
  item?: MenuItem
  menu_item?: MenuItem
  quantity: number
  unit_price: number
  subtotal: number
  order_id?: string
}

export interface Order {
  order_id: string
  tenant_id?: string
  outlet_id?: string | null
  user_id: string
  table_id?: number
  table?: TableMap
  table_number?: string | null
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
  estimated_time?: string | null
}

export interface OrderCreate {
  items: { item_id: string; quantity: number }[]
  table_id?: number
  time_slot: string
  special_notes?: string
  redeem_points?: boolean
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  payment_id: string
  order_id: string
  amount: number
  method: PaymentMethod
  status: 'success' | 'failed' | 'refunded'
  transaction_ref?: string
  created_at: string
  user_id?: string
}

export interface PaymentOrderInfo {
  order_id: string
  total_amount: number
  discount_amount: number
  payment_status: PaymentStatus
  created_at: string
}

export interface PaymentHistoryResponse {
  payment_id: string
  order_id: string
  amount: number
  method: PaymentMethod
  status: 'success' | 'failed' | 'refunded'
  created_at: string
  order: PaymentOrderInfo
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  notif_id: string
  type: string
  message: string
  is_read: boolean
  created_at: string
  title?: string
  notification_id?: string
}

// ─── Cleaners ─────────────────────────────────────────────────────────────────

export interface CleanerLog {
  log_id: string
  cleaner_id: string
  table_id: number
  status: 'assigned' | 'in_progress' | 'done'
  assigned_at: string
  cleaned_at?: string | null
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

export interface WsMessage {
  type:
    | 'ORDER_PLACED'
    | 'ORDER_CONFIRMED'
    | 'ORDER_PREPARING'
    | 'ORDER_READY'
    | 'MEAL_DONE'
    | 'CLEAN_ASSIGNED'
    | 'TABLE_CLEAN'
    | 'LOW_STOCK'
    | 'PING'
    | 'PONG'
  order_id?: string
  table_number?: string
  table_id?: number
  log_id?: string
  estimated_time?: number
  items?: { name: string; quantity: number }[]
  // LOW_STOCK fields
  item_id?: string
  item_name?: string
  quantity_on_hand?: number
  reorder_level?: number
  unit?: InventoryUnit
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryCategory {
  inv_category_id: number
  tenant_id: string
  name: string
  description?: string | null
}

export interface InventoryItem {
  item_id: string
  tenant_id: string
  outlet_id?: string | null
  inv_category_id?: number | null
  inv_category?: InventoryCategory | null
  is_central: boolean
  name: string
  sku?: string | null
  unit: InventoryUnit
  quantity_on_hand: number
  reorder_level: number
  reorder_quantity: number
  unit_cost?: number | null
  supplier_name?: string | null
  supplier_contact?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface InventoryItemCreate {
  inv_category_id?: number | null
  is_central?: boolean
  name: string
  sku?: string | null
  unit: InventoryUnit
  quantity_on_hand?: number
  reorder_level?: number
  reorder_quantity?: number
  unit_cost?: number | null
  supplier_name?: string | null
  supplier_contact?: string | null
  notes?: string | null
}

export interface InventoryMovement {
  movement_id: string
  tenant_id: string
  inventory_item_id: string
  inventory_item?: InventoryItem
  movement_type: StockMovementType
  quantity_delta: number
  quantity_before: number
  quantity_after: number
  order_id?: string | null
  purchase_order_id?: string | null
  performed_by?: string | null
  notes?: string | null
  created_at: string
}

export interface PurchaseOrderItem {
  po_item_id: string
  po_id: string
  inventory_item_id: string
  inventory_item?: InventoryItem
  quantity_ordered: number
  quantity_received: number
  unit_cost?: number | null
  total_cost?: number | null
}

export interface PurchaseOrder {
  po_id: string
  tenant_id: string
  outlet_id?: string | null
  is_transfer: boolean
  from_tenant_id?: string | null
  po_number: string
  status: PurchaseOrderStatus
  supplier_name?: string | null
  supplier_contact?: string | null
  expected_delivery?: string | null
  received_at?: string | null
  notes?: string | null
  created_by?: string | null
  approved_by?: string | null
  created_at: string
  updated_at: string
  items?: PurchaseOrderItem[]
}

export interface MenuItemRecipe {
  recipe_id: string
  tenant_id: string
  menu_item_id: string
  inventory_item_id: string
  inventory_item?: InventoryItem
  quantity_per_serving: number
}

// ─── Backward-compat schema types ─────────────────────────────────────────────

export interface CategoryResponse {
  category_id: number
  name: string
  icon_url?: string
  display_order: number
}

export interface MenuItemCreate {
  category_id: number
  name: string
  description?: string
  price: number
  image_url?: string
  is_available?: boolean
  is_homemade?: boolean
  prep_time_mins?: number
}

export interface MenuItemUpdate {
  category_id: number
  name: string
  description?: string
  price: number
  image_url?: string
  is_available: boolean
  is_homemade: boolean
  prep_time_mins?: number
}

export interface MenuItemResponse {
  item_id: string
  category_id: number
  name: string
  description?: string
  price: number
  image_url?: string
  is_available: boolean
  is_homemade: boolean
  prep_time_mins: number
  created_at: string
}

export interface TableResponse {
  table_id: number
  table_number: string
  zone: string
  capacity: number
  status: string
  position_x: number
  position_y: number
}

export interface TableUpdateStatus {
  status: TableStatus
}

export interface PaymentCreate {
  order_id: string
  method: PaymentMethod
}

export interface PaymentResponse {
  payment_id: string
  order_id: string
  amount: number
  method: PaymentMethod
  status: 'success' | 'failed' | 'refunded'
}

export interface TopupRequest {
  amount: number
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface ApiError {
  detail: string | string[]
}

export interface MenuItemWithCategory extends MenuItem {
  category?: Category
}

export interface UserResponse extends User {}

export type UserRole = 'student' | 'staff' | 'cleaner' | 'admin'
export type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning'
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'refunded'
export type PaymentMethod = 'wallet' | 'simulation'
export type NotificationStatus = 'success' | 'failed' | 'info' | 'warning'

export interface User {
  user_id: string
  full_name: string
  email: string
  role: UserRole
  student_id?: string
  phone?: string
  wallet_balance: number
  reward_points: number
  is_active: boolean
  created_at: string
  updated_at?: string
}

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
  category_id: number
  category?: Category
  name: string
  description?: string
  price: number
  image_url?: string
  is_available: boolean
  is_homemade: boolean
  prep_time_mins: number
  created_at: string
  listed_by?: string
  category_name?: string
}

export interface CartItem {
  item: MenuItem
  quantity: number
}

export interface TableMap {
  table_id: number
  table_number: string
  zone: string
  capacity: number
  status: TableStatus
  position_x: number
  position_y: number
}

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

export interface Notification {
  notif_id: string
  type: string
  message: string
  is_read: boolean
  created_at: string
  title?: string
  notification_id?: string
}

export interface CleanerLog {
  log_id: string
  cleaner_id: string
  table_id: number
  status: 'assigned' | 'in_progress' | 'done'
  assigned_at: string
  cleaned_at?: string | null
}

export interface WsMessage {
  type: 'ORDER_PLACED' | 'ORDER_CONFIRMED' | 'ORDER_PREPARING' | 'ORDER_READY' | 'MEAL_DONE' | 'CLEAN_ASSIGNED' | 'TABLE_CLEAN' | 'PING' | 'PONG'
  order_id?: string
  table_number?: string
  table_id?: number
  log_id?: string
  estimated_time?: number
  items?: { name: string; quantity: number }[]
}

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

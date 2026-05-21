// User types
export interface User {
  user_id: string
  full_name: string
  email: string
  role: 'student' | 'staff' | 'cleaner' | 'admin'
  student_id?: string
  phone?: string
  wallet_balance: number
  reward_points: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// Category types
export interface Category {
  category_id: number
  name: string
  icon_url?: string
  display_order: number
  is_active: boolean
}

// Menu Item types
export interface MenuItem {
  item_id: string
  category_id: number
  listed_by?: string
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

export interface MenuItemWithCategory extends MenuItem {
  category?: Category
}

// Table types
export interface TableMap {
  table_id: number
  table_number: string
  zone: string
  capacity: number
  status: 'available' | 'reserved' | 'occupied' | 'cleaning'
  position_x: number
  position_y: number
}

// Order Item types
export interface OrderItem {
  order_item_id: string
  order_id: string
  item_id: string
  quantity: number
  unit_price: number
  subtotal?: number
  menu_item?: MenuItem
}

// Order types
export interface Order {
  order_id: string
  user_id: string
  table_id?: number
  table_number?: string | null
  time_slot: string
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  total_amount: number
  discount_amount: number
  payment_status: 'pending' | 'paid' | 'refunded'
  payment_method?: 'wallet' | 'simulation'
  special_notes?: string
  created_at: string
  updated_at: string
  estimated_time?: string | null
  items?: OrderItem[]
}

// Cleaner Log types
export interface CleanerLog {
  log_id: string
  cleaner_id: string
  table_id: number
  triggered_by_order?: string
  assigned_at: string
  cleaned_at?: string
  status: 'assigned' | 'in_progress' | 'done'
  table?: TableMap
}

// Payment types
export interface Payment {
  payment_id: string
  order_id: string
  user_id: string
  amount: number
  method: 'wallet' | 'simulation'
  status: string
  transaction_ref?: string
  created_at: string
}

// Reward Log types
export interface RewardLog {
  log_id: string
  user_id: string
  order_id?: string
  points_earned: number
  points_redeemed: number
  description?: string
  created_at: string
}

// Cart types
export interface CartItem {
  item_id: string
  name: string
  price: number
  quantity: number
  image_url?: string
  is_homemade: boolean
}

// API Response types
export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface ApiError {
  detail: string | string[]
}

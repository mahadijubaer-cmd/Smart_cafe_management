import type { MenuItem } from '@/types'
import { useStore } from '../useStore'

const mockUser = {
  user_id: 'user-1',
  full_name: 'Test Student',
  email: 'student@bracu.ac.bd',
  role: 'student' as const,
  student_id: '22100001',
  phone: '01700000000',
  wallet_balance: 100,
  reward_points: 25,
  is_active: true,
  created_at: '2026-05-23T00:00:00Z',
  updated_at: '2026-05-23T00:00:00Z',
}

const mockItem: MenuItem = {
  item_id: 'item-1',
  category_id: 1,
  name: 'Coffee',
  price: 120,
  is_available: true,
  is_homemade: false,
  prep_time_mins: 10,
  created_at: '2026-05-23T00:00:00Z',
}

describe('useStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      user: null,
      token: null,
      hasHydrated: false,
      cart: [],
      walletBalance: 0,
      rewardPoints: 0,
      notifications: [],
      isCartOpen: false,
    })
  })

  it('addToCart adds item to cart', () => {
    useStore.getState().addToCart(mockItem)

    expect(useStore.getState().cart).toEqual([{ item: mockItem, quantity: 1 }])
  })

  it('addToCart same item twice increments quantity', () => {
    useStore.getState().addToCart(mockItem)
    useStore.getState().addToCart(mockItem)

    expect(useStore.getState().cart).toEqual([{ item: mockItem, quantity: 2 }])
  })

  it('removeFromCart removes item', () => {
    useStore.getState().addToCart(mockItem)
    useStore.getState().removeFromCart(mockItem.item_id)

    expect(useStore.getState().cart).toEqual([])
  })

  it('cartTotal returns correct sum including quantities', () => {
    useStore.getState().addToCart(mockItem)
    useStore.getState().addToCart({
      item_id: 'item-2',
      category_id: 1,
      name: 'Tea',
      price: 30,
      is_available: true,
      is_homemade: false,
      prep_time_mins: 5,
      created_at: '2026-05-23T00:00:00Z',
    })
    useStore.getState().updateQuantity('item-2', 3)

    expect(useStore.getState().cartTotal()).toBe(330)
    expect(useStore.getState().cartCount()).toBe(4)
    expect(useStore.getState().cartItemCount('item-2')).toBe(3)
  })

  it('clearAuth resets user and token to null', () => {
    useStore.setState({ user: mockUser as never, token: 'jwt-token' })

    useStore.getState().clearAuth()

    expect(useStore.getState().user).toBeNull()
    expect(useStore.getState().token).toBeNull()
    expect(useStore.getState().cart).toEqual([])
  })

  it('wallet actions keep balance non-negative', () => {
    useStore.getState().setWalletBalance(150)
    useStore.getState().deductWalletBalance(200)

    expect(useStore.getState().walletBalance).toBe(0)
  })

  it('notifications can be marked as read', () => {
    useStore.getState().addNotification({
      notification_id: 'note-1',
      title: 'New order',
      message: 'Your order is ready.',
      is_read: false,
      created_at: '2026-05-23T00:00:00Z',
    })

    expect(useStore.getState().unreadCount()).toBe(1)

    useStore.getState().markAllRead()

    expect(useStore.getState().unreadCount()).toBe(0)
  })
})
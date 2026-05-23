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

const mockItem = {
  item_id: 'item-1',
  name: 'Coffee',
  price: 120,
  quantity: 1,
  is_homemade: false,
}

describe('useStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      user: null,
      token: null,
      hasHydrated: false,
      cart: [],
    })
  })

  it('addToCart adds item to cart', () => {
    useStore.getState().addToCart(mockItem)

    expect(useStore.getState().cart).toEqual([{ ...mockItem, quantity: 1 }])
  })

  it('addToCart same item twice increments quantity', () => {
    useStore.getState().addToCart(mockItem)
    useStore.getState().addToCart(mockItem)

    expect(useStore.getState().cart).toEqual([{ ...mockItem, quantity: 2 }])
  })

  it('removeFromCart removes item', () => {
    useStore.getState().addToCart(mockItem)
    useStore.getState().removeFromCart(mockItem.item_id)

    expect(useStore.getState().cart).toEqual([])
  })

  it('cartTotal returns correct sum including quantities', () => {
    useStore.getState().addToCart({ ...mockItem, quantity: 2 })
    useStore.getState().addToCart({ item_id: 'item-2', name: 'Tea', price: 30, quantity: 3, is_homemade: false })

    expect(useStore.getState().cartTotal()).toBe(330)
  })

  it('clearAuth resets user and token to null', () => {
    useStore.setState({ user: mockUser as never, token: 'jwt-token' })

    useStore.getState().clearAuth()

    expect(useStore.getState().user).toBeNull()
    expect(useStore.getState().token).toBeNull()
  })
})
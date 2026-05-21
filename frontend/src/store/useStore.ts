'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, CartItem } from '@/types'

interface Store {
  // Auth state
  user: User | null
  token: string | null
  hasHydrated: boolean
  
  // Cart state
  cart: CartItem[]
  
  // Auth actions
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  clearAuth: () => void
  setHasHydrated: (hasHydrated: boolean) => void
  
  // Cart actions
  addToCart: (item: CartItem) => void
  removeFromCart: (itemId: string) => void
  updateCartItemQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
  
  // Computed values
  cartTotal: () => number
  cartItemCount: () => number
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      hasHydrated: false,
      cart: [],
      
      // Auth actions
      setUser: (user) => set({ user }),
      setToken: (token) => {
        if (token) {
          localStorage.setItem('token', token)
        } else {
          localStorage.removeItem('token')
        }
        set({ token })
      },
      clearAuth: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        set({ user: null, token: null })
      },

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      
      // Cart actions
      addToCart: (item) => {
        const state = get()
        const existingItem = state.cart.find((cartItem) => cartItem.item_id === item.item_id)
        
        if (existingItem) {
          set({
            cart: state.cart.map((cartItem) =>
              cartItem.item_id === item.item_id
                ? { ...cartItem, quantity: cartItem.quantity + (item.quantity || 1) }
                : cartItem
            ),
          })
        } else {
          set({ cart: [...state.cart, { ...item, quantity: item.quantity || 1 }] })
        }
      },
      
      removeFromCart: (itemId) => {
        set((state) => ({
          cart: state.cart.filter((item) => item.item_id !== itemId),
        }))
      },
      
      updateCartItemQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(itemId)
          return
        }
        
        set((state) => ({
          cart: state.cart.map((item) =>
            item.item_id === itemId ? { ...item, quantity } : item
          ),
        }))
      },
      
      clearCart: () => set({ cart: [] }),
      
      // Computed values
      cartTotal: () => {
        const state = get()
        return state.cart.reduce((total, item) => total + item.price * item.quantity, 0)
      },
      
      cartItemCount: () => {
        const state = get()
        return state.cart.reduce((count, item) => count + item.quantity, 0)
      },
    }),
    {
      name: 'scms-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        cart: state.cart,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

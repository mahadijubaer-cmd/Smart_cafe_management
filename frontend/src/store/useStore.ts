'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, CartItem, MenuItem, Notification, Order, User } from '@/types'

type StoreNotification = Notification & {
  category?: Category
  order?: Order
}

interface Store {
  user: User | null
  token: string | null
  hasHydrated: boolean
  cart: CartItem[]
  walletBalance: number
  rewardPoints: number
  notifications: StoreNotification[]
  isCartOpen: boolean
  setUser: (user: User) => void
  setToken: (token: string) => void
  clearAuth: () => void
  setHasHydrated: (hasHydrated: boolean) => void
  addToCart: (item: MenuItem) => void
  removeFromCart: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
  cartTotal: () => number
  cartCount: () => number
  cartItemCount: (itemId: string) => number
  setWalletBalance: (balance: number) => void
  setRewardPoints: (points: number) => void
  addWalletBalance: (amount: number) => void
  deductWalletBalance: (amount: number) => void
  unreadCount: () => number
  addNotification: (notification: Notification) => void
  markAllRead: () => void
  toggleCart: () => void
  openCart: () => void
  closeCart: () => void
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      hasHydrated: false,
      cart: [],
      walletBalance: 0,
      rewardPoints: 0,
      notifications: [],
      isCartOpen: false,
      setUser: (user) =>
        set({
          user,
          walletBalance: user.wallet_balance,
          rewardPoints: user.reward_points,
        }),
      setToken: (token) => set({ token }),
      clearAuth: () => {
        set({ user: null, token: null, cart: [], notifications: [], isCartOpen: false })
      },

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      addToCart: (item) => {
        const state = get()
        const existingItem = state.cart.find((cartItem) => cartItem.item.item_id === item.item_id)
        
        if (existingItem) {
          set({
            cart: state.cart.map((cartItem) =>
              cartItem.item.item_id === item.item_id
                ? { ...cartItem, quantity: cartItem.quantity + 1 }
                : cartItem
            ),
          })
          return
        }

        set({ cart: [...state.cart, { item, quantity: 1 }] })
      },
      removeFromCart: (itemId) => {
        set((state) => ({
          cart: state.cart.filter((cartItem) => cartItem.item.item_id !== itemId),
        }))
      },
      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(itemId)
          return
        }
        
        set((state) => ({
          cart: state.cart.map((cartItem) =>
            cartItem.item.item_id === itemId ? { ...cartItem, quantity } : cartItem
          ),
        }))
      },
      clearCart: () => set({ cart: [] }),
      cartTotal: () => {
        return get().cart.reduce((total, cartItem) => total + cartItem.item.price * cartItem.quantity, 0)
      },
      cartCount: () => {
        return get().cart.reduce((count, cartItem) => count + cartItem.quantity, 0)
      },
      cartItemCount: (itemId) => {
        return get().cart.find((cartItem) => cartItem.item.item_id === itemId)?.quantity ?? 0
      },
      setWalletBalance: (balance) =>
        set((state) => ({
          walletBalance: Math.max(balance, 0),
          user: state.user ? { ...state.user, wallet_balance: Math.max(balance, 0) } : state.user,
        })),
      setRewardPoints: (points) =>
        set((state) => ({
          rewardPoints: Math.max(points, 0),
          user: state.user ? { ...state.user, reward_points: Math.max(points, 0) } : state.user,
        })),
      addWalletBalance: (amount) =>
        set((state) => {
          const nextBalance = Math.max(state.walletBalance + amount, 0)
          return {
            walletBalance: nextBalance,
            user: state.user ? { ...state.user, wallet_balance: nextBalance } : state.user,
          }
        }),
      deductWalletBalance: (amount) =>
        set((state) => {
          const nextBalance = Math.max(state.walletBalance - amount, 0)
          return {
            walletBalance: nextBalance,
            user: state.user ? { ...state.user, wallet_balance: nextBalance } : state.user,
          }
        }),
      unreadCount: () => get().notifications.filter((notification) => !notification.is_read).length,
      addNotification: (notification) =>
        set((state) => ({ notifications: [...state.notifications, notification] })),
      markAllRead: () =>
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            is_read: true,
          })),
        })),
      toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
      openCart: () => set({ isCartOpen: true }),
      closeCart: () => set({ isCartOpen: false }),
    }),
    {
      name: 'scms-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        walletBalance: state.walletBalance,
        rewardPoints: state.rewardPoints,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

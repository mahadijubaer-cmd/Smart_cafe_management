'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, CartItem, MenuItem, Notification, Order, User, TenantType, TenantContext } from '@/types'

type StoreNotification = Notification & {
  category?: Category
  order?: Order
}

interface Store {
  // Auth
  user: User | null
  token: string | null
  hasHydrated: boolean

  // Tenant context (set on login + on slug navigation)
  tenantId: string | null
  tenantType: TenantType | null
  tenantSlug: string | null
  outletId: string | null
  brandColor: string

  // Shopping
  cart: CartItem[]
  walletBalance: number
  rewardPoints: number
  notifications: StoreNotification[]
  isCartOpen: boolean

  // Layout: true while a fixed-sidebar layout is mounted — the root layout's full-width
  // SiteFooter hides itself and the sidebar layout renders <SiteFooter inset /> in its content
  // column instead (specs/frontend/overview.md "Footer on fixed-sidebar pages"). Not persisted.
  globalFooterSuppressed: boolean

  // Setters
  setUser: (user: User) => void
  setToken: (token: string) => void
  clearAuth: () => void
  setHasHydrated: (hasHydrated: boolean) => void
  setTenantContext: (ctx: TenantContext) => void
  setTenantSlug: (slug: string) => void
  setGlobalFooterSuppressed: (suppressed: boolean) => void

  // Cart
  addToCart: (item: MenuItem) => void
  removeFromCart: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
  cartTotal: () => number
  cartCount: () => number
  cartItemCount: (itemId: string) => number

  // Wallet
  setWalletBalance: (balance: number) => void
  setRewardPoints: (points: number) => void
  addWalletBalance: (amount: number) => void
  deductWalletBalance: (amount: number) => void

  // Notifications
  unreadCount: () => number
  addNotification: (notification: Notification) => void
  markAllRead: () => void

  // UI
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
      tenantId: null,
      tenantType: null,
      tenantSlug: null,
      outletId: null,
      brandColor: '#1A4D2E',
      cart: [],
      walletBalance: 0,
      rewardPoints: 0,
      notifications: [],
      isCartOpen: false,
      globalFooterSuppressed: false,

      setUser: (user) =>
        set({
          user,
          walletBalance: user.wallet_balance,
          rewardPoints: user.reward_points,
          tenantId: user.tenant_id ?? null,
          outletId: user.outlet_id ?? null,
        }),

      setToken: (token) => set({ token }),

      clearAuth: () => {
        set({
          user: null,
          token: null,
          cart: [],
          notifications: [],
          isCartOpen: false,
          tenantId: null,
          tenantType: null,
          outletId: null,
        })
      },

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      setTenantContext: (ctx) =>
        set({
          tenantId: ctx.tenant_id,
          tenantType: ctx.tenant_type,
          tenantSlug: ctx.tenant_slug,
          outletId: ctx.outlet_id ?? null,
          brandColor: ctx.brand_color ?? '#1A4D2E',
        }),

      setTenantSlug: (slug) => set({ tenantSlug: slug }),

      setGlobalFooterSuppressed: (suppressed) => set({ globalFooterSuppressed: suppressed }),

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
        tenantId: state.tenantId,
        tenantType: state.tenantType,
        tenantSlug: state.tenantSlug,
        outletId: state.outletId,
        brandColor: state.brandColor,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

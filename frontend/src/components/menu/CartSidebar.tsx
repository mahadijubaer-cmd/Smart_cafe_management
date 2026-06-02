'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { CATEGORY_ICONS } from '@/lib/category'
import { useStore } from '@/store/useStore'
import type { MenuItem } from '@/types'

function getEmojiFallback(item: MenuItem) {
  if (!item.category_name) {
    return '🍽️'
  }

  return CATEGORY_ICONS[item.category_name] || '🍽️'
}

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CartSidebar() {
  const router = useRouter()
  const cart = useStore((state) => state.cart)
  const cartTotal = useStore((state) => state.cartTotal)
  const cartCount = useStore((state) => state.cartCount)
  const removeFromCart = useStore((state) => state.removeFromCart)
  const updateQuantity = useStore((state) => state.updateQuantity)
  const clearCart = useStore((state) => state.clearCart)
  const isCartOpen = useStore((state) => state.isCartOpen)
  const closeCart = useStore((state) => state.closeCart)
  const [confirmClear, setConfirmClear] = useState(false)
  const [removingIds, setRemovingIds] = useState<string[]>([])

  const subtotal = useMemo(() => cartTotal(), [cartTotal, cart])
  const itemCount = useMemo(() => cartCount(), [cartCount, cart])

  useEffect(() => {
    if (!isCartOpen) {
      setConfirmClear(false)
    }
  }, [isCartOpen])

  const handleClose = () => {
    closeCart()
  }

  const animateRemoval = (itemId: string, action: () => void) => {
    setRemovingIds((current) => (current.includes(itemId) ? current : [...current, itemId]))
    window.setTimeout(() => {
      action()
      setRemovingIds((current) => current.filter((id) => id !== itemId))
    }, 180)
  }

  const handleDecrement = (itemId: string, quantity: number) => {
    if (quantity <= 1) {
      animateRemoval(itemId, () => removeFromCart(itemId))
      return
    }

    updateQuantity(itemId, quantity - 1)
  }

  const handleRemove = (itemId: string) => {
    animateRemoval(itemId, () => removeFromCart(itemId))
  }

  const handleClearCart = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }

    setConfirmClear(false)
    clearCart()
  }

  const handleProceed = () => {
    closeCart()
    router.push('/order')
  }

  return (
    <>
      <div
        className={[
          'fixed inset-0 z-30 bg-black/40 transition-opacity duration-300',
          isCartOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={handleClose}
        aria-hidden="true"
      />

      <aside
        className={[
          'fixed z-40 bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          'left-0 right-0 bottom-0 rounded-t-2xl lg:left-auto lg:right-0 lg:top-0 lg:h-full lg:w-80 lg:rounded-none',
          isCartOpen ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-center pt-3 lg:hidden">
            <div className="h-1.5 w-12 rounded-full bg-gray-300" />
          </div>

          <header className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">My Cart</h2>
                <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                  {itemCount}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">Review items before checkout</p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
              aria-label="Close cart"
            >
              ✕
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5" style={{ maxHeight: '60vh' }}>
            {cart.length === 0 ? (
              <div className="flex min-h-[18rem] flex-col items-center justify-center text-center">
                <div className="cart-empty-pulse text-6xl">🛒</div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">Your cart is empty</h3>
                <p className="mt-2 max-w-xs text-sm text-gray-500">Browse menu to add items</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((cartItem) => {
                  const item = cartItem.item
                  const itemId = item.item_id
                  const emoji = getEmojiFallback(item)
                  const isRemoving = removingIds.includes(itemId)

                  return (
                    <div
                      key={itemId}
                      className={[
                        'rounded-2xl border border-gray-200 bg-gray-50 p-3 transition-all duration-200',
                        isRemoving ? 'cart-item-exit pointer-events-none opacity-0 translate-x-10' : 'opacity-100 translate-x-0',
                      ].join(' ')}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_top,#F6E7C9_0%,#E8D4A6_45%,#D8B97A_100%)] text-2xl">
                          <span aria-hidden="true">{emoji}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{item.name}</p>
                              <p className="mt-1 text-sm text-gray-500">{formatCurrency(item.price)}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemove(itemId)}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-white hover:text-red-600"
                              aria-label={`Remove ${item.name}`}
                            >
                              🗑
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-1 py-1">
                              <button
                                type="button"
                                onClick={() => handleDecrement(itemId, cartItem.quantity)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-gray-700 transition hover:bg-gray-50"
                                aria-label={`Decrease ${item.name}`}
                              >
                                −
                              </button>
                              <span className="min-w-7 text-center text-sm font-semibold text-slate-900">{cartItem.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(itemId, cartItem.quantity + 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-gray-700 transition hover:bg-gray-50"
                                aria-label={`Increase ${item.name}`}
                              >
                                +
                              </button>
                            </div>

                            <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.price * cartItem.quantity)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <footer className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.04)] sm:px-5">
            {subtotal < 50 ? (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Min order: ৳50
              </div>
            ) : null}

            <div className="mb-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm font-semibold text-slate-900">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClearCart}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                {confirmClear ? 'Sure?' : 'Clear Cart'}
              </button>

              <button
                type="button"
                onClick={handleProceed}
                disabled={cart.length === 0}
                className="inline-flex h-11 flex-[1.35] items-center justify-center rounded-full bg-[#1A4D2E] px-4 text-sm font-semibold text-white transition hover:bg-[#163f25] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Proceed to Order →
              </button>
            </div>
          </footer>
        </div>
      </aside>

      <style>{`
        @keyframes cart-empty-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
        }

        @keyframes cart-item-exit {
          0% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(24px);
          }
        }

        .cart-empty-pulse {
          animation: cart-empty-pulse 1.8s ease-in-out infinite;
        }

        .cart-item-exit {
          animation: cart-item-exit 180ms ease-out forwards;
        }
      `}</style>
    </>
  )
}

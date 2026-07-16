'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CATEGORY_ICONS } from '@/lib/category'
import { cn } from '@/lib/utils'
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
  const tenantSlug = useStore((state) => state.tenantSlug)
  const cart = useStore((state) => state.cart)
  const cartTotal = useStore((state) => state.cartTotal)
  const cartCount = useStore((state) => state.cartCount)
  const removeFromCart = useStore((state) => state.removeFromCart)
  const updateQuantity = useStore((state) => state.updateQuantity)
  const clearCart = useStore((state) => state.clearCart)
  const isCartOpen = useStore((state) => state.isCartOpen)
  const closeCart = useStore((state) => state.closeCart)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [removingIds, setRemovingIds] = useState<string[]>([])

  const subtotal = useMemo(() => cartTotal(), [cartTotal, cart])
  const itemCount = useMemo(() => cartCount(), [cartCount, cart])

  useEffect(() => {
    if (!isCartOpen) {
      setConfirmClearOpen(false)
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
    setConfirmClearOpen(false)
    clearCart()
  }

  const handleProceed = () => {
    closeCart()
    router.push(tenantSlug ? `/${tenantSlug}/order` : '/order')
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/40 transition-opacity duration-300',
          isCartOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed z-40 bg-background shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          'left-0 right-0 bottom-0 rounded-t-2xl lg:left-auto lg:right-0 lg:top-0 lg:h-full lg:w-80 lg:rounded-none',
          isCartOpen ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-center pt-3 lg:hidden">
            <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          </div>

          <header className="flex items-center justify-between border-b px-4 py-4 sm:px-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">My Cart</h2>
                <Badge variant="secondary">{itemCount}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Review items before checkout</p>
            </div>

            <Button variant="outline" size="icon" className="rounded-full" onClick={handleClose} aria-label="Close cart">
              <X />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5" style={{ maxHeight: '60vh' }}>
            {cart.length === 0 ? (
              <div className="flex min-h-[18rem] flex-col items-center justify-center text-center">
                <ShoppingCart className="cart-empty-pulse size-16 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-bold">Your cart is empty</h3>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">Browse menu to add items</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cart.map((cartItem) => {
                  const item = cartItem.item
                  const itemId = item.item_id
                  const emoji = getEmojiFallback(item)
                  const isRemoving = removingIds.includes(itemId)

                  return (
                    <div
                      key={itemId}
                      className={cn(
                        'rounded-2xl border bg-muted/40 p-3 transition-all duration-200',
                        isRemoving ? 'cart-item-exit pointer-events-none translate-x-10 opacity-0' : 'translate-x-0 opacity-100'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_top,#F6E7C9_0%,#E8D4A6_45%,#D8B97A_100%)] text-2xl">
                          <span aria-hidden="true">{emoji}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{item.name}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemove(itemId)}
                              aria-label={`Remove ${item.name}`}
                            >
                              <Trash2 />
                            </Button>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 rounded-full border bg-background px-1 py-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-full"
                                onClick={() => handleDecrement(itemId, cartItem.quantity)}
                                aria-label={`Decrease ${item.name}`}
                              >
                                <Minus className="size-4" />
                              </Button>
                              <span className="min-w-7 text-center text-sm font-semibold">{cartItem.quantity}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-full"
                                onClick={() => updateQuantity(itemId, cartItem.quantity + 1)}
                                aria-label={`Increase ${item.name}`}
                              >
                                <Plus className="size-4" />
                              </Button>
                            </div>

                            <p className="text-sm font-semibold">{formatCurrency(item.price * cartItem.quantity)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <footer className="sticky bottom-0 border-t bg-background px-4 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.04)] sm:px-5">
            {subtotal < 50 ? (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Min order: ৳50
              </div>
            ) : null}

            <div className="mb-4 flex items-center justify-between border-t pt-4 text-sm font-semibold">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            <div className="flex items-center gap-3">
              <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
                <Button
                  variant="outline"
                  className="h-11 flex-1 rounded-full"
                  onClick={() => setConfirmClearOpen(true)}
                  disabled={cart.length === 0}
                >
                  Clear Cart
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear your cart?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all items currently in your cart. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={handleClearCart}>
                      Clear Cart
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                className="h-11 flex-[1.35] rounded-full"
                onClick={handleProceed}
                disabled={cart.length === 0}
              >
                Proceed to Order →
              </Button>
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

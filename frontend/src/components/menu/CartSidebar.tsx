'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'

export default function CartSidebar() {
  const router = useRouter()
  const cart = useStore((state) => state.cart)
  const updateCartItemQuantity = useStore((state) => state.updateCartItemQuantity)
  const removeFromCart = useStore((state) => state.removeFromCart)
  const cartTotal = useStore((state) => state.cartTotal)
  const cartItemCount = useStore((state) => state.cartItemCount)
  const [mobileOpen, setMobileOpen] = useState(false)

  const subtotal = useMemo(() => cartTotal(), [cartTotal, cart])
  const itemCount = useMemo(() => cartItemCount(), [cartItemCount, cart])

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-black/10 p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Your Cart</h2>
          <p className="text-sm text-slate-500">{itemCount} items</p>
        </div>
        <button className="text-sm font-semibold text-primary md:hidden" onClick={() => setMobileOpen(false)}>
          Close
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {cart.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-slate-500">
            Your cart is empty.
          </p>
        ) : (
          cart.map((item) => (
            <div key={item.item_id} className="rounded-2xl border border-black/10 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-sm text-slate-600">BDT {item.price.toFixed(2)}</p>
                </div>
                <button className="text-xs font-semibold text-red-600" onClick={() => removeFromCart(item.item_id)}>
                  Remove
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1">
                  <button
                    className="h-8 w-8 rounded-full text-lg font-bold text-slate-700 hover:bg-slate-100"
                    onClick={() => updateCartItemQuantity(item.item_id, item.quantity - 1)}
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    className="h-8 w-8 rounded-full text-lg font-bold text-slate-700 hover:bg-slate-100"
                    onClick={() => updateCartItemQuantity(item.item_id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <p className="text-sm font-semibold text-slate-900">BDT {(item.price * item.quantity).toFixed(2)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-black/10 p-5">
        <div className="mb-4 space-y-1">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Subtotal</span>
            <span>BDT {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Items</span>
            <span>{itemCount}</span>
          </div>
        </div>

        <Button
          className="w-full bg-[#1A4D2E] text-white hover:bg-[#163f25]"
          type="button"
          onClick={() => router.push('/order')}
          disabled={cart.length === 0}
        >
          Proceed to Order
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 z-40 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="mb-3 w-full rounded-2xl bg-[#1A4D2E] px-4 py-3 text-left text-sm font-semibold text-white shadow-xl"
        >
          Cart ({itemCount})
        </button>

        <div
          className={`overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl transition-transform duration-300 ${
            mobileOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4rem)]'
          }`}
        >
          {content}
        </div>
      </div>

      <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-[23rem] shrink-0 rounded-3xl border border-black/10 bg-white shadow-xl md:block">
        {content}
      </aside>
    </>
  )
}
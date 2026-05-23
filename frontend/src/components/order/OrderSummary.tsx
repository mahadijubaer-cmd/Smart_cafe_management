'use client'

import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import type { CartItem } from '@/types'

type OrderSummaryProps = {
  cart: CartItem[]
  selectedTableNumber: string | null
  selectedSlot: Date | null
  redeemPoints: boolean
  rewardPointsAvailable: number
  canRedeemPoints?: boolean
  onToggleRedeem: (value: boolean) => void
  onConfirm: () => void
  loading?: boolean
}

export default function OrderSummary({
  cart,
  selectedTableNumber,
  selectedSlot,
  redeemPoints,
  rewardPointsAvailable,
  canRedeemPoints = rewardPointsAvailable >= 100,
  onToggleRedeem,
  onConfirm,
  loading = false,
}: OrderSummaryProps) {
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])
  const discount = redeemPoints && canRedeemPoints ? 10 : 0
  const total = Math.max(subtotal - discount, 0)

  return (
    <div className="space-y-5 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-xl font-bold text-slate-900">Order Summary</h3>
        <p className="mt-1 text-sm text-slate-500">Review your order before confirming.</p>
      </div>

      <div className="space-y-3 text-sm text-slate-700">
        <div className="flex items-center justify-between">
          <span>Items</span>
          <span>{cart.reduce((count, item) => count + item.quantity, 0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>BDT {subtotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Reward discount</span>
          <span>- BDT {discount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between font-semibold text-slate-900">
          <span>Total</span>
          <span>BDT {total.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
        <p><span className="font-semibold">Table:</span> {selectedTableNumber || 'Not selected'}</p>
        <p>
          <span className="font-semibold">Time:</span>{' '}
          {selectedSlot ? selectedSlot.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not selected'}
        </p>
      </div>

      {canRedeemPoints ? (
        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-black/10 p-4">
          <span>
            <span className="block text-sm font-semibold text-slate-900">Redeem 100 points for 10 BDT discount</span>
            <span className="block text-xs text-slate-500">Applied live to the displayed order total</span>
          </span>
          <input
            type="checkbox"
            checked={redeemPoints}
            onChange={(event) => onToggleRedeem(event.target.checked)}
            className="h-5 w-5 accent-[#1A4D2E]"
          />
        </label>
      ) : (
        <div className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-slate-500">
          Collect 100 reward points to unlock checkout redemption.
        </div>
      )}

      <Button className="w-full bg-[#1A4D2E] text-white hover:bg-[#163f25]" type="button" onClick={onConfirm} disabled={loading}>
        {loading ? 'Placing order...' : 'Confirm & Pay'}
      </Button>
    </div>
  )
}
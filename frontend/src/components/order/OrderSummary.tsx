'use client'

import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.item.price * item.quantity, 0), [cart])
  const discount = redeemPoints && canRedeemPoints ? 10 : 0
  const total = Math.max(subtotal - discount, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Summary</CardTitle>
        <CardDescription>Review your order before confirming.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 text-sm text-foreground">
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
          <div className="flex items-center justify-between font-semibold">
            <span>Total</span>
            <span>BDT {total.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl bg-muted p-4 text-sm text-foreground">
          <p><span className="font-semibold">Table:</span> {selectedTableNumber || 'Not selected'}</p>
          <p>
            <span className="font-semibold">Time:</span>{' '}
            {selectedSlot ? selectedSlot.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not selected'}
          </p>
        </div>

        {canRedeemPoints ? (
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4">
            <span>
              <span className="block text-sm font-semibold">Redeem 100 points for 10 BDT discount</span>
              <span className="block text-xs text-muted-foreground">Applied live to the displayed order total</span>
            </span>
            <Checkbox checked={redeemPoints} onCheckedChange={(checked) => onToggleRedeem(checked === true)} />
          </label>
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Collect 100 reward points to unlock checkout redemption.
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Button className="w-full" type="button" onClick={onConfirm} disabled={loading}>
          {loading ? 'Placing order...' : 'Confirm & Pay'}
        </Button>
      </CardFooter>
    </Card>
  )
}

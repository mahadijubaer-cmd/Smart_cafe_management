'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import TableGrid from '@/components/order/TableGrid'
import TimeSlotPicker from '@/components/order/TimeSlotPicker'
import OrderSummary from '@/components/order/OrderSummary'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/useStore'
import type { CartItem, Order, TableMap } from '@/types'

type OrderStep = 1 | 2 | 3 | 4

const stepLabels = ['Cart Review', 'Time Slot', 'Table', 'Confirm & Pay']

function StepIndicator({ step, activeStep }: { step: OrderStep; activeStep: OrderStep }) {
  const isActive = step === activeStep
  const isCompleted = step < activeStep

  return (
    <div className={`flex flex-1 items-center gap-3 rounded-2xl border px-4 py-3 ${isActive ? 'border-[#1A4D2E] bg-[#1A4D2E]/10' : 'border-black/10 bg-white'}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isCompleted || isActive ? 'bg-[#1A4D2E] text-white' : 'bg-slate-200 text-slate-600'}`}>
        {step}
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Step {step}</p>
        <p className="text-sm font-semibold text-slate-900">{stepLabels[step - 1]}</p>
      </div>
    </div>
  )
}

function CartReview({ cart }: { cart: CartItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Cart Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cart.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-slate-500">
            Your cart is empty. Add at least one item from the menu.
          </p>
        ) : (
          cart.map((item) => (
            <div key={item.item_id} className="flex items-center justify-between rounded-2xl border border-black/10 p-4">
              <div>
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="text-sm text-slate-500">Quantity {item.quantity}</p>
              </div>
              <p className="font-semibold text-primary">BDT {(item.price * item.quantity).toFixed(2)}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export default function StudentOrderPage() {
  const router = useRouter()
  const cart = useStore((state) => state.cart)
  const user = useStore((state) => state.user)
  const rewardPoints = user?.reward_points ?? 0

  const [activeStep, setActiveStep] = useState<OrderStep>(1)
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(null)
  const [tables, setTables] = useState<TableMap[]>([])
  const [redeemPoints, setRedeemPoints] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadTables = async () => {
      try {
        const response = await apiClient.get('/tables')
        if (!mounted) return
        setTables(response.data as TableMap[])
      } catch {
        if (mounted) setTables([])
      }
    }

    loadTables()

    return () => {
      mounted = false
    }
  }, [])

  const canGoNext = useMemo(() => {
    if (activeStep === 1) return cart.length > 0
    if (activeStep === 2) return selectedSlot !== null
    if (activeStep === 3) return selectedTableId !== null
    return true
  }, [activeStep, cart.length, selectedSlot, selectedTableId])

  const handleNext = () => {
    if (!canGoNext) return
    setActiveStep((step) => (step < 4 ? ((step + 1) as OrderStep) : 4))
  }

  const handleBack = () => setActiveStep((step) => (step > 1 ? ((step - 1) as OrderStep) : 1))

  const handleConfirm = async () => {
    if (!selectedSlot || selectedTableId === null || cart.length === 0) return

    setSubmitting(true)
    try {
      const response = await apiClient.post('/orders', {
        items: cart.map((item) => ({
          item_id: item.item_id,
          quantity: item.quantity,
        })),
        table_id: selectedTableId,
        time_slot: selectedSlot.toISOString(),
        special_notes: '',
        redeem_points: redeemPoints,
      })

      const order = response.data as Order
      router.push(`/track/${order.order_id}`)
    } finally {
      setSubmitting(false)
    }
  }

  const availableTables = useMemo(() => tables.filter((table) => table.status === 'available'), [tables])

  useEffect(() => {
    if (selectedTableId === null) return
    const selected = tables.find((table) => table.table_id === selectedTableId)
    setSelectedTableNumber(selected?.table_number || null)
  }, [selectedTableId, tables])

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#F5F0E8_0%,#ffffff_30%,#eef5ee_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
              Checkout
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Place your order</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Follow the steps below to review your cart, select a time slot, choose a table, and confirm payment.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {([1, 2, 3, 4] as OrderStep[]).map((step) => (
              <StepIndicator key={step} step={step} activeStep={activeStep} />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-6">
              {activeStep === 1 && <CartReview cart={cart} />}

              {activeStep === 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 2: Time Slot</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimeSlotPicker selectedSlot={selectedSlot} onSelect={setSelectedSlot} />
                  </CardContent>
                </Card>
              )}

              {activeStep === 3 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 3: Table Selection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TableGrid tables={tables} selectedTableId={selectedTableId} onSelect={(tableId) => setSelectedTableId(tableId)} />
                    <p className="mt-4 text-sm text-slate-600">
                      Available tables: {availableTables.length} of {tables.length}
                    </p>
                  </CardContent>
                </Card>
              )}

              {activeStep === 4 && (
                <OrderSummary
                  cart={cart}
                  selectedTableNumber={selectedTableNumber}
                  selectedSlot={selectedSlot}
                  redeemPoints={redeemPoints}
                  rewardPointsAvailable={rewardPoints}
                  canRedeemPoints={rewardPoints >= 100}
                  onToggleRedeem={setRedeemPoints}
                  onConfirm={handleConfirm}
                  loading={submitting}
                />
              )}

              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={handleBack} disabled={activeStep === 1}>
                  Back
                </Button>

                {activeStep < 4 ? (
                  <Button className="bg-[#1A4D2E] text-white hover:bg-[#163f25]" type="button" onClick={handleNext} disabled={!canGoNext}>
                    Next
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="lg:sticky lg:top-6 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-700">
                  <p><span className="font-semibold text-slate-900">Cart items:</span> {cart.length}</p>
                  <p><span className="font-semibold text-slate-900">Time slot:</span> {selectedSlot ? selectedSlot.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not selected'}</p>
                  <p><span className="font-semibold text-slate-900">Table:</span> {selectedTableNumber || 'Not selected'}</p>
                  <p><span className="font-semibold text-slate-900">Reward points:</span> {rewardPoints}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  )
}
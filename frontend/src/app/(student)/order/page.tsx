'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, Clock3, CreditCard, Loader2, MapPin, ShoppingBag, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import ProtectedRoute from '@/components/ProtectedRoute'
import TableGrid from '@/components/order/TableGrid'
import TimeSlotPicker from '@/components/order/TimeSlotPicker'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import type { CartItem, Order, TableMap, User } from '@/types'

type OrderStep = 1 | 2 | 3 | 4

const stepMeta = [
  { label: 'Cart Review', icon: ShoppingBag },
  { label: 'Time Slot', icon: Clock3 },
  { label: 'Table Map', icon: MapPin },
  { label: 'Confirm & Pay', icon: CreditCard },
] as const

function formatBdt(amount: number) {
  return `BDT ${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StepIndicator({ step, activeStep }: { step: OrderStep; activeStep: OrderStep }) {
  const isActive = step === activeStep
  const isCompleted = step < activeStep
  const meta = stepMeta[step - 1]
  const Icon = meta.icon

  return (
    <button
      type="button"
      disabled={step > activeStep + 1}
      className={`flex flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${isActive ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-card'} ${step > activeStep + 1 ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${isCompleted || isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step {step}</p>
        <p className="text-sm font-semibold text-foreground">{meta.label}</p>
      </div>
    </button>
  )
}

function CartReview({ cart, onUpdateQuantity, onRemoveItem }: { cart: CartItem[]; onUpdateQuantity: (itemId: string, quantity: number) => void; onRemoveItem: (itemId: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ShoppingBag className="h-5 w-5 text-primary" />
          Review your cart
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {cart.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-muted p-6 text-center">
            <p className="text-sm font-semibold text-foreground">Your cart is empty.</p>
            <p className="mt-1 text-sm text-muted-foreground">Add menu items first, then return here to continue checkout.</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.item.item_id} className="rounded-[1.75rem] border border-border bg-card p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">{item.item.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBdt(item.item.price)} each</p>
                </div>
                <p className="font-semibold text-primary">{formatBdt(item.item.price * item.quantity)}</p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-2xl border border-border bg-muted p-1">
                  <button
                    type="button"
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-card"
                    onClick={() => onUpdateQuantity(item.item.item_id, item.quantity - 1)}
                  >
                    -
                  </button>
                  <span className="min-w-10 px-3 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                  <button
                    type="button"
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-card"
                    onClick={() => onUpdateQuantity(item.item.item_id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>

                <button type="button" onClick={() => onRemoveItem(item.item.item_id)} className="text-sm font-semibold text-rose-600 transition hover:text-rose-700">
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  cart,
  selectedSlot,
  selectedTable,
  walletBalance,
  rewardPoints,
  subtotal,
  discount,
  total,
  prepMinutes,
}: {
  cart: CartItem[]
  selectedSlot: Date | null
  selectedTable: TableMap | null
  walletBalance: number
  rewardPoints: number
  subtotal: number
  discount: number
  total: number
  prepMinutes: number
}) {
  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Check className="h-5 w-5 text-primary" />
          Checkout snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Items" value={cart.reduce((count, entry) => count + entry.quantity, 0)} />
          <Metric label="Prep time" value={`${prepMinutes} min`} />
          <Metric label="Wallet" value={formatBdt(walletBalance)} />
          <Metric label="Rewards" value={rewardPoints.toLocaleString('en-BD')} />
        </div>

        <div className="space-y-2 rounded-2xl bg-muted p-4">
          <Row label="Subtotal" value={formatBdt(subtotal)} />
          <Row label="Discount" value={`- ${formatBdt(discount)}`} />
          <Row label="Total" value={formatBdt(total)} strong />
        </div>

        <div className="space-y-2 rounded-2xl border border-border p-4">
          <p className="font-semibold text-foreground">Selected details</p>
          <Row label="Time slot" value={selectedSlot ? selectedSlot.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not selected'} />
          <Row label="Table" value={selectedTable ? `${selectedTable.table_number} • ${selectedTable.zone}` : 'Not selected'} />
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'text-base font-bold text-foreground' : ''}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

export default function StudentOrderPage() {
  const router = useRouter()
  const params = useParams<{ tenant_slug?: string }>()
  const tenantSlugFromStore = useStore((state) => state.tenantSlug)
  const slug = params?.tenant_slug ?? tenantSlugFromStore ?? ''
  const cart = useStore((state) => state.cart)
  const user = useStore((state) => state.user)
  const walletBalance = useStore((state) => state.walletBalance)
  const rewardPoints = useStore((state) => state.rewardPoints)
  const clearCart = useStore((state) => state.clearCart)
  const updateQuantity = useStore((state) => state.updateQuantity)
  const removeFromCart = useStore((state) => state.removeFromCart)
  const setUser = useStore((state) => state.setUser)

  const [activeStep, setActiveStep] = useState<OrderStep>(1)
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'simulation'>('wallet')
  const [specialNotes, setSpecialNotes] = useState('')
  const [tables, setTables] = useState<TableMap[]>([])
  const [redeemPoints, setRedeemPoints] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

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

    void loadTables()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const syncProfile = async () => {
      try {
        const response = await apiClient.get('/auth/me')
        setUser(response.data as User)
      } catch {
        return
      }
    }

    void syncProfile()
  }, [setUser])

  const selectedTable = useMemo(() => tables.find((table) => table.table_id === selectedTableId) ?? null, [selectedTableId, tables])
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.item.price * item.quantity, 0), [cart])
  const canRedeemPoints = rewardPoints >= 100
  const discount = redeemPoints && canRedeemPoints ? 10 : 0
  const total = Math.max(subtotal - discount, 0)
  const prepMinutes = useMemo(() => {
    if (cart.length === 0) return 0
    return Math.max(...cart.map((item) => item.item.prep_time_mins)) + 5
  }, [cart])
  const canUseWallet = walletBalance >= total

  useEffect(() => {
    if (paymentMethod === 'wallet' && !canUseWallet) {
      setPaymentMethod('simulation')
    }
  }, [canUseWallet, paymentMethod])

  const canGoNext = useMemo(() => {
    if (activeStep === 1) return cart.length > 0
    if (activeStep === 2) return selectedSlot !== null
    if (activeStep === 3) return selectedTableId !== null
    return true
  }, [activeStep, cart.length, selectedSlot, selectedTableId])

  const handleNext = () => {
    if (!canGoNext) {
      toast.error('Complete the current step before continuing')
      return
    }

    setActiveStep((step) => (step < 4 ? ((step + 1) as OrderStep) : 4))
  }

  const handleBack = () => {
    if (activeStep === 1) {
      setLeaveOpen(true)
      return
    }

    setActiveStep((step) => (step > 1 ? ((step - 1) as OrderStep) : 1))
  }

  const syncProfile = async () => {
    const response = await apiClient.get('/auth/me')
    setUser(response.data as User)
  }

  const handleConfirm = async () => {
    if (!selectedSlot || selectedTableId === null || cart.length === 0) {
      toast.error('Choose items, a time slot, and a table first')
      return
    }

    if (paymentMethod === 'wallet' && !canUseWallet) {
      toast.error('Wallet balance is not enough for this order')
      return
    }

    setSubmitting(true)
    try {
      const orderResponse = await apiClient.post('/orders', {
        items: cart.map((item) => ({
          item_id: item.item.item_id,
          quantity: item.quantity,
        })),
        table_id: selectedTableId,
        time_slot: selectedSlot.toISOString(),
        special_notes: specialNotes.trim() || null,
        redeem_points: redeemPoints,
      })

      const order = orderResponse.data as Order

      await apiClient.post('/payments/pay', {
        order_id: order.order_id,
        method: paymentMethod,
      })

      await syncProfile()
      clearCart()
      toast.success('Order confirmed successfully')
      router.push(`/${slug}/track/${order.order_id}`)
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Unable to place the order')
    } finally {
      setSubmitting(false)
    }
  }

  const availableTables = useMemo(() => tables.filter((table) => table.status === 'available'), [tables])

  return (
    <ProtectedRoute allowedRoles={['student', 'customer']}>
      <main className="min-h-screen bg-background px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                Checkout
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">Place your order</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                Review your cart, pick a time slot, choose a table, and confirm payment in a single guided flow.
              </p>
            </div>

            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition hover:border-primary/30 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              {activeStep === 1 ? 'Leave checkout' : 'Back'}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {([1, 2, 3, 4] as OrderStep[]).map((step) => (
              <StepIndicator key={step} step={step} activeStep={activeStep} />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-6">
            <div key={activeStep} className="motion-safe:animate-fade-up space-y-6">
              {activeStep === 1 ? (
                <CartReview cart={cart} onUpdateQuantity={updateQuantity} onRemoveItem={removeFromCart} />
              ) : null}

              {activeStep === 2 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Clock3 className="h-5 w-5 text-primary" />
                      Select a time slot
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimeSlotPicker selectedSlot={selectedSlot} onSelect={setSelectedSlot} />
                  </CardContent>
                </Card>
              ) : null}

              {activeStep === 3 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <MapPin className="h-5 w-5 text-primary" />
                      Choose your table
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TableGrid tables={tables} selectedTableId={selectedTableId} onSelect={setSelectedTableId} />
                    <p className="mt-4 text-sm text-muted-foreground">
                      Available tables: {availableTables.length} of {tables.length}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              {activeStep === 4 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Confirm and pay
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-muted p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Payment method</p>
                        <div className="mt-4 space-y-3">
                          <label className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${canUseWallet ? 'border-border bg-card' : 'border-border bg-muted opacity-70'}`}>
                            <span>
                              <span className="block font-semibold text-foreground">Wallet payment</span>
                              <span className="block text-xs text-muted-foreground">{canUseWallet ? 'Use your current balance' : 'Top up first or switch to simulation'}</span>
                            </span>
                            <input
                              type="radio"
                              name="payment-method"
                              checked={paymentMethod === 'wallet'}
                              onChange={() => setPaymentMethod('wallet')}
                              disabled={!canUseWallet}
                              className="h-5 w-5 accent-primary"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                            <span>
                              <span className="block font-semibold text-foreground">Simulation payment</span>
                              <span className="block text-xs text-muted-foreground">Demo mode for testing the checkout flow</span>
                            </span>
                            <input
                              type="radio"
                              name="payment-method"
                              checked={paymentMethod === 'simulation'}
                              onChange={() => setPaymentMethod('simulation')}
                              className="h-5 w-5 accent-primary"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-muted p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Reward redemption</p>
                        <div className="mt-4 flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-foreground">Redeem 100 points for BDT 10 off</p>
                            <p className="text-xs text-muted-foreground">{canRedeemPoints ? 'Available for this checkout' : 'Collect at least 100 points to unlock this option'}</p>
                          </div>
                          <Switch checked={redeemPoints} onCheckedChange={setRedeemPoints} disabled={!canRedeemPoints} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor="special-notes">
                        Special notes
                      </label>
                      <textarea
                        id="special-notes"
                        value={specialNotes}
                        onChange={(event) => setSpecialNotes(event.target.value)}
                        rows={4}
                        placeholder="Allergies, extra spice, packaging requests..."
                        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>

                    <div className="rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
                      <p className="font-semibold text-foreground">Final review</p>
                      <div className="mt-3 space-y-2">
                        <Row label="Selected table" value={selectedTable ? `${selectedTable.table_number} • ${selectedTable.zone}` : 'Not selected'} />
                        <Row label="Selected slot" value={selectedSlot ? selectedSlot.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not selected'} />
                        <Row label="Estimated total" value={formatBdt(total)} strong />
                      </div>
                    </div>

                    <Button className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90" type="button" onClick={handleConfirm} disabled={submitting || cart.length === 0 || !selectedSlot || !selectedTableId || (paymentMethod === 'wallet' && !canUseWallet)}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Confirm and pay
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>

              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>

                {activeStep < 4 ? (
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90" type="button" onClick={handleNext} disabled={!canGoNext}>
                    Next
                  </Button>
                ) : null}
              </div>
            </div>

            <SummaryCard
              cart={cart}
              selectedSlot={selectedSlot}
              selectedTable={selectedTable}
              walletBalance={walletBalance}
              rewardPoints={rewardPoints}
              subtotal={subtotal}
              discount={discount}
              total={total}
              prepMinutes={prepMinutes}
            />
          </div>
        </div>

        <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave checkout?</AlertDialogTitle>
              <AlertDialogDescription>
                Your cart will stay saved, but this checkout step will close. You can return later from the menu or cart sidebar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay here</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  router.push(`/${slug}/menu`)
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Leave checkout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </ProtectedRoute>
  )
}
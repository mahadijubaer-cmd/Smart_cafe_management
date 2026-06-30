'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BellRing, Check, CheckCheck, Circle, Clock3, Coffee, Loader2, PackageCheck, PartyPopper, Sparkles, UtensilsCrossed } from 'lucide-react'
import toast from 'react-hot-toast'

import ProtectedRoute from '@/components/ProtectedRoute'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import OrderQrCode from '@/components/order/OrderQrCode'
import ReceiptButton from '@/components/order/ReceiptButton'
import apiClient from '@/lib/api'
import useWebSocket from '@/hooks/useWebSocket'
import { useStore } from '@/store/useStore'
import type { Order } from '@/types'

type TimelineKey = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered'

type TimelineState = Record<TimelineKey, string | null>

type LiveConnectionState = 'connected' | 'reconnecting' | 'disconnected'

const timelineSteps: Array<{
  key: TimelineKey
  label: string
  icon: typeof Clock3
}> = [
  { key: 'pending', label: 'Placed', icon: Clock3 },
  { key: 'confirmed', label: 'Confirmed', icon: Check },
  { key: 'preparing', label: 'Preparing', icon: Coffee },
  { key: 'ready', label: 'Ready', icon: BellRing },
  { key: 'delivered', label: 'Delivered', icon: PackageCheck },
]

const statusRank: Record<Order['status'], number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: -1,
}

const statusCardStyles: Record<Order['status'], string> = {
  pending: 'bg-yellow-50 border-yellow-300 text-yellow-950',
  confirmed: 'bg-blue-50 border-blue-300 text-blue-950',
  preparing: 'bg-orange-50 border-orange-300 text-orange-950',
  ready: 'bg-green-50 border-green-300 text-green-950',
  delivered: 'bg-gray-50 border-gray-300 text-gray-950',
  cancelled: 'bg-slate-50 border-slate-200 text-slate-950',
}

const statusMessages: Record<Order['status'], string> = {
  pending: '🧾 Your order has been placed',
  confirmed: '✅ Your order is confirmed',
  preparing: '🍳 Your food is being prepared',
  ready: '🔔 Your order is ready',
  delivered: '🍽 Your meal has been delivered',
  cancelled: 'This order was cancelled',
}

function formatClock(value: string | null | undefined) {
  if (!value) return null
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not available'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function formatTimeRange(value?: string | null) {
  if (!value) return 'Not available'
  const start = new Date(value)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function estimatePrepMinutes(order: Order | null) {
  if (!order) return 15

  const fromItemPrep = Math.max(0, ...(order.items || []).map((item) => item.menu_item?.prep_time_mins ?? 10))
  if (fromItemPrep > 0) {
    return Math.max(fromItemPrep + 5, 10)
  }

  if (order.estimated_time) {
    const estimated = new Date(order.estimated_time).getTime()
    const created = new Date(order.created_at).getTime()
    const diff = Math.round((estimated - created) / (1000 * 60))
    return Number.isFinite(diff) && diff > 0 ? diff : 15
  }

  return 15
}

function buildInitialTimeline(order: Order): TimelineState {
  return {
    pending: order.created_at,
    confirmed: statusRank[order.status] >= 1 ? order.updated_at : null,
    preparing: statusRank[order.status] >= 2 ? order.updated_at : null,
    ready: statusRank[order.status] >= 3 ? order.estimated_time ?? order.updated_at : null,
    delivered: statusRank[order.status] >= 4 ? order.updated_at : null,
  }
}

function playReadyChime() {
  if (typeof window === 'undefined' || !window.AudioContext) {
    return
  }

  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.value = 440
  gain.gain.value = 0.0001

  oscillator.connect(gain)
  gain.connect(context.destination)

  oscillator.start()
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2)
  oscillator.stop(context.currentTime + 0.22)

  oscillator.onended = () => {
    context.close().catch(() => undefined)
  }
}

function TimelineIcon({
  step,
  status,
  isActive,
  celebrate,
}: {
  step: (typeof timelineSteps)[number]
  status: Order['status']
  isActive: boolean
  celebrate: boolean
}) {
  const Icon = step.icon
  const isComplete = statusRank[status] > statusRank[step.key as Order['status']]
  const isCurrent = step.key === status

  if (isComplete) {
    return (
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
        <Check className="h-5 w-5" />
      </span>
    )
  }

  if (isCurrent) {
    return (
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200 ${isActive ? 'animate-pulse' : ''} ${celebrate ? 'animate-bounce' : ''}`}>
        <Icon className="h-5 w-5" />
      </span>
    )
  }

  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400">
      <Circle className="h-4 w-4 fill-current" />
    </span>
  )
}

function TimelineStepCard({
  step,
  orderStatus,
  timestamp,
  celebrate,
}: {
  step: (typeof timelineSteps)[number]
  orderStatus: Order['status']
  timestamp: string | null
  celebrate: boolean
}) {
  const isCurrent = step.key === orderStatus
  const isComplete = statusRank[orderStatus] > statusRank[step.key as Order['status']]

  return (
    <div className={`rounded-3xl border bg-white p-4 text-center shadow-sm transition ${isCurrent ? 'border-emerald-300 shadow-emerald-100' : 'border-black/10'}`}>
      <div className="flex justify-center">
        <TimelineIcon step={step} status={orderStatus} isActive={isCurrent} celebrate={celebrate && step.key === 'confirmed'} />
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-900">
          <step.icon className="h-4 w-4" />
          <span>{step.label}</span>
        </div>
        <p className={`text-xs uppercase tracking-[0.18em] ${isCurrent ? 'text-emerald-700' : isComplete ? 'text-slate-500' : 'text-slate-400'}`}>
          {timestamp ? formatClock(timestamp) : isComplete ? 'Reached' : 'Upcoming'}
        </p>
      </div>
    </div>
  )
}

export default function StudentTrackOrderPage() {
  const params = useParams<{ orderId: string }>()
  const router = useRouter()
  const user = useStore((state) => state.user)
  const token = useStore((state) => state.token)

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<TimelineState>({ pending: null, confirmed: null, preparing: null, ready: null, delivered: null })
  const [readyBannerVisible, setReadyBannerVisible] = useState(false)
  const [readyFlash, setReadyFlash] = useState(false)
  const [confirmedBounce, setConfirmedBounce] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)
  const initializedOrderIdRef = useRef<string | null>(null)

  const loadOrder = async () => {
    const response = await apiClient.get(`/orders/${params.orderId}`)
    const loadedOrder = response.data as Order
    setOrder(loadedOrder)
    setLoadError(null)
  }

  useEffect(() => {
    let mounted = true

    const run = async () => {
      try {
        await loadOrder()
      } catch (error: any) {
        if (!mounted) return
        setLoadError(error?.response?.status === 404 ? 'Order not found.' : 'Unable to load the order right now.')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      mounted = false
    }
  }, [params.orderId])

  useEffect(() => {
    if (!order || initializedOrderIdRef.current === order.order_id) {
      return
    }

    initializedOrderIdRef.current = order.order_id
    setTimeline(buildInitialTimeline(order))
    setReadyBannerVisible(order.status === 'ready')
    setReadyFlash(order.status === 'ready')
  }, [order])

  const handleMessage = useMemo(
    () => (event: Record<string, unknown>) => {
      const eventType = String(event.type || '')
      const eventOrderId = String(event.order_id || '')

      if (eventOrderId !== params.orderId) {
        return
      }

      const now = new Date().toISOString()
      const prepMinutes = estimatePrepMinutes(order)

      if (eventType === 'ORDER_CONFIRMED') {
        setOrder((current) => (current ? { ...current, status: 'confirmed' } : current))
        setTimeline((current) => ({ ...current, confirmed: now }))
        setConfirmedBounce(true)
        window.setTimeout(() => setConfirmedBounce(false), 700)
        toast.success(`Order confirmed! Ready in ~${prepMinutes} minutes`)
        return
      }

      if (eventType === 'ORDER_PREPARING') {
        setOrder((current) => (current ? { ...current, status: 'preparing' } : current))
        setTimeline((current) => ({ ...current, preparing: now }))
        return
      }

      if (eventType === 'ORDER_READY') {
        setOrder((current) => (current ? { ...current, status: 'ready' } : current))
        setTimeline((current) => ({ ...current, ready: now }))
        setReadyBannerVisible(true)
        setReadyFlash(true)
        window.setTimeout(() => setReadyFlash(false), 1100)
        playReadyChime()
        return
      }

      if (eventType === 'ORDER_DELIVERED') {
        setOrder((current) => (current ? { ...current, status: 'delivered' } : current))
        setTimeline((current) => ({ ...current, delivered: now }))
      }
    },
    [order, params.orderId],
  )

  const { isConnected } = useWebSocket(user?.user_id || '', token || '', handleMessage)
  const connectionState: LiveConnectionState = isConnected ? 'connected' : user?.user_id && token ? 'reconnecting' : 'disconnected'
  const estimatedPrepMinutes = estimatePrepMinutes(order)
  const status = order?.status || 'pending'

  const handleMarkDone = async () => {
    if (!order) return

    setCompleteLoading(true)
    try {
      await apiClient.patch(`/orders/${order.order_id}/complete`)
      toast.success('Thanks! Table will be cleaned shortly. 🧹')
      router.push('/menu')
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Unable to mark the meal as done')
    } finally {
      setCompleteLoading(false)
    }
  }

  const itemsSubtotal = (order?.items || []).reduce((sum, item) => sum + Number(item.subtotal ?? Number(item.unit_price) * item.quantity), 0)

  return (
    <ProtectedRoute allowedRoles={['student']}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ffffff_32%,#eef5ee_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
                Track order
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Order progress</h1>
              <p className="mt-2 text-sm text-slate-600">Live updates, kitchen progress, and pickup details for order #{params.orderId.slice(0, 8).toUpperCase()}.</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    connectionState === 'connected' ? 'bg-emerald-500' : connectionState === 'reconnecting' ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                />
                <span>{connectionState === 'connected' ? 'Connected' : connectionState === 'reconnecting' ? 'Reconnecting' : 'Disconnected'}</span>
              </div>

              <Button type="button" variant="outline" onClick={() => router.push('/menu')}>
                Back to Menu
              </Button>
            </div>
          </div>

          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-[#1A4D2E]" />
                Loading order details...
              </CardContent>
            </Card>
          ) : loadError ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">{loadError}</CardContent>
            </Card>
          ) : order ? (
            <div className="space-y-6">
              <Card className={`border-2 shadow-lg transition ${statusCardStyles[status]} ${readyFlash ? 'ring-4 ring-emerald-300/70 shadow-emerald-200/70' : ''}`}>
                <CardContent className="p-6 md:p-8">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 shadow-sm ${confirmedBounce ? 'animate-bounce' : ''}`}>
                          {status === 'ready' ? <Sparkles className="h-7 w-7 text-emerald-600" /> : status === 'confirmed' ? <CheckCheck className="h-7 w-7 text-blue-600" /> : status === 'preparing' ? <UtensilsCrossed className="h-7 w-7 text-orange-600" /> : status === 'delivered' ? <PackageCheck className="h-7 w-7 text-slate-600" /> : <Clock3 className="h-7 w-7 text-yellow-600" />}
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Current status</p>
                          <h2 className="mt-1 text-3xl font-black md:text-4xl">{statusMessages[status]}</h2>
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                        <InfoChip label="Order ID" value={order.order_id.slice(0, 8).toUpperCase()} />
                        <InfoChip label="Table" value={order.table_number || order.table_id ? String(order.table_number || order.table_id) : 'Takeaway'} />
                        <InfoChip label="Time slot" value={formatTimeRange(order.time_slot)} />
                        <InfoChip label="ETA" value={`~${estimatedPrepMinutes} min`} />
                      </div>
                    </div>

                    <div className="min-w-[16rem] rounded-3xl border border-white/50 bg-white/70 p-4 shadow-sm backdrop-blur">
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <span>Live signal</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] tracking-[0.2em] ${connectionState === 'connected' ? 'bg-emerald-100 text-emerald-700' : connectionState === 'reconnecting' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {connectionState}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3 text-sm text-slate-700">
                        <Row label="Placed" value={formatDateTime(order.created_at)} />
                        <Row label="Last update" value={formatDateTime(order.updated_at)} />
                        <Row label="Payment" value={order.payment_status} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {readyBannerVisible && order.status === 'ready' ? (
                <Alert variant="success" className="border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm">
                  <AlertTitle className="flex items-center gap-2 text-base">
                    <BellRing className="h-4 w-4" />
                    Your order is ready!
                  </AlertTitle>
                  <AlertDescription>Please collect it from the counter.</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <PartyPopper className="h-5 w-5 text-[#1A4D2E]" />
                      Progress timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {timelineSteps.map((step) => (
                        <TimelineStepCard key={step.key} step={step} orderStatus={status} timestamp={timeline[step.key]} celebrate={confirmedBounce} />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <CheckCheck className="h-5 w-5 text-[#1A4D2E]" />
                      Order details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 rounded-2xl border border-black/10 bg-slate-50 p-4 text-sm text-slate-700">
                      <Row label="Table" value={order.table_number || (order.table_id ? String(order.table_id) : 'Takeaway')} />
                      <Row label="Time slot" value={formatTimeRange(order.time_slot)} />
                      <Row label="Ordered at" value={formatDateTime(order.created_at)} />
                    </div>

                    <div className="space-y-3">
                      {(order.items || []).map((item) => {
                        const subtotal = Number(item.subtotal ?? Number(item.unit_price) * item.quantity)

                        return (
                          <div key={item.order_item_id} className="rounded-2xl border border-black/10 p-4 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{item.menu_item?.name || item.item_id}</p>
                                <p className="text-xs text-slate-500">Qty {item.quantity} × {formatCurrency(Number(item.unit_price))}</p>
                              </div>
                              <span className="font-semibold text-slate-900">{formatCurrency(subtotal)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="rounded-2xl bg-[#1A4D2E]/5 p-4 text-sm text-slate-700">
                      <Row label="Subtotal" value={formatCurrency(itemsSubtotal)} />
                      <Row label="Discount" value={`- ${formatCurrency(Number(order.discount_amount))}`} />
                      <Row label="Total" value={formatCurrency(Number(order.total_amount))} strong />
                    </div>

                    <p className="text-xs text-slate-500">Payment status: <span className="font-semibold text-slate-900">{order.payment_status}</span></p>

                    {status === 'confirmed' ? (
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Order QR Code</p>
                        <OrderQrCode orderId={order.order_id} />
                      </div>
                    ) : null}

                    {status === 'delivered' ? (
                      <ReceiptButton orderId={order.order_id} className="w-full" />
                    ) : null}

                    {status === 'delivered' ? (
                      <Button className="w-full bg-[#1A4D2E] text-white hover:bg-[#163f25]" type="button" onClick={handleMarkDone} disabled={completeLoading}>
                        {completeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Mark Meal Done ✓
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">Order not found.</CardContent>
            </Card>
          )}
        </div>
      </main>
    </ProtectedRoute>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'font-bold text-slate-900' : ''}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import OrderStatusTimeline from '@/components/order/OrderStatusTimeline'
import useWebSocket from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStore } from '@/store/useStore'
import type { Order } from '@/types'

function formatDateTime(value?: string | null) {
  if (!value) return 'Not available'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function StudentTrackOrderPage() {
  const params = useParams<{ orderId: string }>()
  const router = useRouter()
  const user = useStore((state) => state.user)
  const token = useStore((state) => state.token)

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadOrder = async () => {
      try {
        const response = await apiClient.get(`/orders/${params.orderId}`)
        if (!mounted) return
        setOrder(response.data as Order)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadOrder()

    return () => {
      mounted = false
    }
  }, [params.orderId])

  const handleMessage = useMemo(
    () => (event: Record<string, unknown>) => {
      const eventType = String(event.type || '')
      const eventOrderId = String(event.order_id || '')

      if (eventOrderId !== params.orderId) {
        return
      }

      if (['ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_PREPARING'].includes(eventType)) {
        setOrder((current) => (current ? { ...current, status: eventType === 'ORDER_CONFIRMED' ? 'confirmed' : eventType === 'ORDER_READY' ? 'ready' : 'preparing' } : current))
      }
    },
    [params.orderId],
  )

  const { isConnected } = useWebSocket(user?.user_id || '', token || '', handleMessage)

  const estimatedTime = order?.estimated_time ?? null

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#F5F0E8_0%,#ffffff_32%,#eef5ee_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
                Track order
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Order progress</h1>
              <p className="mt-2 text-sm text-slate-600">{isConnected ? 'Live updates connected' : 'Connecting live updates...'}</p>
            </div>

            <Button type="button" variant="outline" onClick={() => router.push('/menu')}>
              Back to Menu
            </Button>
          </div>

          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">Loading order details...</CardContent>
            </Card>
          ) : order ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Order #{order.order_id.slice(0, 8)}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    <p><span className="font-semibold text-slate-900">Status:</span> {order.status}</p>
                    <p><span className="font-semibold text-slate-900">Placed:</span> {formatDateTime(order.created_at)}</p>
                    <p><span className="font-semibold text-slate-900">Time slot:</span> {formatDateTime(order.time_slot)}</p>
                    <p><span className="font-semibold text-slate-900">Estimated time:</span> {estimatedTime ? formatDateTime(estimatedTime) : 'Not available'}</p>
                    <p><span className="font-semibold text-slate-900">Table:</span> {order.table_number || order.table_id || 'Not assigned'}</p>
                    <p><span className="font-semibold text-slate-900">Total:</span> BDT {Number(order.total_amount).toFixed(2)}</p>
                  </CardContent>
                </Card>

                <OrderStatusTimeline status={order.status} />
              </div>

              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(order.items || []).map((item) => (
                    <div key={item.order_item_id} className="rounded-2xl border border-black/10 p-4 text-sm">
                      <p className="font-semibold text-slate-900">{item.menu_item?.name || item.item_id}</p>
                      <p className="text-slate-600">Qty {item.quantity}</p>
                      <p className="text-slate-600">BDT {Number(item.unit_price).toFixed(2)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
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
'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronUp } from 'lucide-react'
import apiClient from '@/lib/api'
import DeliveryCard, { type ActiveOrder } from '@/components/food-court/DeliveryCard'
import { useStore } from '@/store/useStore'

interface EnrichedOrder extends ActiveOrder {
  vendor_name?: string
}

export default function FoodCourtDeliverPage() {
  const notifications = useStore((s) => s.notifications)
  const [orders, setOrders] = useState<EnrichedOrder[]>([])
  const [vendors, setVendors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [inProgressOpen, setInProgressOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [ordersRes, vendorsRes] = await Promise.allSettled([
        apiClient.get('/food-court/orders/active'),
        apiClient.get('/food-court/vendors'),
      ])

      const vendorMap: Record<string, string> = {}
      if (vendorsRes.status === 'fulfilled') {
        for (const v of vendorsRes.value.data) {
          vendorMap[v.tenant_id] = v.name
        }
        setVendors(vendorMap)
      }

      if (ordersRes.status === 'fulfilled') {
        const enriched: EnrichedOrder[] = ordersRes.value.data.map(
          (o: ActiveOrder) => ({
            ...o,
            vendor_name: vendorMap[o.vendor_tenant_id] ?? 'Unknown vendor',
          })
        )
        setOrders(enriched)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // React to websocket ORDER_READY
  useEffect(() => {
    const last = notifications[0]
    if (last && ['ORDER_READY', 'ORDER_PLACED', 'ORDER_DELIVERED'].includes(last.type)) {
      load()
    }
  }, [notifications, load])

  // Poll every 15s
  useEffect(() => {
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [load])

  const handleDeliver = async (orderId: string) => {
    await apiClient.patch(`/food-court/orders/${orderId}/deliver`)
    setOrders((prev) => prev.filter((o) => o.order_id !== orderId))
    toast.success('Order marked as delivered.')
  }

  const ready = orders.filter((o) => o.status === 'ready')
  const inProgress = orders.filter((o) => o.status !== 'ready')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-black text-slate-900">Delivery Queue</h1>
        {ready.length > 0 && (
          <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-bold text-white">
            {ready.length} ready
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {/* Ready orders */}
          {ready.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
              <p className="text-sm text-slate-400">No orders ready for delivery right now.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ready.map((order) => (
                <DeliveryCard
                  key={order.order_id}
                  order={order}
                  onDeliver={() => handleDeliver(order.order_id)}
                />
              ))}
            </div>
          )}

          {/* In-progress orders (collapsible) */}
          {inProgress.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setInProgressOpen((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-slate-700"
              >
                <span>In Progress ({inProgress.length})</span>
                {inProgressOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>
              {inProgressOpen && (
                <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inProgress.map((order) => (
                    <DeliveryCard
                      key={order.order_id}
                      order={order}
                      onDeliver={() => handleDeliver(order.order_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

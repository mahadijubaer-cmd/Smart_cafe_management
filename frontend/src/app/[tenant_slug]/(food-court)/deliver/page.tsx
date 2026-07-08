'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, PackageCheck } from 'lucide-react'
import apiClient from '@/lib/api'
import DeliveryCard, { type ActiveOrder } from '@/components/food-court/DeliveryCard'
import { useStore } from '@/store/useStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

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
        <h1 className="text-2xl font-black text-foreground">Delivery Queue</h1>
        {ready.length > 0 && <Badge>{ready.length} ready</Badge>}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Ready orders */}
          {ready.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageCheck />
                </EmptyMedia>
                <EmptyTitle>Nothing to deliver</EmptyTitle>
                <EmptyDescription>No orders ready for delivery right now.</EmptyDescription>
              </EmptyHeader>
            </Empty>
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
            <div className="rounded-2xl border bg-card shadow-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInProgressOpen((v) => !v)}
                className="w-full justify-between rounded-2xl px-5 py-3 text-sm font-semibold text-card-foreground hover:bg-transparent"
              >
                <span>In Progress ({inProgress.length})</span>
                {inProgressOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </Button>
              {inProgressOpen && (
                <div className="grid gap-4 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
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

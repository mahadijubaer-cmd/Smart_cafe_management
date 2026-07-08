'use client'

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import apiClient from '@/lib/api'
import VendorTile, { type VendorSummary } from '@/components/food-court/VendorTile'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface TableOccupancy {
  available?: number
  occupied?: number
  reserved?: number
  cleaning?: number
}

interface VendorThroughput {
  vendor_id: string
  vendor_name: string
  total_orders: number
}

interface ActiveOrder {
  vendor_tenant_id: string
  status: string
}

const OCCUPANCY_CARDS: Array<{ key: keyof TableOccupancy; label: string; className: string }> = [
  { key: 'available', label: 'Available', className: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' },
  { key: 'occupied', label: 'Occupied', className: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400' },
  { key: 'reserved', label: 'Reserved', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  { key: 'cleaning', label: 'Cleaning', className: 'bg-muted text-muted-foreground' },
]

export default function FoodCourtDashboard() {
  const notifications = useStore((s) => s.notifications)

  const [vendors, setVendors] = useState<VendorSummary[]>([])
  const [throughput, setThroughput] = useState<VendorThroughput[]>([])
  const [occupancy, setOccupancy] = useState<TableOccupancy>({})
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [vendorsRes, analyticsRes, ordersRes] = await Promise.allSettled([
        apiClient.get('/food-court/vendors'),
        apiClient.get('/food-court/analytics'),
        apiClient.get('/food-court/orders/active'),
      ])

      if (vendorsRes.status === 'fulfilled') setVendors(vendorsRes.value.data)
      if (analyticsRes.status === 'fulfilled') {
        const data = analyticsRes.value.data
        setOccupancy(data.table_occupancy ?? {})
        setThroughput(data.vendor_throughput ?? [])
      }
      if (ordersRes.status === 'fulfilled') setActiveOrders(ordersRes.value.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Refresh on ORDER_PLACED / ORDER_DELIVERED websocket events
  useEffect(() => {
    const last = notifications[0]
    if (last && (last.type === 'ORDER_PLACED' || last.type === 'ORDER_DELIVERED')) {
      load()
    }
  }, [notifications, load])

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  // Orders per vendor (active)
  const activeByVendor = (vendorId: string) =>
    activeOrders.filter((o) => o.vendor_tenant_id === vendorId).length

  const totalTables =
    (occupancy.available ?? 0) +
    (occupancy.occupied ?? 0) +
    (occupancy.reserved ?? 0) +
    (occupancy.cleaning ?? 0)

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-foreground">Food Court Dashboard</h1>

      {/* Table occupancy summary */}
      {totalTables > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Floor Occupancy
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {OCCUPANCY_CARDS.map(({ key, label, className }) => (
              <Card key={key} className={className}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="mt-1 text-3xl font-black">{occupancy[key] ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Vendor tiles */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Vendors ({vendors.length})
        </h2>
        {vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vendors configured yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <VendorTile
                key={v.tenant_id}
                vendor={v}
                orderCount={activeByVendor(v.tenant_id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Active orders per vendor bar */}
      {throughput.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            All-Time Order Throughput
          </h2>
          <div className="space-y-2">
            {throughput.map((v) => {
              const maxOrders = Math.max(...throughput.map((t) => t.total_orders), 1)
              const pct = Math.round((v.total_orders / maxOrders) * 100)
              return (
                <div key={v.vendor_id} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-muted-foreground">{v.vendor_name}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-5 rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold text-foreground">
                    {v.total_orders}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

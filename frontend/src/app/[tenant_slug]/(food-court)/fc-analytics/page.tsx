'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import apiClient from '@/lib/api'
import PageHeader from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

interface Settlement {
  vendor_id: string
  vendor_name: string
  total_revenue: string
  delivered_order_count: number
}

const OCCUPANCY_COLORS: Record<string, string> = {
  available: '#22c55e',
  occupied: '#f43f5e',
  reserved: '#f59e0b',
  cleaning: '#94a3b8',
}

export default function FoodCourtAnalyticsPage() {
  const [occupancy, setOccupancy] = useState<TableOccupancy>({})
  const [throughput, setThroughput] = useState<VendorThroughput[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [analyticsRes, settlementsRes] = await Promise.allSettled([
          apiClient.get('/food-court/analytics'),
          apiClient.get('/food-court/settlements'),
        ])
        if (analyticsRes.status === 'fulfilled') {
          setOccupancy(analyticsRes.value.data.table_occupancy ?? {})
          setThroughput(analyticsRes.value.data.vendor_throughput ?? [])
        }
        if (settlementsRes.status === 'fulfilled') {
          setSettlements(settlementsRes.value.data)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Build pie data
  const pieData = Object.entries(occupancy)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([key, value]) => ({ name: key, value: value ?? 0 }))

  const totalRevenue = settlements.reduce((s, v) => s + Number(v.total_revenue), 0)
  const maxOrders = Math.max(...throughput.map((v) => v.total_orders), 1)

  return (
    <div className="motion-safe:animate-fade-up space-y-8">
      <PageHeader title="Analytics" />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Row 1: Occupancy donut */}
          {pieData.length > 0 && (
            <section>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Table Occupancy
              </h2>
              <Card>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={OCCUPANCY_COLORS[entry.name] ?? '#cbd5e1'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, name) => [`${v} tables`, String(name)]}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Row 2: Vendor throughput */}
          {throughput.length > 0 && (
            <section>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Vendor Order Counts (All Time)
              </h2>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  {throughput.map((v) => {
                    const pct = Math.round((v.total_orders / maxOrders) * 100)
                    return (
                      <div key={v.vendor_id} className="flex items-center gap-3">
                        <span className="w-36 shrink-0 truncate text-sm font-medium text-card-foreground">
                          {v.vendor_name}
                        </span>
                        <div className="flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-5 rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-sm font-bold text-card-foreground">
                          {v.total_orders}
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Row 3: Settlements table */}
          <section>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Settlements (Delivered Orders)
            </h2>
            {settlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No settled orders yet.</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue (৳)</TableHead>
                      <TableHead className="text-right">Avg Order (৳)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlements.map((s) => (
                      <TableRow key={s.vendor_id}>
                        <TableCell className="font-medium text-card-foreground">
                          {s.vendor_name}
                        </TableCell>
                        <TableCell className="text-right">{s.delivered_order_count}</TableCell>
                        <TableCell className="text-right font-semibold text-card-foreground">
                          {Number(s.total_revenue).toFixed(0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.delivered_order_count > 0
                            ? (Number(s.total_revenue) / s.delivered_order_count).toFixed(0)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold text-card-foreground">Total</TableCell>
                      <TableCell className="text-right font-bold">
                        {settlements.reduce((s, v) => s + v.delivered_order_count, 0)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-card-foreground">
                        {totalRevenue.toFixed(0)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  )
}

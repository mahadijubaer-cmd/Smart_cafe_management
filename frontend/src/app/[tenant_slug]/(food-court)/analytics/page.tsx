'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import apiClient from '@/lib/api'

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
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-slate-900">Analytics</h1>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {/* Row 1: Occupancy donut */}
          {pieData.length > 0 && (
            <section>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                Table Occupancy
              </h2>
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
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
              </div>
            </section>
          )}

          {/* Row 2: Vendor throughput */}
          {throughput.length > 0 && (
            <section>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                Vendor Order Counts (All Time)
              </h2>
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-3">
                {throughput.map((v) => {
                  const pct = Math.round((v.total_orders / maxOrders) * 100)
                  return (
                    <div key={v.vendor_id} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm text-slate-700 font-medium">
                        {v.vendor_name}
                      </span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-5 rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-sm font-bold text-slate-800">
                        {v.total_orders}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Row 3: Settlements table */}
          <section>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">
              Settlements (Delivered Orders)
            </h2>
            {settlements.length === 0 ? (
              <p className="text-sm text-slate-400">No settled orders yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Vendor</th>
                      <th className="px-5 py-3 text-right">Orders</th>
                      <th className="px-5 py-3 text-right">Revenue (৳)</th>
                      <th className="px-5 py-3 text-right">Avg Order (৳)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s, i) => (
                      <tr
                        key={s.vendor_id}
                        className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                      >
                        <td className="px-5 py-3 font-medium text-slate-900">{s.vendor_name}</td>
                        <td className="px-5 py-3 text-right text-slate-700">
                          {s.delivered_order_count}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900">
                          {Number(s.total_revenue).toFixed(0)}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {s.delivered_order_count > 0
                            ? (Number(s.total_revenue) / s.delivered_order_count).toFixed(0)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                      <td className="px-5 py-3 text-slate-900">Total</td>
                      <td className="px-5 py-3 text-right text-slate-700">
                        {settlements.reduce((s, v) => s + v.delivered_order_count, 0)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-900">
                        {totalRevenue.toFixed(0)}
                      </td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

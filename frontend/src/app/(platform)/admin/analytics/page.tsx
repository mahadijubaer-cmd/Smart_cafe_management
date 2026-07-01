'use client'

import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import apiClient from '@/lib/api'

interface OutletStat {
  tenant_id: string
  tenant_name: string
  tenant_type: string
  revenue: number
  order_count: number
  is_active: boolean
  subscription_tier?: string
}

export default function PlatformAnalyticsPage() {
  const [stats, setStats] = useState<OutletStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/analytics/outlets')
        setStats(res.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalTenants = stats.length
  const activeTenants = stats.filter((s) => s.is_active).length
  const totalOrders = stats.reduce((s, t) => s + (t.order_count ?? 0), 0)
  const totalRevenue = stats.reduce((s, t) => s + (Number(t.revenue) ?? 0), 0)

  const chartData = [...stats]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((s) => ({ name: s.tenant_name, revenue: Number(s.revenue) }))

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-6 w-48 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-black text-slate-900">Platform Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Tenants', value: totalTenants },
          { label: 'Active Tenants', value: activeTenants },
          { label: 'Total Orders', value: totalOrders.toLocaleString() },
          { label: 'Total Revenue (৳)', value: totalRevenue.toFixed(0) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Revenue bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-700">
            Revenue by Tenant (Top {chartData.length})
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip formatter={(v: number) => [`৳${v.toFixed(0)}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="var(--color-primary, #1A4D2E)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tenant table */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">All Tenants</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3 text-right">Orders</th>
              <th className="px-5 py-3 text-right">Revenue (৳)</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.tenant_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="px-5 py-3 font-medium text-slate-900">{s.tenant_name}</td>
                <td className="px-5 py-3 capitalize text-slate-600">
                  {s.tenant_type.replace(/_/g, ' ')}
                </td>
                <td className="px-5 py-3 text-right text-slate-700">{s.order_count ?? 0}</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">
                  {Number(s.revenue ?? 0).toFixed(0)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={[
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
                    ].join(' ')}
                  >
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

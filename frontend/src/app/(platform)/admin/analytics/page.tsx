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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface OutletStat {
  tenant_id: string
  tenant_name: string
  tenant_type: string
  revenue: number
  order_count: number
  is_active: boolean
  subscription_tier?: string
}

// ✅ [Phase 24 — RFC-009] genuinely cross-tenant-type overview, distinct from the
// franchise-outlet-only OutletStat table below (which stays for super_admin-style comparisons).
interface PlatformOverview {
  tenants_by_type: Record<string, number>
  tenants_by_status: { active: number; suspended: number }
  signups_last_30_days: { date: string; count: number }[]
  orders_last_30_days: { total_orders: number; total_revenue: string }
}

export default function PlatformAnalyticsPage() {
  const [stats, setStats] = useState<OutletStat[]>([])
  const [overview, setOverview] = useState<PlatformOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      // Independent requests: /analytics/outlets is super_admin-only (franchise-outlet
      // comparison) and 403s for platform_admin — that's a pre-existing role mismatch on this
      // page, unrelated to the new platform-wide overview, so one failing must not block the other.
      const [outletResult, overviewResult] = await Promise.allSettled([
        apiClient.get('/analytics/outlets'),
        apiClient.get('/platform/analytics/overview'),
      ])
      if (outletResult.status === 'fulfilled') setStats(outletResult.value.data)
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data)
      setLoading(false)
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
      <div className="flex flex-col p-6 gap-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col p-6 gap-8">
      <h1 className="text-2xl font-black text-slate-900">Platform Analytics</h1>

      {/* ✅ [Phase 24 — RFC-009] Genuine cross-tenant-type overview — every TenantType, not just
          franchise outlets. Renders independently of the (super_admin-only) outlet table below. */}
      {overview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-700">Platform Overview (all tenant types)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">Active Tenants</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{overview.tenants_by_status.active}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">Suspended Tenants</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{overview.tenants_by_status.suspended}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">Orders (30d, all tenants)</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{overview.orders_last_30_days.total_orders.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">Revenue ৳ (30d, all tenants)</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{Number(overview.orders_last_30_days.total_revenue).toFixed(0)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(overview.tenants_by_type).map(([type, count]) => (
                <Badge key={type} variant="secondary" className="capitalize font-medium">
                  {type.replace(/_/g, ' ')}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Summary cards (franchise-outlet comparison, super_admin-only endpoint) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Outlets Compared', value: totalTenants },
          { label: 'Active Outlets', value: activeTenants },
          { label: 'Outlet Orders', value: totalOrders.toLocaleString() },
          { label: 'Outlet Revenue (৳)', value: totalRevenue.toFixed(0) },
        ].map(({ label, value }) => (
          <Card key={label} className="p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
          </Card>
        ))}
      </div>

      {/* Revenue bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-700">
              Revenue by Tenant (Top {chartData.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* Tenant table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-slate-700">All Tenants</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Revenue (৳)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((s) => (
              <TableRow key={s.tenant_id}>
                <TableCell className="font-medium text-slate-900">{s.tenant_name}</TableCell>
                <TableCell className="capitalize text-slate-600">
                  {s.tenant_type.replace(/_/g, ' ')}
                </TableCell>
                <TableCell className="text-right text-slate-700">{s.order_count ?? 0}</TableCell>
                <TableCell className="text-right font-semibold text-slate-900">
                  {Number(s.revenue ?? 0).toFixed(0)}
                </TableCell>
                <TableCell>
                  <Badge variant={s.is_active ? 'default' : 'destructive'}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { BarChart3, ShoppingBag, TrendingUp, Users } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import HourlyHeatmap from '@/components/admin/HourlyHeatmap'
import OutletComparisonTable from '@/components/admin/OutletComparisonTable'
import TopItemsChart from '@/components/admin/TopItemsChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month'

interface SummaryData {
  total_orders: number
  total_revenue: number
  avg_order_value: number
  total_customers_served: number
  pending_orders: number
  active_tables: number
  cleaners_on_duty: number
}

interface HourlyData {
  hour: number
  order_count: number
}

interface TopItem {
  item_name: string
  total_quantity: number
  total_revenue: number
}

interface RevenuePoint {
  date: string
  revenue: number
  order_count: number
}

interface OutletRow {
  outlet_tenant_id: string
  outlet_name: string
  order_count: number
  revenue: number
  unique_customers: number
}

interface InventoryValue {
  tenant_id: string
  total_inventory_value: number
  item_count: number
  outlets: null | Array<{
    outlet_tenant_id: string
    outlet_name: string
    total_inventory_value: number
    item_count: number
  }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 }
const PERIOD_LABELS: Record<Period, string> = { today: 'Today', week: 'This Week', month: 'This Month' }

function formatCurrency(v: number) {
  return `৳${v.toLocaleString('en-BD', { maximumFractionDigits: 0 })}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{value}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div>
      </CardContent>
    </Card>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const userRole = useStore((s) => s.user?.role)
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'platform_admin'

  const [period, setPeriod] = useState<Period>('week')
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [hourly, setHourly] = useState<HourlyData[]>([])
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [revenue, setRevenue] = useState<RevenuePoint[]>([])
  const [outlets, setOutlets] = useState<OutletRow[]>([])
  const [inventoryValue, setInventoryValue] = useState<InventoryValue | null>(null)

  const fetchAll = async (p: Period) => {
    setLoading(true)
    const days = PERIOD_DAYS[p]
    try {
      const requests: Promise<unknown>[] = [
        apiClient.get(`/analytics/summary?period=${p}`),
        apiClient.get('/analytics/orders-by-hour'),
        apiClient.get(`/analytics/top-items?days=${days}`),
        apiClient.get(`/analytics/revenue?days=${days}`),
        apiClient.get('/analytics/inventory-value'),
      ]
      if (isSuperAdmin) {
        requests.push(apiClient.get(`/analytics/outlets?period=${p}`))
      }

      const results = await Promise.allSettled(requests)

      const get = <T,>(i: number): T | null => {
        const r = results[i]
        return r.status === 'fulfilled' ? (r.value as { data: T }).data : null
      }

      setSummary(get<SummaryData>(0))
      setHourly(get<HourlyData[]>(1) ?? [])
      setTopItems(get<TopItem[]>(2) ?? [])
      setRevenue(
        (get<RevenuePoint[]>(3) ?? []).map((r) => ({
          ...r,
          revenue: Number(r.revenue),
          order_count: Number(r.order_count),
        }))
      )
      setInventoryValue(get<InventoryValue>(4))
      if (isSuperAdmin) setOutlets(get<OutletRow[]>(5) ?? [])
    } catch {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll(period)
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 p-6">
      {/* Header + period selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Analytics</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Performance overview · {PERIOD_LABELS[period]}
          </p>
        </div>
        <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}>
          <TabsList>
            {(['today', 'week', 'month'] as Period[]).map((p) => (
              <TabsTrigger key={p} value={p}>
                {PERIOD_LABELS[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Row 1: Summary cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<ShoppingBag className="h-5 w-5" />}
            label="Total Orders"
            value={(summary?.total_orders ?? 0).toLocaleString()}
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Total Revenue"
            value={formatCurrency(summary?.total_revenue ?? 0)}
          />
          <SummaryCard
            icon={<BarChart3 className="h-5 w-5" />}
            label="Avg Order Value"
            value={formatCurrency(summary?.avg_order_value ?? 0)}
          />
          <SummaryCard
            icon={<Users className="h-5 w-5" />}
            label="Customers Served"
            value={(summary?.total_customers_served ?? 0).toLocaleString()}
          />
        </div>
      )}

      {/* Row 2: Hourly heatmap */}
      <SectionCard title="Orders by Hour (Last 7 Days)">
        {loading ? (
          <Skeleton className="h-24" />
        ) : (
          <HourlyHeatmap data={hourly} />
        )}
      </SectionCard>

      {/* Row 3 + 4: Top items + Revenue side by side on large screens */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Top Items">
          {loading ? (
            <Skeleton className="h-64" />
          ) : (
            <TopItemsChart data={topItems} />
          )}
        </SectionCard>

        <SectionCard title="Revenue Trend">
          {loading ? (
            <Skeleton className="h-64" />
          ) : revenue.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              No revenue data for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenue} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary, #1A4D2E)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-primary, #1A4D2E)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-lg text-xs">
                        <p className="font-semibold text-slate-700">{label}</p>
                        <p className="text-primary">{formatCurrency(Number(payload[0]?.value))}</p>
                        <p className="text-slate-500">{payload[1]?.value} orders</p>
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-primary, #1A4D2E)"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="order_count"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  fill="none"
                  strokeDasharray="4 2"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* Row 5: Outlet comparison (super_admin only) */}
      {isSuperAdmin && (
        <SectionCard title="Outlet Comparison">
          {loading ? <Skeleton className="h-40" /> : <OutletComparisonTable data={outlets} />}
        </SectionCard>
      )}

      {/* Row 6: Inventory value */}
      {inventoryValue && (
        <SectionCard title="Inventory Value">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-slate-500">Total Value</p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {formatCurrency(inventoryValue.total_inventory_value)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tracked Items</p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {inventoryValue.item_count.toLocaleString()}
              </p>
            </div>
          </div>
          {inventoryValue.outlets && inventoryValue.outlets.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryValue.outlets.map((o) => (
                    <TableRow key={o.outlet_tenant_id}>
                      <TableCell className="font-medium text-slate-800">{o.outlet_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(o.total_inventory_value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-500">{o.item_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}

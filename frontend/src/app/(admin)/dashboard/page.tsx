'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Users, UtensilsCrossed, Warehouse } from 'lucide-react'

import ActiveTableMap from '@/components/admin/ActiveTableMap'
import SalesChart from '@/components/admin/SalesChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import apiClient from '@/lib/api'

type SummaryResponse = {
  total_orders: number
  total_revenue: number
  avg_order_value: number
  total_students_served: number
  pending_orders: number
  active_tables: number
  cleaners_on_duty: number
}

type RevenuePoint = {
  date: string
  revenue: number
  order_count: number
}

type StatCardProps = {
  icon: React.ReactNode
  label: string
  value: string
  trend?: number | null
  suffix?: string
}

function formatCurrency(amount: number) {
  return `BDT ${amount.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function StatCard({ icon, label, value, trend, suffix }: StatCardProps) {
  const trendIsAvailable = typeof trend === 'number' && Number.isFinite(trend)

  return (
    <Card className="border-black/10 bg-white/90 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
              {value}
              {suffix ? <span className="ml-1 text-lg font-semibold text-slate-500">{suffix}</span> : null}
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-500">
              {trendIsAvailable ? (
                <>
                  {trend! >= 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-rose-600" />
                  )}
                  <span className={trend! >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {Math.abs(trend!).toFixed(1)}% vs yesterday
                  </span>
                </>
              ) : (
                <span>Trend unavailable</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function getTrend(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export default function AdminDashboardPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params?.tenant_slug ?? ''

  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async () => {
      try {
        const [summaryResponse, revenueResponse] = await Promise.all([
          apiClient.get('/analytics/summary?period=today'),
          apiClient.get('/analytics/revenue?days=7'),
        ])

        if (!mounted) return

        setSummary(summaryResponse.data as SummaryResponse)
        setRevenueData(
          (revenueResponse.data as Array<{ date: string; revenue: number; order_count: number }>).map((entry) => ({
            date: entry.date,
            revenue: Number(entry.revenue),
            order_count: Number(entry.order_count),
          }))
        )
      } catch {
        if (mounted) {
          setSummary(null)
          setRevenueData([])
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      mounted = false
    }
  }, [])

  const yesterdayComparison = useMemo(() => {
    const sorted = [...revenueData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    if (sorted.length < 2) return null
    const today = sorted[sorted.length - 1]
    const yesterday = sorted[sorted.length - 2]
    return {
      revenueTrend: getTrend(today.revenue, yesterday.revenue),
      orderTrend: getTrend(today.order_count, yesterday.order_count),
    }
  }, [revenueData])

  const todayRevenue = summary?.total_revenue ?? 0
  const todayOrders = summary?.total_orders ?? 0
  const activeTables = summary?.active_tables ?? 0
  const cleanersOnDuty = summary?.cleaners_on_duty ?? 0

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2eee7_0%,#ffffff_34%,#edf5ef_100%)] px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Admin Overview
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Operations dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
            Track today’s orders, revenue, tables, and staffing at a glance.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<BarChart3 className="h-6 w-6" />} label="Total Orders Today" value={String(todayOrders)} trend={yesterdayComparison?.orderTrend} />
            <StatCard icon={<Warehouse className="h-6 w-6" />} label="Revenue Today" value={formatCurrency(todayRevenue)} trend={yesterdayComparison?.revenueTrend} />
            <StatCard icon={<UtensilsCrossed className="h-6 w-6" />} label="Active Tables" value={String(activeTables)} />
            <StatCard icon={<Users className="h-6 w-6" />} label="Cleaners on Duty" value={String(cleanersOnDuty)} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-black/10 bg-white/90 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sales Trend</CardTitle>
              <Link
                href={`/${slug}/analytics`}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View full analytics <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <SalesChart
                data={revenueData.map((entry) => ({
                  date: entry.date,
                  revenue: entry.revenue,
                  orders: entry.order_count,
                }))}
              />
            </CardContent>
          </Card>

          <Card className="border-black/10 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>Active Table Map</CardTitle>
            </CardHeader>
            <CardContent>
              <ActiveTableMap />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
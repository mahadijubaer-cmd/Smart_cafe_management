'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Filter } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'

import SalesChart from '@/components/admin/SalesChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import apiClient from '@/lib/api'
import { differenceInCalendarDays, parseISO } from 'date-fns'

type TopItem = {
  item_name: string
  total_quantity: number
  total_revenue: number
}

type RevenuePoint = {
  date: string
  revenue: number
  order_count: number
}

const today = new Date()
const defaultStart = new Date(today)
defaultStart.setDate(today.getDate() - 29)

function toInputDate(dateValue: Date) {
  return dateValue.toISOString().slice(0, 10)
}

function formatCurrency(amount: number) {
  return `BDT ${amount.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function AdminReportsPage() {
  const [startDate, setStartDate] = useState(toInputDate(defaultStart))
  const [endDate, setEndDate] = useState(toInputDate(today))
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const selectedDays = useMemo(() => {
    const span = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1
    return Math.max(1, span)
  }, [startDate, endDate])

  const loadReportData = async (days: number) => {
    setLoading(true)
    try {
      const [topItemsResponse, revenueResponse] = await Promise.all([
        apiClient.get(`/analytics/top-items?days=${Math.min(days, 90)}`),
        apiClient.get(`/analytics/revenue?days=${Math.min(days, 365)}`),
      ])

      setTopItems(topItemsResponse.data as TopItem[])
      setRevenueData(
        (revenueResponse.data as Array<{ date: string; revenue: number; order_count: number }>).map((entry) => ({
          date: entry.date,
          revenue: Number(entry.revenue),
          order_count: Number(entry.order_count),
        }))
      )
    } catch {
      setTopItems([])
      setRevenueData([])
      toast.error('Unable to load report data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReportData(selectedDays)
  }, [selectedDays])

  const handleApplyRange = () => {
    loadReportData(selectedDays)
  }

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const [topItemsResponse, revenueResponse] = await Promise.all([
        apiClient.get(`/analytics/top-items?days=${Math.min(selectedDays, 90)}`),
        apiClient.get(`/analytics/revenue?days=${Math.min(selectedDays, 365)}`),
      ])

      const combinedRows = [
        ...((revenueResponse.data as Array<{ date: string; revenue: number; order_count: number }>).map((entry) => ({
          report_type: 'revenue',
          date: entry.date,
          order_count: entry.order_count,
          revenue: entry.revenue,
          item_name: '',
          total_quantity: '',
          total_revenue: '',
        }))),
        ...((topItemsResponse.data as TopItem[]).map((entry) => ({
          report_type: 'top_item',
          date: '',
          order_count: '',
          revenue: '',
          item_name: entry.item_name,
          total_quantity: entry.total_quantity,
          total_revenue: entry.total_revenue,
        }))),
      ]

      const csv = Papa.unparse(combinedRows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `analytics-report-${startDate}-to-${endDate}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Unable to export CSV')
    } finally {
      setExporting(false)
    }
  }

  const revenueChartData = revenueData.map((entry) => ({
    date: entry.date,
    revenue: entry.revenue,
    orders: entry.order_count,
  }))

  const highestQuantity = Math.max(...topItems.map((item) => item.total_quantity), 1)

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2eee7_0%,#ffffff_34%,#edf5ef_100%)] px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Reports
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Analytics reports</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Filter by date range, review top items, and export the current analytics snapshot.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleExportCsv} disabled={exporting}>
              <Download data-icon="inline-start" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        <Card className="border-black/10 bg-white/90 shadow-sm">
          <CardContent className="p-5 md:p-6">
            <FieldGroup className="grid gap-4 lg:grid-cols-[repeat(2,minmax(0,12rem))_auto]">
              <Field>
                <FieldLabel htmlFor="report-start-date" className="inline-flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Start date
                </FieldLabel>
                <Input
                  id="report-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="report-end-date">End date</FieldLabel>
                <Input
                  id="report-end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </Field>

              <div className="flex items-end">
                <Button type="button" variant="secondary" className="w-full" onClick={handleApplyRange}>
                  Apply Range
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-black/10 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>Revenue Chart</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[300px] rounded-3xl" />
              ) : (
                <SalesChart data={revenueChartData} />
              )}
            </CardContent>
          </Card>

          <Card className="border-black/10 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>Top Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {topItems.length === 0 ? (
                <Empty className="border border-dashed border-black/10">
                  <EmptyMedia variant="icon">
                    <Filter />
                  </EmptyMedia>
                  <EmptyTitle>No top items found</EmptyTitle>
                  <EmptyDescription>Try a different date range.</EmptyDescription>
                </Empty>
              ) : (
                topItems.map((item, index) => (
                  <div key={item.item_name} className="space-y-2 rounded-2xl border border-black/10 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{index + 1}. {item.item_name}</p>
                        <p className="text-sm text-slate-500">
                          {item.total_quantity.toLocaleString('en-BD')} orders · {formatCurrency(Number(item.total_revenue))}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{item.total_quantity.toLocaleString('en-BD')}</p>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#F97316]"
                        style={{ width: `${(item.total_quantity / highestQuantity) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
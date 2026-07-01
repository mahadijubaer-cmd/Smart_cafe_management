'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface TopItem {
  item_name: string
  total_quantity: number
  total_revenue: number
}

interface TopItemsChartProps {
  data: TopItem[]
}

function formatCurrency(v: number) {
  return `৳${v.toLocaleString('en-BD', { maximumFractionDigits: 0 })}`
}

export default function TopItemsChart({ data }: TopItemsChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
        No item data for this period.
      </div>
    )
  }

  // Top 10, shortest name first for readable horizontal bars
  const chartData = data
    .slice(0, 10)
    .map((d) => ({ ...d, item_name: d.item_name.length > 20 ? d.item_name.slice(0, 18) + '…' : d.item_name }))
    .reverse()

  return (
    <ResponsiveContainer width="100%" height={chartData.length * 40 + 40}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="item_name"
          tick={{ fontSize: 11, fill: '#475569' }}
          width={120}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as TopItem
            return (
              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-lg text-xs">
                <p className="font-semibold text-slate-800">{d.item_name}</p>
                <p className="text-slate-500">{d.total_quantity} orders</p>
                <p className="text-slate-500">{formatCurrency(d.total_revenue)} revenue</p>
              </div>
            )
          }}
        />
        <Bar dataKey="total_quantity" fill="var(--color-primary, #1A4D2E)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

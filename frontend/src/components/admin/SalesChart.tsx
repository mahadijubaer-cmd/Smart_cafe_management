'use client'

import { format } from 'date-fns'
import { useMemo } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type SalesChartPoint = {
  date: string
  revenue: number
  orders: number
}

type SalesChartProps = {
  data: SalesChartPoint[]
}

const revenueFormatter = new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export default function SalesChart({ data }: SalesChartProps) {
  const chartData = useMemo(
    () =>
      data.map((entry) => ({
        ...entry,
        label: format(new Date(entry.date), 'MMM dd'),
      })),
    [data]
  )

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <defs>
          <linearGradient id="salesRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1A4D2E" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#1A4D2E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="left"
          tick={{ fill: '#64748b', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `BDT ${revenueFormatter.format(value)}`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#64748b', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null

            const revenuePoint = payload.find((entry) => entry.dataKey === 'revenue')
            const orderPoint = payload.find((entry) => entry.dataKey === 'orders')

            return (
              <div className="rounded-2xl border bg-popover px-4 py-3 text-popover-foreground shadow-lg">
                <p className="text-sm font-semibold">{label}</p>
                <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                  <p>Revenue: BDT {revenueFormatter.format(Number(revenuePoint?.value ?? 0))}</p>
                  <p>Orders: {Number(orderPoint?.value ?? 0)}</p>
                </div>
              </div>
            )
          }}
        />
        <Legend verticalAlign="bottom" height={28} />
        <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#1A4D2E" fill="url(#salesRevenueGradient)" strokeWidth={2.5} />
        <Bar yAxisId="right" dataKey="orders" name="Order Count" fill="#F59E0B" radius={[8, 8, 0, 0]} barSize={22} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
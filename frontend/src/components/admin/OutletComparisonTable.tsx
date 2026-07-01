'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface OutletRow {
  outlet_tenant_id: string
  outlet_name: string
  order_count: number
  revenue: number
  unique_customers: number
}

type SortKey = 'revenue' | 'order_count' | 'unique_customers'

interface OutletComparisonTableProps {
  data: OutletRow[]
}

function formatCurrency(v: number) {
  return `৳${v.toLocaleString('en-BD', { maximumFractionDigits: 0 })}`
}

export default function OutletComparisonTable({ data }: OutletComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortAsc, setSortAsc] = useState(false)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...data].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortAsc ? diff : -diff
  })

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        No outlet data available.
      </div>
    )
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ChevronDown className="h-3 w-3 text-slate-300" />
    return sortAsc ? (
      <ChevronUp className="h-3 w-3 text-primary" />
    ) : (
      <ChevronDown className="h-3 w-3 text-primary" />
    )
  }

  function Th({
    label,
    col,
    align = 'right',
  }: {
    label: string
    col: SortKey
    align?: 'right' | 'left'
  }) {
    return (
      <th
        className={`cursor-pointer whitespace-nowrap py-3 text-${align} text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <SortIcon col={col} />
        </span>
      </th>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              Outlet
            </th>
            <Th label="Orders" col="order_count" />
            <Th label="Revenue" col="revenue" />
            <Th label="Customers" col="unique_customers" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((row) => (
            <tr key={row.outlet_tenant_id} className="hover:bg-slate-50">
              <td className="py-3 font-medium text-slate-800">{row.outlet_name}</td>
              <td className="py-3 text-right tabular-nums text-slate-600">
                {row.order_count.toLocaleString()}
              </td>
              <td className="py-3 text-right tabular-nums font-semibold text-slate-800">
                {formatCurrency(row.revenue)}
              </td>
              <td className="py-3 text-right tabular-nums text-slate-600">
                {row.unique_customers.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <td className="py-3 text-slate-700">Total</td>
            <td className="py-3 text-right tabular-nums text-slate-700">
              {data.reduce((s, r) => s + r.order_count, 0).toLocaleString()}
            </td>
            <td className="py-3 text-right tabular-nums text-slate-900">
              {formatCurrency(data.reduce((s, r) => s + r.revenue, 0))}
            </td>
            <td className="py-3 text-right tabular-nums text-slate-700">—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
      <Empty className="border border-dashed">
        <EmptyTitle>No outlet data</EmptyTitle>
        <EmptyDescription>No outlet data available.</EmptyDescription>
      </Empty>
    )
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ChevronDown className="size-3 text-muted-foreground/40" data-icon="inline-end" />
    return sortAsc ? (
      <ChevronUp className="size-3 text-primary" data-icon="inline-end" />
    ) : (
      <ChevronDown className="size-3 text-primary" data-icon="inline-end" />
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
      <TableHead
        className={cn(
          'cursor-pointer whitespace-nowrap text-xs font-semibold uppercase tracking-wider hover:text-foreground',
          align === 'right' ? 'text-right' : 'text-left'
        )}
        onClick={() => handleSort(col)}
      >
        <span
          className={cn(
            'inline-flex items-center gap-1',
            align === 'right' && 'justify-end'
          )}
        >
          {label}
          <SortIcon col={col} />
        </span>
      </TableHead>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs font-semibold uppercase tracking-wider">
            Outlet
          </TableHead>
          <Th label="Orders" col="order_count" />
          <Th label="Revenue" col="revenue" />
          <Th label="Customers" col="unique_customers" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.outlet_tenant_id}>
            <TableCell className="font-medium">{row.outlet_name}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {row.order_count.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatCurrency(row.revenue)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {row.unique_customers.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">
            {data.reduce((s, r) => s + r.order_count, 0).toLocaleString()}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatCurrency(data.reduce((s, r) => s + r.revenue, 0))}
          </TableCell>
          <TableCell className="text-right tabular-nums">—</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

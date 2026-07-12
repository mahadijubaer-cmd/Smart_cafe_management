'use client'

import { useEffect, useMemo, useState } from 'react'

import apiClient from '@/lib/api'
import type { TableMap } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

const statusStyles: Record<TableMap['status'], string> = {
  available: 'bg-green-500 text-white',
  reserved: 'bg-amber-500 text-white',
  occupied: 'bg-red-500 text-white',
  cleaning: 'bg-blue-500 text-white',
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn('size-3 rounded', color)} />
      <span>{label}</span>
    </Badge>
  )
}

export default function ActiveTableMap() {
  const [tables, setTables] = useState<TableMap[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadTables = async () => {
      try {
        const response = await apiClient.get('/tables')
        if (!mounted) return
        setTables(response.data as TableMap[])
      } catch {
        if (mounted) setTables([])
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadTables()
    const intervalId = window.setInterval(loadTables, 30000)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  const maxRow = useMemo(() => Math.max(...tables.map((table) => table.position_y), 0) + 1, [tables])

  const counts = useMemo(() => {
    return tables.reduce(
      (accumulator, table) => {
        accumulator.total += 1
        accumulator[table.status] += 1
        return accumulator
      },
      { total: 0, available: 0, reserved: 0, occupied: 0, cleaning: 0 }
    )
  }, [tables])

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="grid min-w-[42rem] grid-cols-5 gap-4">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-3xl" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyTitle>No table data</EmptyTitle>
          <EmptyDescription>No table data available.</EmptyDescription>
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[42rem] gap-4"
            style={{
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
              gridTemplateRows: `repeat(${maxRow}, minmax(5.5rem, auto))`,
            }}
          >
            {tables.map((table) => (
              <div
                key={table.table_id}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-3xl p-4 text-sm font-semibold opacity-95',
                  statusStyles[table.status]
                )}
                style={{
                  gridColumn: table.position_x + 1,
                  gridRow: table.position_y + 1,
                }}
              >
                <span className="text-base font-bold">{table.table_number}</span>
                <span className="mt-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-white/90">
                  <span aria-hidden="true">👤</span>
                  <span>{table.capacity}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card className="bg-card/70">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <LegendSwatch color="bg-green-500" label="Available" />
            <LegendSwatch color="bg-amber-500" label="Reserved" />
            <LegendSwatch color="bg-red-500" label="Occupied" />
            <LegendSwatch color="bg-blue-500" label="Cleaning" />
          </div>

          {/* This card sits in a half-width dashboard column, so it never actually reaches the
              viewport widths `sm:`/`xl:` breakpoints assume — capped at 3 columns (never 5) so
              labels like "AVAILABLE" have room to render in full instead of overflowing. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryPill label="Total" value={counts.total} />
            <SummaryPill label="Available" value={counts.available} />
            <SummaryPill label="Reserved" value={counts.reserved} />
            <SummaryPill label="Occupied" value={counts.occupied} />
            <SummaryPill label="Cleaning" value={counts.cleaning} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
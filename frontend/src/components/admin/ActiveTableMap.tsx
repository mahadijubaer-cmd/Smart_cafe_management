'use client'

import { useEffect, useMemo, useState } from 'react'

import apiClient from '@/lib/api'
import type { TableMap } from '@/types'

const statusStyles: Record<TableMap['status'], string> = {
  available: 'bg-green-500 text-white',
  reserved: 'bg-amber-500 text-white',
  occupied: 'bg-red-500 text-white',
  cleaning: 'bg-blue-500 text-white',
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded ${color}`} />
      <span>{label}</span>
    </div>
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
    <div className="space-y-4">
      {loading ? (
        <div className="rounded-3xl border border-dashed border-black/10 p-10 text-center text-sm text-slate-500">
          Loading live table map...
        </div>
      ) : tables.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-black/10 p-10 text-center text-sm text-slate-500">
          No table data available.
        </div>
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
                className={`relative flex flex-col items-center justify-center rounded-3xl p-4 text-sm font-semibold ${statusStyles[table.status]} opacity-95`}
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

      <div className="space-y-3 rounded-2xl bg-white/70 p-4">
        <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-700">
          <LegendSwatch color="bg-green-500" label="Available" />
          <LegendSwatch color="bg-amber-500" label="Reserved" />
          <LegendSwatch color="bg-red-500" label="Occupied" />
          <LegendSwatch color="bg-blue-500" label="Cleaning" />
        </div>

        <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryPill label="Total" value={counts.total} />
          <SummaryPill label="Available" value={counts.available} />
          <SummaryPill label="Reserved" value={counts.reserved} />
          <SummaryPill label="Occupied" value={counts.occupied} />
          <SummaryPill label="Cleaning" value={counts.cleaning} />
        </div>
      </div>
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  )
}
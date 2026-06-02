'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { Tooltip } from '@/components/ui/tooltip'
import type { TableMap } from '@/types'

type TableGridProps = {
  tables: TableMap[]
  selectedTableId: number | null
  onSelect: (tableId: number) => void
  readOnly?: boolean
}

const statusStyles: Record<TableMap['status'], string> = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  reserved: 'border-amber-200 bg-amber-50 text-amber-900',
  occupied: 'border-rose-200 bg-rose-50 text-rose-900',
  cleaning: 'border-sky-200 bg-sky-50 text-sky-900',
}

const zoneLabels = [
  { name: 'Window Side', accent: 'text-emerald-700' },
  { name: 'Center Hall', accent: 'text-slate-700' },
  { name: 'Group Area', accent: 'text-amber-700' },
  { name: 'Quick Bites', accent: 'text-rose-700' },
]

export default function TableGrid({ tables, selectedTableId, onSelect, readOnly = false }: TableGridProps) {
  const maxRow = useMemo(() => Math.max(...tables.map((table) => table.position_y), 0) + 1, [tables])
  const previousStatuses = useRef<Record<number, TableMap['status']>>({})
  const [flashingIds, setFlashingIds] = useState<number[]>([])

  useEffect(() => {
    const changedIds: number[] = []

    for (const table of tables) {
      const previousStatus = previousStatuses.current[table.table_id]
      if (previousStatus && previousStatus !== table.status) {
        changedIds.push(table.table_id)
      }
      previousStatuses.current[table.table_id] = table.status
    }

    if (changedIds.length === 0) return

    setFlashingIds((current) => Array.from(new Set([...current, ...changedIds])))
    const timeoutId = window.setTimeout(() => {
      setFlashingIds((current) => current.filter((tableId) => !changedIds.includes(tableId)))
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [tables])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {zoneLabels.map((zone) => (
          <div key={zone.name} className={`rounded-full bg-slate-50 px-3 py-2 ${zone.accent}`}>
            {zone.name}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid min-w-[50rem] gap-4 rounded-[2rem] bg-[radial-gradient(circle_at_top_left,rgba(26,77,46,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.95))] p-4 shadow-inner"
          style={{
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gridTemplateRows: `repeat(${maxRow}, minmax(5.5rem, auto))`,
          }}
        >
          {tables.map((table) => {
            const isSelected = table.table_id === selectedTableId
            const isClickable = !readOnly && table.status === 'available'
            const isFlashing = flashingIds.includes(table.table_id)

            const card = (
              <button
                type="button"
                onClick={() => isClickable && onSelect(table.table_id)}
                disabled={!isClickable}
                className={`relative flex h-full w-full flex-col items-center justify-center rounded-[1.75rem] border px-4 py-4 text-sm font-semibold transition duration-300 ${statusStyles[table.status]} ${
                  isSelected ? 'ring-2 ring-[#1A4D2E] ring-offset-2 ring-offset-white' : ''
                } ${isClickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg' : 'cursor-not-allowed opacity-80'} ${
                  isFlashing ? 'animate-pulse' : ''
                }`}
                style={{
                  gridColumn: table.position_x + 1,
                  gridRow: table.position_y + 1,
                }}
              >
                <span className="text-base font-black tracking-wide">{table.table_number}</span>
                <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-90">
                  <span aria-hidden="true">👥</span>
                  <span>{table.capacity}</span>
                </div>
                <span className="mt-3 inline-flex rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-700">
                  {table.status}
                </span>
              </button>
            )

            return (
              <Tooltip
                key={table.table_id}
                side="top"
                content={
                  <div className="space-y-1 text-center">
                    <div className="font-semibold">Table {table.table_number}</div>
                    <div className="text-white/75">{table.zone}</div>
                    <div className="text-white/75">Capacity {table.capacity}</div>
                    <div className="text-white/75 capitalize">Status: {table.status}</div>
                  </div>
                }
              >
                {card}
              </Tooltip>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-3xl border border-black/10 bg-white/80 p-4 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
        <LegendSwatch className="bg-emerald-500" label="Available" />
        <LegendSwatch className="bg-amber-500" label="Reserved" />
        <LegendSwatch className="bg-rose-500" label="Occupied" />
        <LegendSwatch className="bg-sky-500" label="Cleaning" />
        <div className="ml-auto text-slate-500">Tap an available table to select it for checkout.</div>
      </div>
    </div>
  )
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${className}`} />
      <span>{label}</span>
    </div>
  )
}
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TableMap } from '@/types'

type TableGridProps = {
  tables: TableMap[]
  selectedTableId: number | null
  onSelect: (tableId: number) => void
  readOnly?: boolean
}

const statusStyles: Record<TableMap['status'], string> = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  reserved: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  occupied: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
  cleaning: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
}

const zoneLabels = [
  { name: 'Window Side', accent: 'text-emerald-700 dark:text-emerald-400' },
  { name: 'Center Hall', accent: 'text-muted-foreground' },
  { name: 'Group Area', accent: 'text-amber-700 dark:text-amber-400' },
  { name: 'Quick Bites', accent: 'text-rose-700 dark:text-rose-400' },
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
      <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {zoneLabels.map((zone) => (
          <div key={zone.name} className={`rounded-full bg-muted px-3 py-2 ${zone.accent}`}>
            {zone.name}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid min-w-[50rem] gap-4 rounded-[2rem] bg-gradient-to-b from-card to-muted p-4 shadow-inner"
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
                  isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
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
                <Badge variant="outline" className="mt-3 bg-background/70 text-[10px] font-bold uppercase tracking-[0.22em]">
                  {table.status}
                </Badge>
              </button>
            )

            return (
              <Tooltip key={table.table_id}>
                <TooltipTrigger asChild>{card}</TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-1 text-center">
                    <div className="font-semibold">Table {table.table_number}</div>
                    <div className="text-white/75">{table.zone}</div>
                    <div className="text-white/75">Capacity {table.capacity}</div>
                    <div className="text-white/75 capitalize">Status: {table.status}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-3xl border bg-background/80 p-4 text-xs font-medium text-foreground shadow-sm backdrop-blur">
        <LegendSwatch className="bg-emerald-500" label="Available" />
        <LegendSwatch className="bg-amber-500" label="Reserved" />
        <LegendSwatch className="bg-rose-500" label="Occupied" />
        <LegendSwatch className="bg-sky-500" label="Cleaning" />
        <div className="ml-auto text-muted-foreground">Tap an available table to select it for checkout.</div>
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
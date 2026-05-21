'use client'

import type { TableMap } from '@/types'

type TableGridProps = {
  tables: TableMap[]
  selectedTableId: number | null
  onSelect: (tableId: number) => void
}

const statusStyles: Record<TableMap['status'], string> = {
  available: 'bg-green-500 text-white',
  reserved: 'bg-amber-500 text-white',
  occupied: 'bg-red-500 text-white',
  cleaning: 'bg-blue-500 text-white',
}

export default function TableGrid({ tables, selectedTableId, onSelect }: TableGridProps) {
  const maxRow = Math.max(...tables.map((table) => table.position_y), 0) + 1

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[42rem] gap-4"
          style={{
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gridTemplateRows: `repeat(${maxRow}, minmax(5.5rem, auto))`,
          }}
        >
          {tables.map((table) => {
            const isSelected = table.table_id === selectedTableId
            const isClickable = table.status === 'available'

            return (
              <button
                key={table.table_id}
                type="button"
                onClick={() => isClickable && onSelect(table.table_id)}
                disabled={!isClickable}
                className={`relative flex flex-col items-center justify-center rounded-3xl p-4 text-sm font-semibold transition ${statusStyles[table.status]} ${
                  isSelected ? 'ring-2 ring-gray-900 ring-offset-2 ring-offset-white' : ''
                } ${isClickable ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-not-allowed opacity-80'}`}
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
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl bg-white/70 p-3 text-xs font-medium text-slate-700">
        <LegendSwatch color="bg-green-500" label="Available" />
        <LegendSwatch color="bg-amber-500" label="Reserved" />
        <LegendSwatch color="bg-red-500" label="Occupied" />
        <LegendSwatch color="bg-blue-500" label="Cleaning" />
      </div>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded ${color}`} />
      <span>{label}</span>
    </div>
  )
}
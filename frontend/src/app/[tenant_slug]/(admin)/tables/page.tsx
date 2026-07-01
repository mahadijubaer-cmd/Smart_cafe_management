'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layout, Map } from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import type { TableMap } from '@/types'
import ActiveTableMap from '@/components/admin/ActiveTableMap'
import FloorPlanEditor from '@/components/admin/FloorPlanEditor'
import TableDetailPanel from '@/components/admin/TableDetailPanel'
import ZoneFilter from '@/components/admin/ZoneFilter'
import { useStore } from '@/store/useStore'

type ViewMode = 'live' | 'editor'

export default function TablesPage() {
  const [tables, setTables] = useState<TableMap[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('live')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)

  const wsNotifications = useStore((s) => s.notifications)

  const fetchTables = async () => {
    try {
      const res = await apiClient.get('/tables/')
      setTables(res.data as TableMap[])
    } catch {
      toast.error('Failed to load tables')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTables()
  }, [])

  // React to WebSocket TABLE_UPDATE events
  useEffect(() => {
    const last = wsNotifications[wsNotifications.length - 1]
    if (!last) return
    const msg = last as { type?: string; table_id?: number; status?: string }
    if (msg.type === 'TABLE_UPDATE' && msg.table_id && msg.status) {
      setTables((prev) =>
        prev.map((t) =>
          t.table_id === msg.table_id
            ? { ...t, status: msg.status as TableMap['status'] }
            : t
        )
      )
    }
  }, [wsNotifications])

  const uniqueZones = useMemo(
    () => [...new Set(tables.map((t) => t.zone))].sort(),
    [tables]
  )

  const filteredTables = useMemo(
    () => (selectedZone ? tables.filter((t) => t.zone === selectedZone) : tables),
    [tables, selectedZone]
  )

  const handleTableStatusChange = (tableId: number, status: TableMap['status']) => {
    setTables((prev) =>
      prev.map((t) => (t.table_id === tableId ? { ...t, status } : t))
    )
  }

  const isMobile =
    typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Tables &amp; Floor Plan
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {tables.length} table{tables.length !== 1 ? 's' : ''} &middot; Live WebSocket updates
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('live')}
            className={[
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
              mode === 'live'
                ? 'bg-primary text-white shadow-sm'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            <Map className="h-4 w-4" />
            Live View
          </button>
          <button
            type="button"
            onClick={() => setMode('editor')}
            className={[
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
              mode === 'editor'
                ? 'bg-primary text-white shadow-sm'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            <Layout className="h-4 w-4" />
            Edit Layout
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : mode === 'live' ? (
        <div className="space-y-4">
          {uniqueZones.length > 1 && (
            <ZoneFilter
              zones={uniqueZones}
              selected={selectedZone}
              onChange={setSelectedZone}
            />
          )}
          {/* Live table map — clicking a table opens the detail panel */}
          <LiveTableGrid
            tables={filteredTables}
            onTableClick={(id) => setSelectedTableId(id)}
          />
          {selectedTableId !== null && (
            <TableDetailPanel
              tableId={selectedTableId}
              onClose={() => setSelectedTableId(null)}
              onStatusChange={handleTableStatusChange}
              onEditInLayout={() => setMode('editor')}
            />
          )}
        </div>
      ) : (
        <div>
          {isMobile ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
              The floor plan editor is only available on desktop. Please switch to a larger screen.
            </div>
          ) : (
            <FloorPlanEditor
              initialTables={tables}
              onTablesChange={(updated) => {
                setTables(updated)
                setMode('live')
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// Inline live table grid with click support
const statusStyles: Record<TableMap['status'], string> = {
  available: 'bg-green-500 text-white',
  reserved: 'bg-amber-500 text-white',
  occupied: 'bg-red-500 text-white',
  cleaning: 'bg-blue-500 text-white',
}

function LiveTableGrid({
  tables,
  onTableClick,
}: {
  tables: TableMap[]
  onTableClick: (id: number) => void
}) {
  const maxRow = Math.max(...tables.map((t) => t.position_y), 0) + 1

  if (tables.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-black/10 p-12 text-center text-sm text-slate-500">
        No tables found.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[42rem] gap-3"
        style={{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridTemplateRows: `repeat(${maxRow}, minmax(5.5rem, auto))`,
        }}
      >
        {tables.map((table) => (
          <button
            key={table.table_id}
            type="button"
            onClick={() => onTableClick(table.table_id)}
            className={[
              'relative flex flex-col items-center justify-center rounded-2xl p-3 text-xs font-semibold transition hover:ring-2 hover:ring-white/50 hover:opacity-90',
              statusStyles[table.status as TableMap['status']] ?? 'bg-slate-400 text-white',
            ].join(' ')}
            style={{
              gridColumn: (table.position_x ?? 0) + 1,
              gridRow: (table.position_y ?? 0) + 1,
            }}
          >
            <span className="text-sm font-bold">{table.table_number}</span>
            <span className="mt-1 text-[10px] uppercase tracking-wider opacity-80">
              {table.zone}
            </span>
            <span className="text-[10px] opacity-75">{table.capacity}p</span>
          </button>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layout, Map } from 'lucide-react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import type { TableMap } from '@/types'
import FloorPlanEditor from '@/components/admin/FloorPlanEditor'
import TableDetailPanel from '@/components/admin/TableDetailPanel'
import ZoneFilter from '@/components/admin/ZoneFilter'
import PageHeader from '@/components/layout/PageHeader'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
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
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Tables & Floor Plan"
        description={`${tables.length} table${tables.length !== 1 ? 's' : ''} · Live WebSocket updates`}
        action={
          <Tabs value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="live">
                <Map data-icon="inline-start" className="size-4" />
                Live View
              </TabsTrigger>
              <TabsTrigger value="editor">
                <Layout data-icon="inline-start" className="size-4" />
                Edit Layout
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : mode === 'live' ? (
        <div className="flex flex-col gap-4">
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
            selectedTableId={selectedTableId}
            onTableClick={(id) => setSelectedTableId(id)}
          />
          <TableDetailPanel
            tableId={selectedTableId}
            onClose={() => setSelectedTableId(null)}
            onStatusChange={handleTableStatusChange}
            onEditInLayout={() => setMode('editor')}
          />
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
  available: 'bg-primary text-primary-foreground',
  reserved: 'bg-secondary text-secondary-foreground',
  occupied: 'bg-destructive text-destructive-foreground',
  cleaning: 'border-2 border-input bg-muted text-foreground',
}

function LiveTableGrid({
  tables,
  selectedTableId,
  onTableClick,
}: {
  tables: TableMap[]
  selectedTableId: number | null
  onTableClick: (id: number) => void
}) {
  const maxRow = Math.max(...tables.map((t) => t.position_y), 0) + 1

  if (tables.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyTitle>No tables found</EmptyTitle>
        <EmptyDescription>Add tables from the floor plan editor.</EmptyDescription>
      </Empty>
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
            className={cn(
              'relative flex flex-col items-center justify-center rounded-2xl p-3 text-xs font-semibold transition hover:-translate-y-0.5 hover:opacity-90 hover:ring-2 hover:ring-ring',
              statusStyles[table.status as TableMap['status']] ?? 'bg-muted text-muted-foreground',
              table.table_id === selectedTableId && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )}
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

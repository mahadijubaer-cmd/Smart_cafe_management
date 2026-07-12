'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LayoutGrid } from 'lucide-react'

type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning'

interface FcTable {
  table_id: number
  table_number: string
  zone: string
  capacity: number
  status: TableStatus
  position_x: number
  position_y: number
}

const STATUS_BORDER_CLASSES: Record<TableStatus, string> = {
  available: 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-400',
  occupied: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400',
  reserved: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400',
  cleaning: 'border-border bg-muted text-muted-foreground',
}

const STATUS_OPTIONS: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning']

const ALL_ZONES = '__all__'

export default function FoodCourtTablesPage() {
  const notifications = useStore((s) => s.notifications)
  const user = useStore((s) => s.user)
  const [tables, setTables] = useState<FcTable[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [updating, setUpdating] = useState<number | null>(null)

  const isAdmin = user?.role === 'food_court_admin'

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/food-court/tables')
      setTables(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // WebSocket TABLE_UPDATE
  useEffect(() => {
    const last = notifications[0]
    if (last?.type === 'TABLE_UPDATE') load()
  }, [notifications, load])

  const handleStatusChange = async (tableId: number, status: TableStatus) => {
    setUpdating(tableId)
    try {
      await apiClient.patch(`/food-court/tables/${tableId}/status`, { status })
      setTables((prev) =>
        prev.map((t) => (t.table_id === tableId ? { ...t, status } : t))
      )
      toast.success('Table status updated.')
    } catch {
      toast.error('Failed to update status.')
    } finally {
      setUpdating(null)
    }
  }

  const zones = [...new Set(tables.map((t) => t.zone))]
  const visibleTables =
    selectedZone === null ? tables : tables.filter((t) => t.zone === selectedZone)

  return (
    <div className="motion-safe:animate-fade-up space-y-5">
      <PageHeader title="Shared Tables" />

      {/* Zone filter */}
      {zones.length > 1 && (
        <Tabs
          value={selectedZone ?? ALL_ZONES}
          onValueChange={(v) => setSelectedZone(v === ALL_ZONES ? null : v)}
        >
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              value={ALL_ZONES}
              className="rounded-full border border-input data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              All
            </TabsTrigger>
            {zones.map((z) => (
              <TabsTrigger
                key={z}
                value={z}
                className="rounded-full border border-input capitalize data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {z}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <Badge key={s} variant="outline" className={cn('capitalize', STATUS_BORDER_CLASSES[s])}>
            {s}
          </Badge>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[...Array(12)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : visibleTables.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutGrid />
            </EmptyMedia>
            <EmptyTitle>No tables found</EmptyTitle>
            <EmptyDescription>There are no tables in this zone yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {visibleTables.map((table) => (
            <Card
              key={table.table_id}
              className={cn('border-2 p-3 text-center', STATUS_BORDER_CLASSES[table.status])}
            >
              <p className="text-xs font-bold">{table.table_number}</p>
              <p className="mt-0.5 text-[10px] opacity-70">{table.capacity} seats</p>

              {/* Status selector */}
              <Select
                value={table.status}
                disabled={updating === table.table_id || (!isAdmin && table.status !== 'available' && table.status !== 'occupied')}
                onValueChange={(value) => handleStatusChange(table.table_id, value as TableStatus)}
              >
                <SelectTrigger className="mt-2 h-6 w-full border-0 bg-background/70 px-1.5 py-0 text-[10px] font-semibold capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

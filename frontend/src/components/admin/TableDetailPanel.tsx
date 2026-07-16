'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import type { TableMap } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

interface TableDetailPanelProps {
  tableId: number | null
  onClose: () => void
  onStatusChange?: (tableId: number, status: TableMap['status']) => void
  onEditInLayout?: (tableId: number) => void
}

const STATUS_OPTIONS: TableMap['status'][] = ['available', 'reserved', 'occupied', 'cleaning']

const statusBadgeVariant: Record<TableMap['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  available: 'default',
  reserved: 'secondary',
  occupied: 'destructive',
  cleaning: 'outline',
}

export default function TableDetailPanel({
  tableId,
  onClose,
  onStatusChange,
  onEditInLayout,
}: TableDetailPanelProps) {
  const [table, setTable] = useState<TableMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  useEffect(() => {
    if (!tableId) {
      setTable(null)
      return
    }
    setLoading(true)
    apiClient
      .get(`/tables/${tableId}`)
      .then((res) => setTable(res.data as TableMap))
      .catch(() => setTable(null))
      .finally(() => setLoading(false))
  }, [tableId])

  const handleStatusChange = async (newStatus: TableMap['status']) => {
    if (!table) return
    setUpdatingStatus(true)
    try {
      const res = await apiClient.patch(`/tables/${table.table_id}/status`, { status: newStatus })
      const updated = res.data as TableMap
      setTable(updated)
      onStatusChange?.(table.table_id, updated.status as TableMap['status'])
      toast.success(`Table status updated to ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (!tableId) return null

  return (
    <Sheet open={tableId !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>{table ? `Table ${table.table_number}` : 'Table Details'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : !table ? (
            <p className="text-sm text-muted-foreground">Table not found.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Status section */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                <Badge variant={statusBadgeVariant[table.status as TableMap['status']]}>
                  {table.status}
                </Badge>
                <div className="mt-3">
                  <Select
                    value={table.status}
                    disabled={updatingStatus}
                    onValueChange={(v) => handleStatusChange(v as TableMap['status'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Table info */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Details
                </p>
                <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Zone</span>
                    <span className="font-medium">{table.zone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capacity</span>
                    <span className="font-medium">{table.capacity} seats</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Position</span>
                    <span className="font-medium">
                      ({table.position_x}, {table.position_y})
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {onEditInLayout && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                      onClick={() => {
                        onEditInLayout(table.table_id)
                        onClose()
                      }}
                    >
                      Edit in Layout
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import type { TableMap } from '@/types'
import { useTableLayout } from '@/hooks/useTableLayout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const GRID_COLS = 12
const GRID_ROWS = 8

interface FloorPlanEditorProps {
  initialTables: TableMap[]
  onTablesChange: (tables: TableMap[]) => void
}

interface TableCardProps {
  tableId: number
  tableNumber: string
  zone: string
  capacity: number
  isSelected: boolean
  onClick: () => void
}

function DraggableTableCard({
  tableId,
  tableNumber,
  zone,
  capacity,
  isSelected,
  onClick,
}: TableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `table-${tableId}`,
    data: { tableId },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'flex h-full w-full cursor-grab flex-col items-center justify-center rounded-xl border-2 p-2 text-xs font-semibold transition active:cursor-grabbing',
        isDragging ? 'opacity-30' : 'opacity-100',
        isSelected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-foreground hover:border-primary/50'
      )}
    >
      <span className="font-bold">{tableNumber}</span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">{zone}</span>
      <span className="text-[10px] text-muted-foreground">{capacity}p</span>
    </div>
  )
}

function DroppableCell({
  col,
  row,
  isOccupied,
}: {
  col: number
  row: number
  isOccupied: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell-${col}-${row}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border transition',
        isOccupied ? 'border-transparent' : 'border-dashed border-border',
        isOver && !isOccupied ? 'border-primary/50 bg-primary/5' : ''
      )}
      style={{ minHeight: '5.5rem' }}
    />
  )
}

interface TableEditPopoverProps {
  tableId: number
  tableNumber: string
  zone: string
  capacity: number
  zones: string[]
  onSave: (tableNumber: string, zone: string, capacity: number) => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
}

function TableEditPopover({
  tableId,
  tableNumber,
  zone,
  capacity,
  zones,
  onSave,
  onDelete,
  onClose,
}: TableEditPopoverProps) {
  const [name, setName] = useState(tableNumber)
  const [selectedZone, setSelectedZone] = useState(zone)
  const [cap, setCap] = useState(capacity)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(name, selectedZone, cap)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const zoneOptions = zones.includes(selectedZone) ? zones : [...zones, selectedZone]

  return (
    <div className="absolute left-full top-0 z-10 ml-2 w-56 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl">
      <p className="mb-3 text-sm font-bold">Edit Table</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`table-number-${tableId}`} className="text-xs text-muted-foreground">
            Table Number
          </Label>
          <Input
            id={`table-number-${tableId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`table-zone-${tableId}`} className="text-xs text-muted-foreground">
            Zone
          </Label>
          <Select value={selectedZone} onValueChange={setSelectedZone}>
            <SelectTrigger id={`table-zone-${tableId}`} className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zoneOptions.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`table-capacity-${tableId}`} className="text-xs text-muted-foreground">
            Capacity
          </Label>
          <Input
            id={`table-capacity-${tableId}`}
            type="number"
            min={1}
            max={50}
            value={cap}
            onChange={(e) => setCap(Number(e.target.value))}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <AlertDialog>
        <AlertDialogTrigger>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Table'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete table {tableNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the table from the floor plan. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function FloorPlanEditor({
  initialTables,
  onTablesChange,
}: FloorPlanEditorProps) {
  const { tables, positions, isDirty, updatePosition, updateMeta, save, reset } =
    useTableLayout(initialTables)

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const uniqueZones = [...new Set(tables.map((t) => t.zone))]

  // Build position lookup: "x,y" → tableId
  const posMap = new Map<string, number>()
  positions.forEach((pos, tableId) => {
    posMap.set(`${pos.x},${pos.y}`, tableId)
  })

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { tableId: number }
    setActiveId(data.tableId)
    setSelectedTableId(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { over } = event
    if (!over) return

    const overId = over.id as string
    if (!overId.startsWith('cell-')) return

    const parts = overId.split('-')
    const col = parseInt(parts[1])
    const row = parseInt(parts[2])

    const data = event.active.data.current as { tableId: number }
    const tableId = data.tableId

    // Check if target cell is occupied by another table
    const occupant = posMap.get(`${col},${row}`)
    if (occupant !== undefined && occupant !== tableId) {
      toast.error('Cell is already occupied')
      return
    }

    updatePosition(tableId, col, row)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await save()
      // Rebuild updated tables list from hook
      onTablesChange(tables)
      toast.success('Layout saved')
    } catch {
      toast.error('Failed to save layout')
    } finally {
      setSaving(false)
    }
  }

  const handleAddTable = async () => {
    // Find first empty cell
    let foundX = 0
    let foundY = 0
    outer: for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (!posMap.has(`${col},${row}`)) {
          foundX = col
          foundY = row
          break outer
        }
      }
    }

    try {
      const res = await apiClient.post('/tables/', {
        table_number: `T-${tables.length + 1}`,
        zone: 'indoor',
        capacity: 4,
        position_x: foundX,
        position_y: foundY,
      })
      const newTable = res.data as TableMap
      onTablesChange([...tables, newTable])
      toast.success(`Added ${newTable.table_number}`)
    } catch {
      toast.error('Failed to add table')
    }
  }

  const handleSaveMeta = async (
    tableId: number,
    tableNumber: string,
    zone: string,
    capacity: number
  ) => {
    const pos = positions.get(tableId)
    if (!pos) return
    try {
      await apiClient.put(`/tables/${tableId}`, {
        table_number: tableNumber,
        zone,
        capacity,
        position_x: pos.x,
        position_y: pos.y,
      })
      updateMeta(tableId, zone, capacity, tableNumber)
      toast.success('Table updated')
    } catch {
      toast.error('Failed to update table')
    }
  }

  const handleDeleteTable = async (tableId: number) => {
    await apiClient.delete(`/tables/${tableId}`)
    onTablesChange(tables.filter((t) => t.table_id !== tableId))
    toast.success('Table deleted')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleAddTable}>
          + Add Table
        </Button>
        <Button type="button" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? 'Saving...' : 'Save Layout'}
        </Button>
        <Button type="button" variant="outline" onClick={reset} disabled={!isDirty}>
          Cancel
        </Button>
        {isDirty && (
          <span className="text-xs font-medium text-amber-600">Unsaved changes</span>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-2xl border bg-muted/40 p-4">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(5rem, 1fr))`,
              gridTemplateRows: `repeat(${GRID_ROWS}, minmax(5.5rem, auto))`,
              minWidth: `${GRID_COLS * 5.5}rem`,
            }}
            onClick={() => setSelectedTableId(null)}
          >
            {Array.from({ length: GRID_ROWS }, (_, row) =>
              Array.from({ length: GRID_COLS }, (_, col) => {
                const tableId = posMap.get(`${col},${row}`)
                const pos = tableId !== undefined ? positions.get(tableId) : undefined
                const isOccupied = tableId !== undefined

                return (
                  <div
                    key={`${col}-${row}`}
                    className="relative"
                    style={{ gridColumn: col + 1, gridRow: row + 1 }}
                  >
                    <DroppableCell col={col} row={row} isOccupied={isOccupied} />
                    {isOccupied && pos && tableId !== undefined && (
                      <div className="absolute inset-0">
                        <DraggableTableCard
                          tableId={tableId}
                          tableNumber={pos.tableNumber}
                          zone={pos.zone}
                          capacity={pos.capacity}
                          isSelected={selectedTableId === tableId}
                          onClick={() =>
                            setSelectedTableId((prev) =>
                              prev === tableId ? null : tableId
                            )
                          }
                        />
                        {selectedTableId === tableId && pos && (
                          <TableEditPopover
                            tableId={tableId}
                            tableNumber={pos.tableNumber}
                            zone={pos.zone}
                            capacity={pos.capacity}
                            zones={uniqueZones}
                            onSave={(tn, z, cap) => handleSaveMeta(tableId, tn, z, cap)}
                            onDelete={() => handleDeleteTable(tableId)}
                            onClose={() => setSelectedTableId(null)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <DragOverlay>
            {activeId !== null && positions.get(activeId) ? (
              <div className="flex size-20 flex-col items-center justify-center rounded-xl border-2 border-primary bg-primary/10 text-xs font-bold text-primary shadow-lg">
                {positions.get(activeId)?.tableNumber}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag tables to reposition. Click a table to edit its details.
      </p>
    </div>
  )
}

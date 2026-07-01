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
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import type { TableMap } from '@/types'
import { useTableLayout } from '@/hooks/useTableLayout'

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
      className={[
        'flex h-full w-full cursor-grab flex-col items-center justify-center rounded-xl border-2 p-2 text-xs font-semibold transition active:cursor-grabbing',
        isDragging ? 'opacity-30' : 'opacity-100',
        isSelected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-slate-300 bg-white text-slate-700 hover:border-primary/50',
      ].join(' ')}
    >
      <span className="font-bold">{tableNumber}</span>
      <span className="mt-0.5 text-[10px] text-slate-500">{zone}</span>
      <span className="text-[10px] text-slate-400">{capacity}p</span>
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
      className={[
        'rounded-xl border transition',
        isOccupied ? 'border-transparent' : 'border-dashed border-slate-200',
        isOver && !isOccupied ? 'border-primary/50 bg-primary/5' : '',
      ].join(' ')}
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
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="absolute z-50 left-full top-0 ml-2 w-56 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="mb-3 text-sm font-bold text-slate-800">Edit Table</p>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Table Number</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Zone</label>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
            {!zones.includes(selectedZone) && (
              <option value={selectedZone}>{selectedZone}</option>
            )}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Capacity</label>
          <input
            type="number"
            min={1}
            max={50}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={cap}
            onChange={(e) => setCap(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          Cancel
        </button>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className={[
          'mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition',
          confirmDelete
            ? 'bg-red-600 text-white'
            : 'border border-red-200 text-red-600 hover:bg-red-50',
        ].join(' ')}
      >
        {deleting ? 'Deleting...' : confirmDelete ? 'Confirm Delete' : 'Delete Table'}
      </button>
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

  const selectedPos = selectedTableId ? positions.get(selectedTableId) : null

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleAddTable}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Add Table
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save Layout'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!isDirty}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Cancel
        </button>
        {isDirty && (
          <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
              <div className="flex h-20 w-20 flex-col items-center justify-center rounded-xl border-2 border-primary bg-primary/10 text-xs font-bold text-primary shadow-lg">
                {positions.get(activeId)?.tableNumber}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <p className="text-xs text-slate-400">
        Drag tables to reposition. Click a table to edit its details.
      </p>
    </div>
  )
}

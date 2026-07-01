'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import type { TableMap } from '@/types'

interface TableDetailPanelProps {
  tableId: number | null
  onClose: () => void
  onStatusChange?: (tableId: number, status: TableMap['status']) => void
  onEditInLayout?: (tableId: number) => void
}

const STATUS_OPTIONS: TableMap['status'][] = ['available', 'reserved', 'occupied', 'cleaning']

const statusStyles: Record<TableMap['status'], string> = {
  available: 'bg-green-100 text-green-800',
  reserved: 'bg-amber-100 text-amber-800',
  occupied: 'bg-red-100 text-red-800',
  cleaning: 'bg-blue-100 text-blue-800',
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
  const [assigningCleaner, setAssigningCleaner] = useState(false)

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

  const handleAssignCleaner = async () => {
    if (!table) return
    setAssigningCleaner(true)
    try {
      await apiClient.post('/cleaners/logs/', { table_id: table.table_id })
      toast.success('Cleaner assigned')
    } catch {
      toast.error('Failed to assign cleaner')
    } finally {
      setAssigningCleaner(false)
    }
  }

  if (!tableId) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">
            {table ? `Table ${table.table_number}` : 'Table Details'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : !table ? (
            <p className="text-sm text-slate-500">Table not found.</p>
          ) : (
            <div className="space-y-6">
              {/* Status section */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </p>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${statusStyles[table.status as TableMap['status']]}`}
                >
                  {table.status}
                </span>
                <div className="mt-3">
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={table.status}
                    disabled={updatingStatus}
                    onChange={(e) => handleStatusChange(e.target.value as TableMap['status'])}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table info */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Details
                </p>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Zone</span>
                    <span className="font-medium">{table.zone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Capacity</span>
                    <span className="font-medium">{table.capacity} seats</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Position</span>
                    <span className="font-medium">
                      ({table.position_x}, {table.position_y})
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleAssignCleaner}
                    disabled={assigningCleaner}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {assigningCleaner ? 'Assigning...' : 'Assign Cleaner'}
                  </button>
                  {onEditInLayout && (
                    <button
                      type="button"
                      onClick={() => {
                        onEditInLayout(table.table_id)
                        onClose()
                      }}
                      className="w-full rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/5"
                    >
                      Edit in Layout
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

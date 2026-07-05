'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'

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

const STATUS_COLORS: Record<TableStatus, string> = {
  available: 'border-green-300 bg-green-50 text-green-800',
  occupied: 'border-rose-300 bg-rose-50 text-rose-800',
  reserved: 'border-amber-300 bg-amber-50 text-amber-800',
  cleaning: 'border-slate-300 bg-slate-100 text-slate-600',
}

const STATUS_OPTIONS: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning']

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
    <div className="space-y-5">
      <h1 className="text-2xl font-black text-slate-900">Shared Tables</h1>

      {/* Zone filter */}
      {zones.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedZone(null)}
            className={[
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition',
              selectedZone === null
                ? 'bg-primary text-white'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            All
          </button>
          {zones.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setSelectedZone(z)}
              className={[
                'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition',
                selectedZone === z
                  ? 'bg-primary text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {z}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {STATUS_OPTIONS.map((s) => (
          <span
            key={s}
            className={`rounded-full border px-3 py-0.5 text-xs font-semibold capitalize ${STATUS_COLORS[s]}`}
          >
            {s}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : visibleTables.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-400">No tables found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {visibleTables.map((table) => (
            <div
              key={table.table_id}
              className={`rounded-2xl border-2 p-3 text-center transition ${STATUS_COLORS[table.status]}`}
            >
              <p className="text-xs font-bold">{table.table_number}</p>
              <p className="mt-0.5 text-[10px] opacity-70">{table.capacity} seats</p>

              {/* Status selector */}
              <select
                className="mt-2 w-full rounded-lg border-0 bg-white/70 px-1 py-0.5 text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={table.status}
                disabled={updating === table.table_id || (!isAdmin && table.status !== 'available' && table.status !== 'occupied')}
                onChange={(e) =>
                  handleStatusChange(table.table_id, e.target.value as TableStatus)
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

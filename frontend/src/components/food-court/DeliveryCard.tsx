'use client'

import { useState } from 'react'
import { Clock, Table2 } from 'lucide-react'

export interface ActiveOrder {
  order_id: string
  vendor_tenant_id: string
  vendor_name?: string
  table_id: number | null
  status: string
  total_amount: string
  time_slot: string
  items?: Array<{ name: string; quantity: number }>
}

interface DeliveryCardProps {
  order: ActiveOrder
  onDeliver: () => Promise<void>
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function DeliveryCard({ order, onDeliver }: DeliveryCardProps) {
  const [loading, setLoading] = useState(false)

  const handleDeliver = async () => {
    setLoading(true)
    try {
      await onDeliver()
    } finally {
      setLoading(false)
    }
  }

  const isReady = order.status === 'ready'

  return (
    <div
      className={[
        'rounded-2xl border bg-white p-5 shadow-sm transition',
        isReady ? 'border-green-200' : 'border-slate-100',
      ].join(' ')}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        {order.vendor_name && (
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
            {order.vendor_name}
          </span>
        )}
        <span
          className={[
            'rounded-full px-3 py-0.5 text-xs font-semibold capitalize',
            isReady
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700',
          ].join(' ')}
        >
          {order.status}
        </span>
      </div>

      {/* Table + time */}
      <div className="mb-3 flex items-center gap-4 text-sm text-slate-600">
        <span className="flex items-center gap-1.5 font-semibold text-slate-900">
          <Table2 className="h-4 w-4 text-slate-400" />
          {order.table_id ? `Table ${order.table_id}` : 'No table'}
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3 w-3" />
          {timeAgo(order.time_slot)}
        </span>
      </div>

      {/* Items */}
      {order.items && order.items.length > 0 && (
        <p className="mb-3 text-xs text-slate-500">
          {order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
        </p>
      )}

      {/* Total */}
      <p className="mb-4 text-sm font-semibold text-slate-800">
        ৳{Number(order.total_amount).toFixed(0)}
      </p>

      {/* Action */}
      {isReady && (
        <button
          type="button"
          onClick={handleDeliver}
          disabled={loading}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Marking…' : 'Mark Delivered'}
        </button>
      )}
    </div>
  )
}

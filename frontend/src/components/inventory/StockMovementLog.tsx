'use client'

import type { InventoryMovement, StockMovementType } from '@/types'

const movementColors: Record<StockMovementType, string> = {
  purchase: 'bg-emerald-100 text-emerald-700',
  transfer_in: 'bg-sky-100 text-sky-700',
  transfer_out: 'bg-violet-100 text-violet-700',
  consumption: 'bg-amber-100 text-amber-700',
  adjustment: 'bg-slate-100 text-slate-700',
  waste: 'bg-red-100 text-red-700',
}

type Props = {
  movements: InventoryMovement[]
  loading?: boolean
}

export default function StockMovementLog({ movements, loading = false }: Props) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }

  if (movements.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center">
        <p className="text-sm text-slate-500">No stock movements yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Item</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Type</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Delta</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Before</th>
              <th className="px-4 py-3 font-semibold text-slate-600">After</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.map((m) => (
              <tr key={m.movement_id} className="hover:bg-slate-50 transition">
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {m.inventory_item?.name ?? m.inventory_item_id.slice(0, 8)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${movementColors[m.movement_type]}`}>
                    {m.movement_type.replace('_', ' ')}
                  </span>
                </td>
                <td className={`px-4 py-3 font-semibold ${m.quantity_delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {m.quantity_delta >= 0 ? '+' : ''}{Number(m.quantity_delta).toFixed(3)}
                </td>
                <td className="px-4 py-3 text-slate-500">{Number(m.quantity_before).toFixed(3)}</td>
                <td className="px-4 py-3 text-slate-500">{Number(m.quantity_after).toFixed(3)}</td>
                <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{m.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

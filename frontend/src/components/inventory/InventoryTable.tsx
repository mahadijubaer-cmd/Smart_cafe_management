'use client'

import { useState } from 'react'
import { Edit2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import LowStockBadge from '@/components/inventory/LowStockBadge'
import type { InventoryItem } from '@/types'

type Props = {
  items: InventoryItem[]
  loading?: boolean
  onEdit?: (item: InventoryItem) => void
  onDelete?: (itemId: string) => void
}

export default function InventoryTable({ items, loading = false, onEdit, onDelete }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (itemId: string) => {
    if (!onDelete) return
    setDeletingId(itemId)
    try {
      await onDelete(itemId)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
        <p className="text-sm text-slate-500">No inventory items found.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-semibold text-slate-600">Name</th>
              <th className="px-4 py-3 font-semibold text-slate-600">SKU</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Category</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Unit</th>
              <th className="px-4 py-3 font-semibold text-slate-600">On Hand</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Reorder At</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Unit Cost</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
              {(onEdit || onDelete) ? <th className="px-4 py-3 font-semibold text-slate-600">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.item_id} className="hover:bg-slate-50 transition">
                <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                <td className="px-4 py-3 text-slate-500">{item.sku ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{item.inv_category?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{item.unit}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {Number(item.quantity_on_hand).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-slate-500">{Number(item.reorder_level).toFixed(2)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {item.unit_cost != null ? `৳ ${Number(item.unit_cost).toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <LowStockBadge item={item} />
                  {item.is_central ? (
                    <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      Central
                    </span>
                  ) : null}
                </td>
                {(onEdit || onDelete) ? (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {onEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 w-8 rounded-lg p-0"
                          onClick={() => onEdit(item)}
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 w-8 rounded-lg p-0 text-red-600 hover:border-red-300 hover:bg-red-50"
                          onClick={() => handleDelete(item.item_id)}
                          disabled={deletingId === item.item_id}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

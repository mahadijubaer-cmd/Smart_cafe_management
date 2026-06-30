'use client'

import type { InventoryItem } from '@/types'

type Props = {
  item: Pick<InventoryItem, 'quantity_on_hand' | 'reorder_level' | 'unit'>
}

export default function LowStockBadge({ item }: Props) {
  const isLow = item.quantity_on_hand <= item.reorder_level
  const isCritical = item.quantity_on_hand <= item.reorder_level * 0.5

  if (!isLow) return null

  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        isCritical
          ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-700',
      ].join(' ')}
    >
      {isCritical ? 'Critical' : 'Low stock'}
    </span>
  )
}

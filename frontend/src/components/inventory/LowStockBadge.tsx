'use client'

import { Badge } from '@/components/ui/badge'
import type { InventoryItem } from '@/types'

type Props = {
  item: Pick<InventoryItem, 'quantity_on_hand' | 'reorder_level' | 'unit'>
}

export default function LowStockBadge({ item }: Props) {
  const isLow = item.quantity_on_hand <= item.reorder_level
  const isCritical = item.quantity_on_hand <= item.reorder_level * 0.5

  if (!isLow) return null

  return (
    <Badge variant={isCritical ? 'destructive' : 'secondary'}>
      {isCritical ? 'Critical' : 'Low stock'}
    </Badge>
  )
}

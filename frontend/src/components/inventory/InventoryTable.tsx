'use client'

import { useState } from 'react'
import { Edit2, Package, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>No inventory items found</EmptyTitle>
          <EmptyDescription>Items you add will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const hasActions = Boolean(onEdit || onDelete)

  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>On Hand</TableHead>
            <TableHead>Reorder At</TableHead>
            <TableHead>Unit Cost</TableHead>
            <TableHead>Status</TableHead>
            {hasActions ? <TableHead>Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.item_id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{item.sku ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{item.inv_category?.name ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{item.unit}</TableCell>
              <TableCell className="font-semibold">
                {Number(item.quantity_on_hand).toFixed(2)}
              </TableCell>
              <TableCell className="text-muted-foreground">{Number(item.reorder_level).toFixed(2)}</TableCell>
              <TableCell className="text-muted-foreground">
                {item.unit_cost != null ? `৳ ${Number(item.unit_cost).toFixed(2)}` : '—'}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <LowStockBadge item={item} />
                  {item.is_central ? <Badge variant="outline">Central</Badge> : null}
                </div>
              </TableCell>
              {hasActions ? (
                <TableCell>
                  <div className="flex items-center gap-2">
                    {onEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => onEdit(item)}
                        title="Edit"
                      >
                        <Edit2 data-icon="inline-start" />
                      </Button>
                    ) : null}
                    {onDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(item.item_id)}
                        disabled={deletingId === item.item_id}
                        title="Delete"
                      >
                        <Trash2 data-icon="inline-start" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

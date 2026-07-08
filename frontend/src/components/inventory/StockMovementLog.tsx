'use client'

import { History } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge, type BadgeProps } from '@/components/ui/badge'
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
import type { InventoryMovement, StockMovementType } from '@/types'

const movementVariants: Record<StockMovementType, BadgeProps['variant']> = {
  purchase: 'default',
  transfer_in: 'secondary',
  transfer_out: 'secondary',
  consumption: 'outline',
  adjustment: 'outline',
  waste: 'destructive',
}

type Props = {
  movements: InventoryMovement[]
  loading?: boolean
}

export default function StockMovementLog({ movements, loading = false }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (movements.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No stock movements yet</EmptyTitle>
          <EmptyDescription>Movements will appear here once stock changes are recorded.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Delta</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => (
            <TableRow key={m.movement_id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </TableCell>
              <TableCell className="font-medium">
                {m.inventory_item?.name ?? m.inventory_item_id.slice(0, 8)}
              </TableCell>
              <TableCell>
                <Badge variant={movementVariants[m.movement_type]}>
                  {m.movement_type.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell
                className={cn(
                  'font-semibold',
                  m.quantity_delta >= 0 ? 'text-emerald-600' : 'text-destructive'
                )}
              >
                {m.quantity_delta >= 0 ? '+' : ''}{Number(m.quantity_delta).toFixed(3)}
              </TableCell>
              <TableCell className="text-muted-foreground">{Number(m.quantity_before).toFixed(3)}</TableCell>
              <TableCell className="text-muted-foreground">{Number(m.quantity_after).toFixed(3)}</TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">{m.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Clock, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
    <Card className={cn(isReady && 'border-green-200')}>
      <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0">
        {order.vendor_name && (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {order.vendor_name}
          </Badge>
        )}
        <Badge variant={isReady ? 'default' : 'secondary'} className="capitalize">
          {order.status}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Table2 className="size-4 text-muted-foreground" />
            {order.table_id ? `Table ${order.table_id}` : 'No table'}
          </span>
          <span className="flex items-center gap-1 text-xs">
            <Clock className="size-3" />
            {timeAgo(order.time_slot)}
          </span>
        </div>

        {order.items && order.items.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
          </p>
        )}

        <p className="text-sm font-semibold text-foreground">
          ৳{Number(order.total_amount).toFixed(0)}
        </p>
      </CardContent>

      {isReady && (
        <CardFooter>
          <Button type="button" className="w-full" onClick={handleDeliver} disabled={loading}>
            {loading ? 'Marking…' : 'Mark Delivered'}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Order } from '@/types'

const steps: { label: string; status: Order['status'] }[] = [
  { label: 'Placed', status: 'pending' },
  { label: 'Confirmed', status: 'confirmed' },
  { label: 'Preparing', status: 'preparing' },
  { label: 'Ready', status: 'ready' },
  { label: 'Delivered', status: 'delivered' },
]

const statusRank: Record<Order['status'], number> = {
  pending_confirmation: 0,
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: 0,
}

type OrderStatusTimelineProps = {
  status: Order['status']
}

export default function OrderStatusTimeline({ status }: OrderStatusTimelineProps) {
  const activeIndex = statusRank[status]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Status</CardTitle>
        <CardDescription>Live progress of your meal.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {steps.map((step, index) => {
          const isComplete = index < activeIndex
          const isCurrent = index === activeIndex

          return (
            <div key={step.label} className="flex items-center gap-4">
              <div className="flex w-10 items-center justify-center">
                <span
                  className={cn(
                    'size-4 rounded-full',
                    isComplete ? 'bg-emerald-600' : isCurrent ? 'animate-pulse bg-emerald-500' : 'bg-muted'
                  )}
                />
              </div>

              <div className="flex-1">
                <p className={cn('text-sm font-semibold', isCurrent ? 'text-emerald-700' : 'text-foreground')}>
                  {step.label}
                </p>
                {isCurrent ? <p className="text-xs text-emerald-600">Current step</p> : null}
              </div>

              {isComplete ? (
                <Badge variant="secondary" className="text-emerald-700">
                  Done
                </Badge>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

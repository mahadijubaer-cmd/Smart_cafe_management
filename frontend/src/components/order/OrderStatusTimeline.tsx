'use client'

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
    <div className="space-y-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-xl font-bold text-slate-900">Order Status</h3>
        <p className="mt-1 text-sm text-slate-500">Live progress of your meal.</p>
      </div>

      <div className="flex flex-col gap-4">
        {steps.map((step, index) => {
          const isComplete = index < activeIndex
          const isCurrent = index === activeIndex

          return (
            <div key={step.label} className="flex items-center gap-4">
              <div className="flex w-10 items-center justify-center">
                <span
                  className={`h-4 w-4 rounded-full ${
                    isComplete ? 'bg-emerald-600' : isCurrent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'
                  }`}
                />
              </div>

              <div className="flex-1">
                <p className={`text-sm font-semibold ${isCurrent ? 'text-emerald-700' : 'text-slate-700'}`}>{step.label}</p>
                {isCurrent ? <p className="text-xs text-emerald-600">Current step</p> : null}
              </div>

              {isComplete ? <span className="text-xs font-semibold text-emerald-600">Done</span> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
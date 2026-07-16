'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import apiClient from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { GuestOrder, GuestOrderGroup, OrderStatus } from '@/types'

const STATUS_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'pending_confirmation', label: 'Waiting for confirmation' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Delivered' },
]

// WS is the primary channel; this is only a safety-net poll in case the guest's
// connection drops silently (mobile browsers backgrounding the tab, etc.).
const FALLBACK_POLL_INTERVAL_MS = 20000
const WS_RECONNECT_DELAY_MS = 4000

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function TicketCard({ order }: { order: GuestOrder }) {
  const isCancelled = order.status === 'cancelled'
  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status)

  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {order.vendor_name ? order.vendor_name : `Order #${order.order_id.slice(0, 8)}`}
        </p>
        {order.payment_status === 'paid' ? (
          <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Paid</Badge>
        ) : null}
      </div>
      <h2 className="mt-1 text-xl font-black text-foreground">
        {isCancelled ? 'Cancelled' : STATUS_STEPS[currentStepIndex]?.label ?? order.status}
      </h2>

      {!isCancelled ? (
        <div className="mt-4 flex flex-col gap-2">
          {STATUS_STEPS.map((step, index) => {
            const done = currentStepIndex >= 0 && index <= currentStepIndex
            return (
              <div key={step.key} className="flex items-center gap-3">
                <span
                  className={[
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                    done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className={`text-sm ${done ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          This ticket was cancelled — it may have expired before being confirmed, or was rejected.
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm text-muted-foreground">
        {order.items.map((line, index) => (
          <li key={`${line.item_id}-${index}`} className="flex justify-between">
            <span>{line.quantity}×</span>
            <span className="flex-1 px-2">{line.menu_item?.name ?? line.item_id.slice(0, 8)}</span>
            <span>{formatCurrency(Number(line.subtotal))}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
        <span>Subtotal</span>
        <span>{formatCurrency(Number(order.total_amount))}</span>
      </div>
    </Card>
  )
}

export default function GuestOrderTrackPage() {
  const params = useParams<{ public_slug: string; guestToken: string }>()
  const [group, setGroup] = useState<GuestOrderGroup | null>(null)
  const [error, setError] = useState(false)
  const [live, setLive] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchGroup = async () => {
      try {
        const res = await apiClient.get<GuestOrderGroup>(`/public/orders/${params.guestToken}`)
        if (!cancelled) {
          setGroup(res.data)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    fetchGroup()
    const interval = window.setInterval(fetchGroup, FALLBACK_POLL_INTERVAL_MS)

    // Live channel: /ws/public/orders/{guest_token} — re-fetches on any event so
    // the UI always reflects full session state (event payloads are partial and
    // may originate from any sibling vendor order in a food-court session).
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null

    const connect = () => {
      if (cancelled) return
      const wsBaseUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000').replace(/\/$/, '')
      socket = new WebSocket(`${wsBaseUrl}/ws/public/orders/${params.guestToken}`)

      socket.onopen = () => {
        if (!cancelled) setLive(true)
      }
      socket.onmessage = () => {
        void fetchGroup()
      }
      socket.onclose = () => {
        if (cancelled) return
        setLive(false)
        reconnectTimer = window.setTimeout(connect, WS_RECONNECT_DELAY_MS)
      }
      socket.onerror = () => {
        socket?.close()
      }
    }
    connect()

    return () => {
      cancelled = true
      window.clearInterval(interval)
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [params.guestToken])

  if (error && !group) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 text-center">
        <p className="text-muted-foreground">Order not found or this tracking link has expired.</p>
      </main>
    )
  }

  if (!group) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Loading order…</p>
      </main>
    )
  }

  const isMultiVendor = group.orders.length > 1
  const guestName = group.orders[0]?.guest_name
  const tableLabel = group.orders[0]?.table_number ?? group.orders[0]?.table_id

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {guestName}
              {tableLabel ? ` · Table ${tableLabel}` : ''}
            </p>
            {isMultiVendor ? (
              <p className="text-xs text-muted-foreground">{group.orders.length} tickets from different stalls</p>
            ) : null}
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            {live ? 'Live' : 'Reconnecting…'}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {group.orders.map((order) => (
            <TicketCard key={order.order_id} order={order} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card px-6 py-4 font-bold text-foreground">
          <span>Grand total{group.orders.every((o) => o.payment_status === 'paid') ? ' (paid)' : ' (pay at counter)'}</span>
          <span>{formatCurrency(Number(group.total_amount))}</span>
        </div>
      </div>
    </main>
  )
}

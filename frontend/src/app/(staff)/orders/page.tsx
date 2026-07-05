'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import useWebSocket from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useStore } from '@/store/useStore'
import type { Order } from '@/types'

type OrderWithMeta = Order & {
  table_number?: string | null
  animate?: boolean
}

type ColumnKey = 'pending' | 'in_progress' | 'ready'

const columnConfig: Record<ColumnKey, { title: string; statuses: Order['status'][] }> = {
  pending: { title: 'Pending', statuses: ['pending_confirmation', 'pending'] },
  in_progress: { title: 'In Progress', statuses: ['confirmed', 'preparing'] },
  ready: { title: 'Ready', statuses: ['ready'] },
}

const statusStyles: Record<Order['status'], string> = {
  pending_confirmation: 'border-amber-300 bg-amber-50',
  pending: 'border-amber-300 bg-amber-50',
  confirmed: 'border-sky-300 bg-sky-50',
  preparing: 'border-violet-300 bg-violet-50',
  ready: 'border-emerald-300 bg-emerald-50',
  delivered: 'border-slate-200 bg-slate-50',
  cancelled: 'border-rose-200 bg-rose-50',
}

function formatTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function statusColumn(status: Order['status']): ColumnKey | null {
  if (status === 'pending_confirmation' || status === 'pending') return 'pending'
  if (status === 'confirmed' || status === 'preparing') return 'in_progress'
  if (status === 'ready') return 'ready'
  return null
}

function nextStatus(status: Order['status']): Order['status'] | null {
  switch (status) {
    case 'pending_confirmation':
      return 'confirmed'
    case 'pending':
      return 'confirmed'
    case 'confirmed':
      return 'preparing'
    case 'preparing':
      return 'ready'
    case 'ready':
      return 'delivered'
    default:
      return null
  }
}

function playSoftChime() {
  if (typeof window === 'undefined' || !window.AudioContext) {
    return
  }

  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) {
    return
  }

  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.value = 740
  gain.gain.value = 0.0001

  oscillator.connect(gain)
  gain.connect(context.destination)

  oscillator.start()
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25)
  oscillator.stop(context.currentTime + 0.27)

  oscillator.onended = () => {
    context.close().catch(() => undefined)
  }
}

function OrderCard({
  order,
  onAdvance,
}: {
  order: OrderWithMeta
  onAdvance: (orderId: string, status: Order['status']) => Promise<void>
}) {
  const [entered, setEntered] = useState(false)
  const status = order.status
  const nextStep = nextStatus(status)
  const isVisible = entered || !order.animate

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <article
      className={`rounded-3xl border-2 bg-white p-4 shadow-sm transition duration-500 ${statusStyles[status]} ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Table {order.table_number || order.table_id || 'N/A'}</p>
          <p className="mt-1 text-sm text-slate-500">{formatTime(order.time_slot)}</p>
          {order.order_source === 'guest_qr' || order.order_source === 'kiosk' ? (
            <span className="mt-1 inline-flex w-fit rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              Guest{order.guest_name ? ` · ${order.guest_name}` : ''}
            </span>
          ) : null}
        </div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm">
          {order.status.replace('_', ' ')}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Items</p>
          <ul className="mt-2 space-y-2">
            {(order.items || []).map((item) => (
              <li key={item.order_item_id} className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-sm">
                <span>{item.menu_item?.name || item.item_id}</span>
                <span className="font-semibold">x{item.quantity}</span>
              </li>
            ))}
          </ul>
        </div>

        {order.special_notes ? (
          <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{order.special_notes}</span>
        ) : null}
      </div>

      {nextStep ? (
        <div className="mt-5">
          <Button
            type="button"
            className="w-full bg-[#1A4D2E] text-white hover:bg-[#163f25]"
            onClick={() => onAdvance(order.order_id, nextStep)}
          >
            {nextStep === 'confirmed' ? 'Confirm Order' : nextStep === 'preparing' ? 'Start Preparing' : nextStep === 'ready' ? 'Mark Ready' : 'Mark Delivered'}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

export default function StaffOrdersPage() {
  const user = useStore((state) => state.user)
  const token = useStore((state) => state.token)
  const [orders, setOrders] = useState<OrderWithMeta[]>([])
  const [soundEnabled, setSoundEnabled] = useState(true)
  const ordersRef = useRef<OrderWithMeta[]>([])
  const animationTimersRef = useRef<number[]>([])

  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      animationTimersRef.current = []
    }
  }, [])

  const loadOrders = async () => {
    const response = await apiClient.get('/orders')
    const loaded = (response.data as Order[])
      .filter((order) => statusColumn(order.status) !== null)
      .map((order) => ({
        ...order,
        table_number: order.table_number ?? (order.table_id ? String(order.table_id) : null),
      }))

    setOrders(loaded)
  }

  useEffect(() => {
    loadOrders().catch(() => setOrders([]))
  }, [])

  const handleMessage = useMemo(
    () => (event: Record<string, unknown>) => {
      if (event.type !== 'ORDER_PLACED' || !event.order_id) {
        return
      }

      if (soundEnabled) {
        playSoftChime()
      }

      const orderId = String(event.order_id)
      if (ordersRef.current.some((order) => order.order_id === orderId)) {
        return
      }

      void apiClient.get(`/orders/${orderId}`).then((response) => {
        const incoming = response.data as Order
        const column = statusColumn(incoming.status)
        if (!column) {
          return
        }

        setOrders((current) => {
          if (current.some((order) => order.order_id === orderId)) {
            return current
          }

          const inserted = {
            ...incoming,
            table_number: String(event.table_number || incoming.table_number || incoming.table_id || 'N/A'),
            animate: true,
          }

          const nextOrders = [inserted, ...current]
          const timer = window.setTimeout(() => {
            setOrders((previous) => previous.map((order) => (order.order_id === orderId ? { ...order, animate: false } : order)))
          }, 600)
          animationTimersRef.current.push(timer)

          return nextOrders
        })
      }).catch(() => undefined)
    },
    [soundEnabled],
  )

  useWebSocket(user?.user_id || '', token || '', handleMessage)

  const advanceOrder = async (orderId: string, status: Order['status']) => {
    await apiClient.patch(`/orders/${orderId}/status`, { status })
    setOrders((current) =>
      current.map((order) => (order.order_id === orderId ? { ...order, status } : order)),
    )
  }

  const visibleOrders = useMemo(
    () => orders.filter((order) => statusColumn(order.status) !== null),
    [orders],
  )

  const columns = useMemo(
    () => ({
      pending: visibleOrders.filter((order) => statusColumn(order.status) === 'pending'),
      in_progress: visibleOrders.filter((order) => statusColumn(order.status) === 'in_progress'),
      ready: visibleOrders.filter((order) => statusColumn(order.status) === 'ready'),
    }),
    [visibleOrders],
  )

  return (
    <ProtectedRoute allowedRoles={["staff", "admin"]}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#F5F0E8_0%,#ffffff_32%,#eef5ee_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
                Staff orders
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Kitchen queue</h1>
              <CardDescription className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                Live order board updated through websocket events.
              </CardDescription>
            </div>

            <Button type="button" variant="outline" onClick={() => setSoundEnabled((current) => !current)}>
              Sound: {soundEnabled ? 'On' : 'Off'}
            </Button>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            {(Object.keys(columnConfig) as ColumnKey[]).map((columnKey) => (
              <Card key={columnKey} className="bg-slate-50/80">
                <CardHeader>
                  <CardTitle className="text-xl">{columnConfig[columnKey].title}</CardTitle>
                  <CardDescription>{columns[columnKey].length} orders</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {columns[columnKey].length > 0 ? (
                    columns[columnKey].map((order) => (
                      <OrderCard key={order.order_id} order={order} onAdvance={advanceOrder} />
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
                      No orders here yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </ProtectedRoute>
  )
}
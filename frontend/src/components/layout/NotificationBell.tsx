'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  ShoppingCart,
  Wrench,
} from 'lucide-react'

import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'

interface NotifItem {
  notif_id: string
  type: string
  message: string
  is_read: boolean
  created_at: string
}

function typeIcon(type: string) {
  if (type.startsWith('ORDER')) return <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
  if (type === 'LOW_STOCK') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
  if (type === 'TABLE_UPDATE') return <Wrench className="h-3.5 w-3.5 shrink-0" />
  return <Bell className="h-3.5 w-3.5 shrink-0" />
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationBell() {
  const params = useParams<{ tenant_slug?: string }>()
  const slug = params?.tenant_slug ?? ''
  const notifications = useStore((s) => s.notifications)

  const [items, setItems] = useState<NotifItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications?limit=5')
      setItems(res.data.items ?? [])
      setUnread(res.data.unread_count ?? 0)
    } catch {
      // swallow — user may not be logged in
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Increment badge on any WS event
  useEffect(() => {
    const last = notifications[0]
    if (last) {
      setUnread((c) => c + 1)
    }
  }, [notifications])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkAllRead = async () => {
    try {
      await apiClient.post('/notifications/read-all')
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {
      //
    }
  }

  const handleItemClick = async (notif: NotifItem) => {
    if (!notif.is_read) {
      try {
        await apiClient.patch(`/notifications/${notif.notif_id}/read`)
        setItems((prev) =>
          prev.map((n) => (n.notif_id === notif.notif_id ? { ...n, is_read: true } : n))
        )
        setUnread((c) => Math.max(0, c - 1))
      } catch {
        //
      }
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) load()
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:bg-gray-50"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-bold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <div className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.notif_id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={[
                    'flex w-full gap-3 px-4 py-3 text-left transition hover:bg-gray-50',
                    n.is_read ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <span className="mt-0.5 shrink-0 text-gray-500">{typeIcon(n.type)}</span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'truncate text-xs text-gray-800',
                        n.is_read ? 'font-normal' : 'font-semibold',
                      ].join(' ')}
                    >
                      {n.message}
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-400">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <Link
              href={`/${slug}/notifications`}
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

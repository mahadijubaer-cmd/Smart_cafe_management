'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ShoppingCart,
  Wrench,
} from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api'

interface NotifItem {
  notif_id: string
  type: string
  message: string
  is_read: boolean
  created_at: string
}

type FilterTab = 'all' | 'orders' | 'inventory' | 'cleaning' | 'system'

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'orders', label: 'Orders' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'system', label: 'System' },
]

function typeMatchesTab(type: string, tab: FilterTab): boolean {
  if (tab === 'all') return true
  if (tab === 'orders') return type.startsWith('ORDER')
  if (tab === 'inventory') return type === 'LOW_STOCK'
  if (tab === 'cleaning') return type === 'TABLE_UPDATE' || type === 'CLEANING'
  return tab === 'system'
}

function typeIcon(type: string) {
  if (type.startsWith('ORDER')) return <ShoppingCart className="h-4 w-4 text-primary" />
  if (type === 'LOW_STOCK') return <AlertTriangle className="h-4 w-4 text-amber-500" />
  if (type === 'TABLE_UPDATE') return <Wrench className="h-4 w-4 text-slate-400" />
  return <Bell className="h-4 w-4 text-slate-400" />
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsPage() {
  const params = useParams<{ tenant_slug: string }>()

  const [items, setItems] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [skip, setSkip] = useState(0)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const LIMIT = 20

  const load = useCallback(async (reset = false) => {
    const offset = reset ? 0 : skip
    try {
      const res = await apiClient.get(`/notifications?skip=${offset}&limit=${LIMIT}`)
      const newItems: NotifItem[] = res.data.items ?? []
      if (reset) {
        setItems(newItems)
        setSkip(LIMIT)
      } else {
        setItems((prev) => [...prev, ...newItems])
        setSkip((s) => s + LIMIT)
      }
      setHasMore(newItems.length === LIMIT)
    } finally {
      setLoading(false)
    }
  }, [skip])

  useEffect(() => {
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMarkAllRead = async () => {
    try {
      const res = await apiClient.post('/notifications/read-all')
      const count = res.data.marked_read ?? 0
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
      toast.success(`${count} notification${count !== 1 ? 's' : ''} marked as read.`)
    } catch {
      toast.error('Failed to mark notifications as read.')
    }
  }

  const handleMarkRead = async (notif: NotifItem) => {
    if (notif.is_read) return
    try {
      await apiClient.patch(`/notifications/${notif.notif_id}/read`)
      setItems((prev) =>
        prev.map((n) => (n.notif_id === notif.notif_id ? { ...n, is_read: true } : n))
      )
    } catch {
      //
    }
  }

  const filtered = items.filter((n) => typeMatchesTab(n.type, activeTab))
  const unreadCount = items.filter((n) => !n.is_read).length

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="mt-0.5 text-sm text-slate-500">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition',
              activeTab === tab.id
                ? 'bg-primary text-white'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No notifications here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {filtered.map((n, i) => (
            <button
              key={n.notif_id}
              type="button"
              onClick={() => handleMarkRead(n)}
              className={[
                'flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-slate-50',
                i !== filtered.length - 1 ? 'border-b border-slate-50' : '',
                n.is_read ? '' : 'border-l-4 border-l-primary',
              ].join(' ')}
            >
              <span className="mt-0.5 shrink-0">{typeIcon(n.type)}</span>
              <div className="min-w-0 flex-1">
                <p
                  className={[
                    'text-sm text-slate-800',
                    n.is_read ? 'font-normal' : 'font-semibold',
                  ].join(' ')}
                >
                  {n.message}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <button
          type="button"
          onClick={() => load(false)}
          className="mt-4 w-full rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Load more
        </button>
      )}
    </div>
  )
}

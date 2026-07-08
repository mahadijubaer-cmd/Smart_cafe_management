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
import { toast } from 'sonner'
import apiClient from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

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
  if (type.startsWith('ORDER')) return <ShoppingCart className="size-4 text-primary" />
  if (type === 'LOW_STOCK') return <AlertTriangle className="size-4 text-amber-500" />
  if (type === 'TABLE_UPDATE') return <Wrench className="size-4 text-muted-foreground" />
  return <Bell className="size-4 text-muted-foreground" />
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
          <h1 className="text-2xl font-black">Notifications</h1>
          {unreadCount > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button type="button" variant="outline" onClick={handleMarkAllRead}>
            <CheckCheck data-icon="inline-start" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)} className="mb-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="rounded-full border border-input px-4 py-1.5 data-[state=active]:border-transparent"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell />
            </EmptyMedia>
            <EmptyTitle>No notifications</EmptyTitle>
            <EmptyDescription>You don&apos;t have any notifications here yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {filtered.map((n, i) => (
            <button
              key={n.notif_id}
              type="button"
              onClick={() => handleMarkRead(n)}
              className={cn(
                'flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-muted/50',
                i !== filtered.length - 1 && 'border-b',
                !n.is_read && 'border-l-4 border-l-primary'
              )}
            >
              <span className="mt-0.5 shrink-0">{typeIcon(n.type)}</span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', n.is_read ? 'font-normal text-foreground' : 'font-semibold text-foreground')}>
                  {n.message}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
              </div>
              {!n.is_read && <Badge className="mt-2 size-2 shrink-0 rounded-full p-0" />}
            </button>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => load(false)}>
          Load more
        </Button>
      )}
    </div>
  )
}

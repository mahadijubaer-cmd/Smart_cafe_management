'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface NotifItem {
  notif_id: string
  type: string
  message: string
  is_read: boolean
  created_at: string
}

function typeIcon(type: string) {
  if (type.startsWith('ORDER')) return <ShoppingCart className="size-3.5 shrink-0" />
  if (type === 'LOW_STOCK') return <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
  if (type === 'TABLE_UPDATE') return <Wrench className="size-3.5 shrink-0" />
  return <Bell className="size-3.5 shrink-0" />
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
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) load()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative rounded-full" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <Badge variant="destructive" className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-bold">Notifications</span>
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
        <DropdownMenuSeparator className="m-0" />

        <ScrollArea className="max-h-72">
          <DropdownMenuGroup>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <DropdownMenuItem
                  key={n.notif_id}
                  onSelect={(e) => {
                    e.preventDefault()
                    handleItemClick(n)
                  }}
                  className={cn('flex items-start gap-3 whitespace-normal px-4 py-3', n.is_read && 'opacity-60')}
                >
                  <span className="mt-0.5 shrink-0 text-muted-foreground">{typeIcon(n.type)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-xs', n.is_read ? 'font-normal' : 'font-semibold')}>
                      {n.message}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && <Badge className="mt-1.5 size-2 shrink-0 rounded-full p-0" />}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
        </ScrollArea>

        <DropdownMenuSeparator className="m-0" />
        <div className="px-4 py-2 text-center">
          <Link
            href={`/${slug}/notifications`}
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

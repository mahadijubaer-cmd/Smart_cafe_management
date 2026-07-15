'use client'

/**
 * Signage device shell (RFC-010 — specs/modules/signage.md).
 *
 * Wires the data-source-agnostic `SignageRenderer` to /device/* (the signage
 * counterpart to KioskApp's device shell). Caches the last-known-good
 * playlist/menu/trending in localStorage so a reboot renders instantly
 * offline (SGN-2); the order board is refreshed on WS events with a polling
 * fallback for when the socket is down.
 */
import { useCallback, useEffect, useState } from 'react'

import type { DeviceLang } from '@/components/device/strings'
import type { KioskMenu } from '@/components/kiosk/KioskApp'
import SignageRenderer, {
  type BoardOrder,
  type SignageSlideShape,
  type TrendingItem,
} from '@/components/signage/SignageRenderer'
import { useDeviceWebSocket } from '@/hooks/useDeviceWebSocket'
import deviceApi, { type DeviceProfile } from '@/lib/deviceApi'

const CACHE_KEY = 'scms_signage_cache'
const ACTIVE_STATUSES = new Set(['pending_confirmation', 'confirmed', 'preparing', 'ready'])

interface SignageCache {
  slides: SignageSlideShape[]
  menu: KioskMenu | null
  trending: TrendingItem[]
}

function loadCache(): SignageCache {
  if (typeof window === 'undefined') return { slides: [], menu: null, trending: [] }
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as SignageCache) : { slides: [], menu: null, trending: [] }
  } catch {
    return { slides: [], menu: null, trending: [] }
  }
}

function saveCache(cache: SignageCache) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* storage full/unavailable — cache is best-effort */
  }
}

export default function SignageApp({ profile }: { profile: DeviceProfile }) {
  const initial = loadCache()
  const [slides, setSlides] = useState<SignageSlideShape[]>(initial.slides)
  const [menu, setMenu] = useState<KioskMenu | null>(initial.menu)
  const [trending, setTrending] = useState<TrendingItem[]>(initial.trending)
  const [board, setBoard] = useState<BoardOrder[]>([])
  const lang = ((profile.settings?.default_lang as DeviceLang | undefined) ?? 'en') as DeviceLang

  const loadPlaylist = useCallback(async () => {
    try {
      const res = await deviceApi.get('/device/playlist')
      setSlides((res.data as { slides: SignageSlideShape[] }).slides)
    } catch {
      /* offline — keep cached slides (SGN-2) */
    }
  }, [])

  const loadMenu = useCallback(async () => {
    try {
      const res = await deviceApi.get('/device/menu')
      setMenu(res.data as KioskMenu)
    } catch {
      /* keep cached menu */
    }
  }, [])

  const loadTrending = useCallback(async () => {
    try {
      const res = await deviceApi.get('/device/trending')
      setTrending((res.data as { items: TrendingItem[] }).items)
    } catch {
      /* keep cached trending */
    }
  }, [])

  const loadBoard = useCallback(async () => {
    try {
      const res = await deviceApi.get('/device/orders/board')
      setBoard((res.data as { orders: BoardOrder[] }).orders)
    } catch {
      /* board goes stale until reconnect/poll succeeds */
    }
  }, [])

  useEffect(() => {
    void loadPlaylist()
    void loadMenu()
    void loadTrending()
    void loadBoard()
    const playlistInterval = setInterval(() => void loadPlaylist(), 5 * 60_000)
    const menuInterval = setInterval(() => void loadMenu(), 5 * 60_000)
    const trendingInterval = setInterval(() => void loadTrending(), 10 * 60_000)
    const boardInterval = setInterval(() => void loadBoard(), 30_000)
    return () => {
      clearInterval(playlistInterval)
      clearInterval(menuInterval)
      clearInterval(trendingInterval)
      clearInterval(boardInterval)
    }
  }, [loadPlaylist, loadMenu, loadTrending, loadBoard])

  useEffect(() => {
    saveCache({ slides, menu, trending })
  }, [slides, menu, trending])

  const { online } = useDeviceWebSocket(profile.device_id, (event) => {
    switch (event.type) {
      case 'PLAYLIST_UPDATED':
        void loadPlaylist()
        break
      case 'ORDER_PLACED':
        void loadBoard()
        break
      case 'ORDER_CONFIRMED':
      case 'ORDER_PREPARING':
      case 'ORDER_READY': {
        const orderId = event.order_id as string
        const status = event.status as string
        const pickupNumber = (event.pickup_number as number | null) ?? null
        setBoard((prev) => {
          if (!prev.some((o) => o.order_id === orderId)) {
            return pickupNumber == null
              ? prev
              : [...prev, { order_id: orderId, pickup_number: pickupNumber, status }]
          }
          return prev.map((o) => (o.order_id === orderId ? { ...o, status } : o))
        })
        break
      }
      case 'ORDER_DELIVERED': {
        const orderId = event.order_id as string
        setBoard((prev) => prev.filter((o) => o.order_id !== orderId))
        break
      }
      default:
        break
    }
  })

  return (
    <SignageRenderer
      slides={slides}
      menu={menu}
      boardOrders={board.filter((o) => ACTIVE_STATUSES.has(o.status))}
      trending={trending}
      tenantName={profile.tenant_name}
      lang={lang}
      online={online}
    />
  )
}

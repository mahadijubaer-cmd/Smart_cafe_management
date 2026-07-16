'use client'

/**
 * Full-screen signage preview (RFC-010, Phase 25.5 — specs/modules/signage.md SGN-6).
 * Renders the saved (persisted) playlist through the same admin-JWT preview
 * endpoints the side-by-side pane uses, so this always matches what a paired
 * display would show.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'

import SignageRenderer, {
  type BoardOrder,
  type SignageSlideShape,
  type TrendingItem,
} from '@/components/signage/SignageRenderer'
import type { KioskMenu } from '@/components/kiosk/KioskApp'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import { useTenantInfo } from '@/hooks/useTenantInfo'

export default function SignagePreviewPage() {
  const params = useParams<{ tenant_slug: string; playlist_id: string }>()
  const router = useRouter()
  const slug = params.tenant_slug
  const token = useStore((state) => state.token)
  const hasHydrated = useStore((state) => state.hasHydrated)
  const { tenant } = useTenantInfo(slug)

  const [slides, setSlides] = useState<SignageSlideShape[]>([])
  const [menu, setMenu] = useState<KioskMenu | null>(null)
  const [board, setBoard] = useState<BoardOrder[]>([])
  const [trending, setTrending] = useState<TrendingItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) router.replace(`/${slug}/login`)
  }, [hasHydrated, router, slug, token])

  useEffect(() => {
    if (!token) return
    Promise.all([
      apiClient.get(`/signage/playlists/${params.playlist_id}/preview`),
      apiClient.get('/signage/preview/menu'),
      apiClient.get('/signage/preview/board'),
      apiClient.get('/signage/preview/trending'),
    ])
      .then(([playlistRes, menuRes, boardRes, trendingRes]) => {
        setSlides(playlistRes.data.slides as SignageSlideShape[])
        setMenu(menuRes.data as KioskMenu)
        setBoard((boardRes.data as { orders: BoardOrder[] }).orders)
        setTrending((trendingRes.data as { items: TrendingItem[] }).items)
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [token, params.playlist_id])

  useEffect(() => {
    if (!token) return
    const interval = setInterval(() => {
      apiClient
        .get('/signage/preview/board')
        .then((res) => setBoard((res.data as { orders: BoardOrder[] }).orders))
        .catch(() => undefined)
    }, 15_000)
    return () => clearInterval(interval)
  }, [token])

  if (!loaded) return null

  return (
    <div className="relative min-h-screen">
      <Link
        href={`/${slug}/signage`}
        className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg"
        aria-label="Exit preview"
      >
        <X className="h-5 w-5" />
      </Link>
      <SignageRenderer
        slides={slides}
        menu={menu}
        boardOrders={board}
        trending={trending}
        tenantName={tenant?.name ?? slug}
        lang="en"
        online
      />
    </div>
  )
}

'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { LogOut, Sparkles } from 'lucide-react'

import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'

export default function CleanerLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const token = useStore((state) => state.token)
  const setUser = useStore((state) => state.setUser)
  const clearAuth = useStore((state) => state.clearAuth)
  const hasHydrated = useStore((state) => state.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) router.replace(`/${slug}/login`)
  }, [hasHydrated, router, slug, token])

  // Keeps `user` (and therefore useWebSocket's user_id) in sync with whoever the token
  // actually belongs to — without this, a stale `user` from a previous login on this
  // browser silently persists and every WebSocket connection uses the wrong user_id
  // (rejected by the backend). Mirrors [tenant_slug]/(customer)/layout.tsx's syncUser.
  useEffect(() => {
    if (!token) return
    let mounted = true
    apiClient
      .get('/auth/me')
      .then((response) => {
        if (mounted) setUser(response.data)
      })
      .catch(() => {
        if (!mounted) return
        clearAuth()
        router.replace(`/${slug}/login`)
      })
    return () => { mounted = false }
  }, [clearAuth, router, setUser, slug, token])

  const handleLogout = () => {
    clearAuth()
    router.push(`/${slug}/login`)
  }

  if (!hasHydrated) return null

  return (
    <div className="min-h-screen bg-muted/30">
      <nav className="flex items-center justify-between gap-4 bg-primary px-4 py-3 text-primary-foreground shadow-md sm:px-6">
        <Link
          href={`/${slug}/cleaning-queue`}
          className="flex min-w-0 items-center gap-2 truncate text-lg font-bold tracking-tight"
        >
          <Sparkles className="size-5 shrink-0" />
          <span className="truncate">Cleaner — Table Assignments</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
          onClick={handleLogout}
        >
          <LogOut data-icon="inline-start" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}

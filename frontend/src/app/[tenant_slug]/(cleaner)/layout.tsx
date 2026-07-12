'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { LogOut, Sparkles } from 'lucide-react'

import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'

export default function CleanerLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const token = useStore((state) => state.token)
  const clearAuth = useStore((state) => state.clearAuth)
  const hasHydrated = useStore((state) => state.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) router.replace(`/${slug}/login`)
  }, [hasHydrated, router, slug, token])

  const handleLogout = () => {
    clearAuth()
    router.push(`/${slug}/login`)
  }

  if (!hasHydrated) return null

  return (
    <div className="min-h-screen bg-muted/30">
      <nav className="flex items-center justify-between bg-primary px-6 py-3 text-primary-foreground shadow-md">
        <Link href={`/${slug}/cleaning-queue`} className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Sparkles className="size-5" />
          Cleaner — Table Assignments
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
          onClick={handleLogout}
        >
          <LogOut data-icon="inline-start" />
          Logout
        </Button>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}

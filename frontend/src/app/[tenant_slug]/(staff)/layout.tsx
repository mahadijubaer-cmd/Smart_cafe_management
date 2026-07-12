'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, LogOut, PlusSquare, ShoppingBag, UtensilsCrossed } from 'lucide-react'

import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_DEFS = [
  { label: 'Kitchen Queue', path: 'kitchen-queue', icon: ShoppingBag },
  { label: 'Dashboard', path: 'dashboard', icon: LayoutDashboard },
  { label: 'Menu', path: 'menu-availability', icon: UtensilsCrossed },
  { label: 'New Order (POS)', path: 'pos', icon: PlusSquare },
]

export default function StaffLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
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
      <nav className="flex items-center justify-between gap-4 bg-primary px-4 py-3 text-primary-foreground shadow-md sm:px-6">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
          {NAV_DEFS.map((item) => {
            const href = `/${slug}/${item.path}`
            const active = pathname === href || pathname.startsWith(`${href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                href={href}
                className={cn(
                  'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition',
                  active
                    ? 'bg-white/15 text-primary-foreground'
                    : 'text-primary-foreground/75 hover:bg-white/10 hover:text-primary-foreground'
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
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

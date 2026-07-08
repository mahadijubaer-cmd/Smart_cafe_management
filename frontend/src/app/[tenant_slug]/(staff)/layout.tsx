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

  useEffect(() => {
    if (!token) router.replace(`/${slug}/login`)
  }, [router, slug, token])

  const handleLogout = () => {
    clearAuth()
    router.push(`/${slug}/login`)
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <nav className="flex items-center justify-between gap-4 bg-primary px-6 py-3 text-primary-foreground shadow-md">
        <div className="flex flex-wrap items-center gap-6">
          {NAV_DEFS.map((item, index) => {
            const href = `/${slug}/${item.path}`
            const active = pathname === href || pathname.startsWith(`${href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                href={href}
                className={cn(
                  'flex items-center gap-2 text-sm transition',
                  index === 0 ? 'text-lg font-bold tracking-tight' : 'text-primary-foreground/80 hover:text-primary-foreground',
                  active && index !== 0 && 'font-semibold text-primary-foreground'
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

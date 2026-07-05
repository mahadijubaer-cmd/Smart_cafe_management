'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  ChefHat,
  LayoutDashboard,
  Menu,
  Table2,
  Truck,
  UtensilsCrossed,
  X,
} from 'lucide-react'

import { useStore } from '@/store/useStore'
import type { UserRole } from '@/types'

type NavItem = { label: string; path: string; icon: ReactNode; roles: UserRole[] }

const NAV: NavItem[] = [
  {
    label: 'Dashboard',
    path: 'dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
    roles: ['food_court_admin'],
  },
  {
    label: 'Unified Menu',
    path: 'unified-menu',
    icon: <UtensilsCrossed className="h-4 w-4" />,
    roles: ['food_court_admin', 'server', 'customer'],
  },
  {
    label: 'Delivery Queue',
    path: 'deliver',
    icon: <Truck className="h-4 w-4" />,
    roles: ['food_court_admin', 'server'],
  },
  {
    label: 'Tables',
    path: 'tables',
    icon: <Table2 className="h-4 w-4" />,
    roles: ['food_court_admin', 'server'],
  },
  {
    label: 'Analytics',
    path: 'analytics',
    icon: <BarChart3 className="h-4 w-4" />,
    roles: ['food_court_admin'],
  },
]

export default function FoodCourtLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const pathname = usePathname()

  const token = useStore((s) => s.token)
  const tenantType = useStore((s) => s.tenantType)
  const tenantSlug = useStore((s) => s.tenantSlug)
  const user = useStore((s) => s.user)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Auth guard
  useEffect(() => {
    if (!token) {
      router.replace(`/${slug}/login`)
      return
    }
    if (tenantType !== 'food_court') {
      router.replace(`/${tenantSlug ?? slug}/dashboard`)
    }
  }, [token, tenantType, tenantSlug, slug, router])

  const role = user?.role as UserRole | undefined
  const visibleNav = NAV.filter((n) => !role || n.roles.includes(role))

  const NavLinks = () => (
    <>
      {visibleNav.map((item) => {
        const href = `/${slug}/${item.path}`
        const active = pathname?.includes(`/${item.path}`)
        return (
          <Link
            key={item.path}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={[
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {item.icon}
            {item.label}
          </Link>
        )
      })}
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-1">
          <ChefHat className="h-5 w-5 text-primary" />
          <span className="text-sm font-black text-slate-900">Food Court</span>
        </div>
        <nav className="flex flex-col gap-1">
          <NavLinks />
        </nav>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-64 flex-col bg-white p-4 shadow-xl transition-transform lg:hidden',
          mobileOpen ? 'flex translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <span className="font-black text-slate-900">Food Court</span>
          </div>
          <button type="button" onClick={() => setMobileOpen(false)}>
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          <NavLinks />
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button type="button" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <ChefHat className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-slate-900">Food Court</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}

'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Box,
  Download,
  FileText,
  LayoutDashboard,
  Menu,
  Settings,
  ShoppingBag,
  Table2,
  Users,
  UtensilsCrossed,
  Warehouse,
  X,
} from 'lucide-react'

import { useStore } from '@/store/useStore'
import type { TenantType } from '@/types'

type NavItem = {
  label: string
  path: string
  icon: ReactNode
  allowedTypes?: TenantType[]
}

const NAV_DEFS: NavItem[] = [
  { label: 'Dashboard', path: 'dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Orders', path: 'orders', icon: <ShoppingBag className="h-4 w-4" /> },
  { label: 'Tables', path: 'tables', icon: <Table2 className="h-4 w-4" /> },
  { label: 'Menu', path: 'menu', icon: <UtensilsCrossed className="h-4 w-4" /> },
  { label: 'Inventory', path: 'inventory', icon: <Box className="h-4 w-4" /> },
  {
    label: 'Central Inventory',
    path: 'inventory/central',
    icon: <Warehouse className="h-4 w-4" />,
    allowedTypes: ['franchise_brand'],
  },
  { label: 'Users', path: 'users', icon: <Users className="h-4 w-4" /> },
  { label: 'Analytics', path: 'analytics', icon: <BarChart3 className="h-4 w-4" /> },
  { label: 'Reports', path: 'reports', icon: <Download className="h-4 w-4" /> },
  { label: 'Memo', path: 'memo', icon: <FileText className="h-4 w-4" /> },
  { label: 'Settings', path: 'settings', icon: <Settings className="h-4 w-4" /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const token = useStore((state) => state.token)
  const tenantType = useStore((state) => state.tenantType)
  const clearAuth = useStore((state) => state.clearAuth)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!token) router.replace(`/${slug}/login`)
  }, [router, slug, token])

  const handleLogout = () => {
    clearAuth()
    router.push(`/${slug}/login`)
  }

  const visibleNav = NAV_DEFS.filter((item) =>
    !item.allowedTypes || (tenantType && item.allowedTypes.includes(tenantType))
  )

  const NavLinks = () => (
    <ul className="space-y-1">
      {visibleNav.map((item) => {
        const href = `/${slug}/${item.path}`
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <li key={item.path}>
            <Link
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={[
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-primary">
          <span className="text-xl" aria-hidden="true">🍽</span>
          <span className="font-bold tracking-tight">SCMS Admin</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">{slug}</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks />
      </nav>
      <div className="border-t border-slate-200 px-3 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#f9fafb]">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      ) : null}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-primary">SCMS Admin</span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-medium text-red-500"
          >
            Logout
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

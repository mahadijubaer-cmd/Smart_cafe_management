'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Box,
  Download,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  MonitorSmartphone,
  QrCode,
  Settings,
  ShoppingBag,
  Store,
  Table2,
  UserPlus,
  Users,
  UtensilsCrossed,
  Warehouse,
} from 'lucide-react'

import { getClaimsFromToken, getRoleFromToken } from '@/lib/auth'
import { useTenantInfo } from '@/hooks/useTenantInfo'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import type { TenantType, UserRole } from '@/types'
import { Button } from '@/components/ui/button'
import CommandPalette from '@/components/layout/CommandPalette'
import SiteFooter from '@/components/layout/SiteFooter'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

type NavItem = {
  label: string
  path: string
  icon: ReactNode
  allowedTypes?: TenantType[]
  allowedRoles?: UserRole[]
  /** Absolute href instead of `/${slug}/${path}` — used by pages outside the tenant_slug tree. */
  absolute?: boolean
}

// ✅ [Phase 24 — RFC-009] Platform section — gated by ROLE (platform_admin), not tenant_type;
// these pages live under (platform)/admin/*, outside the [tenant_slug] route tree.
const PLATFORM_NAV_DEFS: NavItem[] = [
  { label: 'Platform Tenants', path: '/admin/tenants', icon: <Store />, absolute: true, allowedRoles: ['platform_admin'] },
  { label: 'Subscriptions', path: '/admin/subscriptions', icon: <BarChart3 />, absolute: true, allowedRoles: ['platform_admin'] },
  { label: 'Platform Analytics', path: '/admin/analytics', icon: <BarChart3 />, absolute: true, allowedRoles: ['platform_admin'] },
  { label: 'Audit Log', path: '/admin/audit-log', icon: <History />, absolute: true, allowedRoles: ['platform_admin'] },
]

// Mirrors backend ADMIN_ROLES (app/core/dependencies.py) — the floor-staff roles
// (staff, server, cleaner) must never see tenant-configuration nav items, only the
// operational ones (Orders, Tables) they're actually allowed to use.
const _ADMIN_ROLES: UserRole[] = ['platform_admin', 'super_admin', 'outlet_admin', 'tenant_admin', 'food_court_admin']

const NAV_DEFS: NavItem[] = [
  { label: 'Dashboard', path: 'dashboard', icon: <LayoutDashboard />, allowedRoles: _ADMIN_ROLES },
  { label: 'Orders', path: 'orders', icon: <ShoppingBag /> },
  { label: 'Tables', path: 'tables', icon: <Table2 /> },
  { label: 'Menu', path: 'menu-management', icon: <UtensilsCrossed />, allowedRoles: _ADMIN_ROLES },
  {
    label: 'Inventory',
    path: 'inventory',
    icon: <Box />,
    // The food-court parent tenant has no inventory of its own (specs/modules/inventory.md) —
    // /inventory/* rejects food_court_admin with 403. Hide the nav entry accordingly.
    allowedRoles: ['platform_admin', 'super_admin', 'outlet_admin', 'tenant_admin'],
  },
  {
    label: 'Central Inventory',
    path: 'inventory/central',
    icon: <Warehouse />,
    allowedTypes: ['franchise_brand'],
  },
  {
    label: 'Outlets',
    path: 'outlets',
    icon: <Store />,
    allowedTypes: ['franchise_brand'],
  },
  { label: 'Users', path: 'users', icon: <Users />, allowedRoles: _ADMIN_ROLES },
  {
    label: 'Public Link',
    path: 'public-link',
    icon: <QrCode />,
    // All tenant types may publish a public menu — restaurant segment gets guest
    // ordering, cafeteria segment gets read-only browsing only (RFC-007 Phase D).
    allowedRoles: _ADMIN_ROLES,
  },
  // ❌→✅ Phase 25.2 (RFC-010): kiosk/signage terminal registry + pairing
  { label: 'Devices', path: 'devices', icon: <MonitorSmartphone />, allowedRoles: _ADMIN_ROLES },
  // ❌→✅ Phase 25.5 (RFC-010): kiosk customization + signage playlist editors w/ live preview
  { label: 'Kiosk Settings', path: 'kiosk-settings', icon: <MonitorSmartphone />, allowedRoles: _ADMIN_ROLES },
  { label: 'Signage', path: 'signage', icon: <MonitorPlay />, allowedRoles: _ADMIN_ROLES },
  { label: 'Analytics', path: 'analytics', icon: <BarChart3 />, allowedRoles: _ADMIN_ROLES },
  { label: 'Reports', path: 'reports', icon: <Download />, allowedRoles: _ADMIN_ROLES },
  { label: 'Memo', path: 'memo', icon: <FileText />, allowedRoles: _ADMIN_ROLES },
  { label: 'Settings', path: 'settings', icon: <Settings />, allowedRoles: _ADMIN_ROLES },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const token = useStore((state) => state.token)
  const tenantType = useStore((state) => state.tenantType)
  const setUser = useStore((state) => state.setUser)
  const clearAuth = useStore((state) => state.clearAuth)
  const hasHydrated = useStore((state) => state.hasHydrated)
  const setGlobalFooterSuppressed = useStore((state) => state.setGlobalFooterSuppressed)
  const { tenant } = useTenantInfo(slug)

  // Fixed sidebar must never cover the global footer — hide the root layout's full-width
  // instance and render <SiteFooter inset /> in the content column below instead.
  useEffect(() => {
    setGlobalFooterSuppressed(true)
    return () => setGlobalFooterSuppressed(false)
  }, [setGlobalFooterSuppressed])

  const role = getRoleFromToken(token)
  const tokenTenantSlug = getClaimsFromToken(token)?.tenant_slug ?? null

  const visibleNav = NAV_DEFS.filter(
    (item) =>
      (!item.allowedTypes || (tenantType && item.allowedTypes.includes(tenantType))) &&
      (!item.allowedRoles || (role && item.allowedRoles.includes(role)))
  )
  const visiblePlatformNav = PLATFORM_NAV_DEFS.filter(
    (item) => !item.allowedRoles || (role && item.allowedRoles.includes(role))
  )

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) {
      router.replace(`/${slug}/login`)
      return
    }
    // The JWT's own tenant_slug claim is the source of truth for tenant scope —
    // a valid session for one tenant must never render another tenant's admin
    // shell (previously rendered indefinitely with stale/mislabeled data instead
    // of redirecting).
    if (tokenTenantSlug && tokenTenantSlug !== slug) {
      router.replace('/unauthorized')
      return
    }
    // A role/tenant-type combination that can't see ANY currently-active nav
    // item for this exact path (e.g. staff hitting /users directly by URL) means
    // the page shell has no business rendering here at all.
    const matchedItem = NAV_DEFS.find((item) => !item.absolute && pathname.startsWith(`/${slug}/${item.path}`))
    if (matchedItem && !visibleNav.includes(matchedItem)) {
      router.replace('/unauthorized')
    }
  }, [hasHydrated, router, slug, token, tokenTenantSlug, pathname, visibleNav])

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

  const isActive = (item: NavItem) => {
    const href = item.absolute ? item.path : `/${slug}/${item.path}`
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // UIX-3: the palette gets the exact same visible lists the sidebar just rendered above — no
  // separate/duplicated nav source. See specs/frontend/overview.md "Command palette (UIX-3)".
  const paletteItems = [
    ...visibleNav.map((item) => ({ label: item.label, href: `/${slug}/${item.path}`, icon: item.icon })),
    ...visiblePlatformNav.map((item) => ({ label: item.label, href: item.path, icon: item.icon })),
  ]
  const paletteQuickActions = [
    { label: 'Invite user', href: `/${slug}/users/invite`, icon: <UserPlus /> },
  ]

  if (!hasHydrated) return null

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b px-3 py-3">
          <div className="flex w-full items-center justify-between gap-2 px-2 text-primary">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xl" aria-hidden="true">🍽</span>
              <span className="truncate font-bold tracking-tight group-data-[collapsible=icon]:hidden">{tenant?.name ?? slug} Admin</span>
            </div>
            <kbd className="hidden rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden lg:inline">
              ⌘K
            </kbd>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNav.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                      <Link href={`/${slug}/${item.path}`}>
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {visiblePlatformNav.length > 0 ? (
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visiblePlatformNav.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                        <Link href={item.path}>
                          {item.icon}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="border-t px-3 py-3">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut data-icon="inline-start" />
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-bold text-primary">{tenant?.name ?? slug} Admin</span>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
        <SiteFooter inset />
      </SidebarInset>

      <CommandPalette items={paletteItems} quickActions={paletteQuickActions} />
    </SidebarProvider>
  )
}

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
  QrCode,
  Settings,
  ShoppingBag,
  Store,
  Table2,
  Users,
  UtensilsCrossed,
  Warehouse,
} from 'lucide-react'

import { getRoleFromToken } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import type { TenantType, UserRole } from '@/types'
import { Button } from '@/components/ui/button'
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

const NAV_DEFS: NavItem[] = [
  { label: 'Dashboard', path: 'dashboard', icon: <LayoutDashboard /> },
  { label: 'Orders', path: 'orders', icon: <ShoppingBag /> },
  { label: 'Tables', path: 'tables', icon: <Table2 /> },
  { label: 'Menu', path: 'menu-management', icon: <UtensilsCrossed /> },
  { label: 'Inventory', path: 'inventory', icon: <Box /> },
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
  { label: 'Users', path: 'users', icon: <Users /> },
  {
    label: 'Public Link',
    path: 'public-link',
    icon: <QrCode />,
    // All tenant types may publish a public menu — restaurant segment gets guest
    // ordering, cafeteria segment gets read-only browsing only (RFC-007 Phase D).
  },
  { label: 'Analytics', path: 'analytics', icon: <BarChart3 /> },
  { label: 'Reports', path: 'reports', icon: <Download /> },
  { label: 'Memo', path: 'memo', icon: <FileText /> },
  { label: 'Settings', path: 'settings', icon: <Settings /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const token = useStore((state) => state.token)
  const tenantType = useStore((state) => state.tenantType)
  const clearAuth = useStore((state) => state.clearAuth)

  const role = getRoleFromToken(token)

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
  const visiblePlatformNav = PLATFORM_NAV_DEFS.filter(
    (item) => !item.allowedRoles || (role && item.allowedRoles.includes(role))
  )

  const isActive = (item: NavItem) => {
    const href = item.absolute ? item.path : `/${slug}/${item.path}`
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b px-3 py-3">
          <div className="flex items-center gap-2 px-2 text-primary">
            <span className="text-xl" aria-hidden="true">🍽</span>
            <span className="truncate font-bold tracking-tight group-data-[collapsible=icon]:hidden">SCMS Admin</span>
          </div>
          <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{slug}</p>
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
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
          <SidebarTrigger />
          <span className="text-sm font-bold text-primary">SCMS Admin</span>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

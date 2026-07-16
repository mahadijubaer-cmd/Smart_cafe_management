'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, BarChart3, History, LogOut, Store } from 'lucide-react'

import ProtectedRoute from '@/components/ProtectedRoute'
import CommandPalette from '@/components/layout/CommandPalette'
import SiteFooter from '@/components/layout/SiteFooter'
import { getRoleFromToken } from '@/lib/auth'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const NAV_DEFS = [
  { label: 'Tenants', path: '/admin/tenants', icon: <Store /> },
  { label: 'Subscriptions', path: '/admin/subscriptions', icon: <BarChart3 /> },
  { label: 'Analytics', path: '/admin/analytics', icon: <BarChart3 /> },
  { label: 'Audit Log', path: '/admin/audit-log', icon: <History /> },
]

function PlatformAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const token = useStore((state) => state.token)
  const tenantSlug = useStore((state) => state.tenantSlug)
  const clearAuth = useStore((state) => state.clearAuth)
  const setGlobalFooterSuppressed = useStore((state) => state.setGlobalFooterSuppressed)
  const role = getRoleFromToken(token)

  // Fixed sidebar must never cover the global footer — hide the root layout's full-width
  // instance and render <SiteFooter inset /> in the content column below instead.
  useEffect(() => {
    setGlobalFooterSuppressed(true)
    return () => setGlobalFooterSuppressed(false)
  }, [setGlobalFooterSuppressed])

  const backHref = tenantSlug ? `/${tenantSlug}/dashboard` : '/discover'

  const handleLogout = () => {
    clearAuth()
    window.location.href = tenantSlug ? `/${tenantSlug}/login` : '/login'
  }

  const isActive = (path: string) => pathname === path || pathname?.startsWith(`${path}/`)

  // UIX-3: reuses this layout's own NAV_DEFS — no separate nav source. Tenant search fetches once
  // client-side and filters locally (no `q` search param on the admin-scoped GET /tenants — see
  // specs/frontend/overview.md "Command palette (UIX-3)").
  const paletteItems = NAV_DEFS.map((item) => ({ label: item.label, href: item.path, icon: item.icon }))

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b px-3 py-3">
          <div className="flex w-full items-center justify-between gap-2 px-2 text-primary">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xl" aria-hidden="true">🛡️</span>
              <span className="truncate font-bold tracking-tight group-data-[collapsible=icon]:hidden">Platform Admin</span>
            </div>
            <kbd className="hidden rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden lg:inline">
              ⌘K
            </kbd>
          </div>
          <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {role === 'platform_admin' ? 'Cross-tenant control' : 'Restricted area'}
          </p>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_DEFS.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive(item.path)} tooltip={item.label}>
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
        </SidebarContent>

        <SidebarFooter className="border-t px-3 py-3">
          <Button variant="ghost" className="w-full justify-start gap-2" asChild>
            <Link href={backHref}>
              <ArrowLeft data-icon="inline-start" />
              <span className="group-data-[collapsible=icon]:hidden">Back to tenant admin</span>
            </Link>
          </Button>
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
          <span className="text-sm font-bold text-primary">Platform Admin</span>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
        <SiteFooter inset />
      </SidebarInset>

      <CommandPalette items={paletteItems} tenantSearch />
    </SidebarProvider>
  )
}

export default function PlatformAdminLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['platform_admin']}>
      <PlatformAdminShell>{children}</PlatformAdminShell>
    </ProtectedRoute>
  )
}

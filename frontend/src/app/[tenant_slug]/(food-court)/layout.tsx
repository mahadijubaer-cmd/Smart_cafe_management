'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { BarChart3, ChefHat, LayoutDashboard, LogOut, Table2, Truck, UtensilsCrossed } from 'lucide-react'

import { useStore } from '@/store/useStore'
import type { UserRole } from '@/types'
import { Button } from '@/components/ui/button'
import CommandPalette from '@/components/layout/CommandPalette'
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

type NavItem = { label: string; path: string; icon: ReactNode; roles: UserRole[] }

const NAV: NavItem[] = [
  { label: 'Dashboard', path: 'fc-dashboard', icon: <LayoutDashboard />, roles: ['food_court_admin'] },
  {
    label: 'Unified Menu',
    path: 'unified-menu',
    icon: <UtensilsCrossed />,
    roles: ['food_court_admin', 'server', 'customer'],
  },
  { label: 'Delivery Queue', path: 'deliver', icon: <Truck />, roles: ['food_court_admin', 'server'] },
  { label: 'Tables', path: 'shared-tables', icon: <Table2 />, roles: ['food_court_admin', 'server'] },
  { label: 'Analytics', path: 'fc-analytics', icon: <BarChart3 />, roles: ['food_court_admin'] },
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
  const hasHydrated = useStore((s) => s.hasHydrated)
  const clearAuth = useStore((s) => s.clearAuth)

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) {
      router.replace(`/${slug}/login`)
      return
    }
    if (tenantType !== 'food_court') {
      router.replace(`/${tenantSlug ?? slug}/dashboard`)
    }
  }, [hasHydrated, token, tenantType, tenantSlug, slug, router])

  const role = user?.role as UserRole | undefined
  const visibleNav = NAV.filter((n) => !role || n.roles.includes(role))

  const handleLogout = () => {
    clearAuth()
    router.push(`/${slug}/login`)
  }

  // UIX-3: reuses this layout's already-role-filtered `visibleNav` — no separate nav source.
  const paletteItems = visibleNav.map((item) => ({
    label: item.label,
    href: `/${slug}/${item.path}`,
    icon: item.icon,
  }))

  if (!hasHydrated) return null

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b px-3 py-3">
          <div className="flex items-center justify-between gap-2 px-2 text-primary">
            <div className="flex items-center gap-2">
              <ChefHat className="size-5" />
              <span className="truncate text-sm font-black group-data-[collapsible=icon]:hidden">Food Court</span>
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
                {visibleNav.map((item) => {
                  const href = `/${slug}/${item.path}`
                  const active = pathname === href || pathname?.startsWith(`${href}/`)
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={href}>
                          {item.icon}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
          <ChefHat className="size-4 text-primary" />
          <span className="text-sm font-bold">Food Court</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </SidebarInset>

      <CommandPalette items={paletteItems} />
    </SidebarProvider>
  )
}

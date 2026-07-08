'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { BarChart3, ChefHat, LayoutDashboard, Table2, Truck, UtensilsCrossed } from 'lucide-react'

import { useStore } from '@/store/useStore'
import type { UserRole } from '@/types'
import {
  Sidebar,
  SidebarContent,
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
  { label: 'Dashboard', path: 'dashboard', icon: <LayoutDashboard />, roles: ['food_court_admin'] },
  {
    label: 'Unified Menu',
    path: 'unified-menu',
    icon: <UtensilsCrossed />,
    roles: ['food_court_admin', 'server', 'customer'],
  },
  { label: 'Delivery Queue', path: 'deliver', icon: <Truck />, roles: ['food_court_admin', 'server'] },
  { label: 'Tables', path: 'tables', icon: <Table2 />, roles: ['food_court_admin', 'server'] },
  { label: 'Analytics', path: 'analytics', icon: <BarChart3 />, roles: ['food_court_admin'] },
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

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b px-3 py-3">
          <div className="flex items-center gap-2 px-2 text-primary">
            <ChefHat className="size-5" />
            <span className="truncate text-sm font-black group-data-[collapsible=icon]:hidden">Food Court</span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNav.map((item) => {
                  const href = `/${slug}/${item.path}`
                  const active = pathname?.includes(`/${item.path}`)
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
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
          <SidebarTrigger />
          <ChefHat className="size-4 text-primary" />
          <span className="text-sm font-bold">Food Court</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

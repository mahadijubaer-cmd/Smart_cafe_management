'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { BookOpenText, CircleUserRound, CreditCard, MapPin, MenuSquare } from 'lucide-react'

import Navbar from '@/components/layout/Navbar'
import CartSidebar from '@/components/menu/CartSidebar'
import apiClient from '@/lib/api'
import { cn } from '@/lib/utils'
import { isRestaurantSegment } from '@/lib/segments'
import { useStore } from '@/store/useStore'

type BottomNavItem = {
  label: string
  icon: ReactNode
  path: string
}

// Same canonical route set as the desktop Navbar's pills (Menu/Orders/Track/Wallet/Profile) —
// kept in sync so mobile and desktop never diverge (UIX-1).
const NAV_DEFS: BottomNavItem[] = [
  { label: 'Menu', path: 'menu', icon: <MenuSquare className="h-5 w-5" /> },
  { label: 'Orders', path: 'order', icon: <BookOpenText className="h-5 w-5" /> },
  { label: 'Track', path: 'track', icon: <MapPin className="h-5 w-5" /> },
  { label: 'Wallet', path: 'wallet', icon: <CreditCard className="h-5 w-5" /> },
  { label: 'Profile', path: 'profile', icon: <CircleUserRound className="h-5 w-5" /> },
]

export default function CustomerLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const token = useStore((state) => state.token)
  const tenantType = useStore((state) => state.tenantType)
  const isCartOpen = useStore((state) => state.isCartOpen)
  const closeCart = useStore((state) => state.closeCart)
  const setUser = useStore((state) => state.setUser)
  const setWalletBalance = useStore((state) => state.setWalletBalance)
  const setRewardPoints = useStore((state) => state.setRewardPoints)
  const clearAuth = useStore((state) => state.clearAuth)
  const hasHydrated = useStore((state) => state.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) {
      router.replace(`/${slug}/login`)
    }
  }, [hasHydrated, router, slug, token])

  // BR-SEG-1 (RFC-007): restaurant-segment tenants have no consumer surface.
  useEffect(() => {
    if (tenantType && isRestaurantSegment(tenantType)) {
      router.replace('/unauthorized')
    }
  }, [router, tenantType])

  useEffect(() => {
    if (!token) return
    let mounted = true

    const syncUser = async () => {
      try {
        const response = await apiClient.get('/auth/me')
        if (!mounted) return
        setUser(response.data)
        setWalletBalance(Number(response.data.wallet_balance ?? 0))
        setRewardPoints(Number(response.data.reward_points ?? 0))
      } catch {
        if (!mounted) return
        // The token is dead (401 from /auth/me). It MUST be cleared before redirecting —
        // otherwise the login page still sees a token in the store, redirects straight back
        // here, and the two pages bounce forever.
        clearAuth()
        router.replace(`/${slug}/login`)
      }
    }

    void syncUser()
    return () => { mounted = false }
  }, [clearAuth, router, setRewardPoints, setUser, setWalletBalance, slug, token])

  const navItems = NAV_DEFS.map((item) => ({ ...item, href: `/${slug}/${item.path}` }))
  const activeRoute = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  if (!hasHydrated) return null

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div
        className={[
          'fixed inset-0 z-40 bg-slate-950/40 transition-opacity duration-300 lg:hidden',
          isCartOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={closeCart}
        aria-hidden="true"
      />

      <CartSidebar />

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pb-8">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background shadow-[0_-10px_30px_rgba(15,23,42,0.08)] lg:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-5 px-2 py-2">
          {navItems.map((item) => {
            const active = activeRoute(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs transition',
                  active ? 'font-semibold text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={active ? 'text-primary' : 'text-muted-foreground'}>{item.icon}</span>
                <span>{item.label}</span>
                <span className={cn('h-0.5 w-8 rounded-full transition', active ? 'bg-primary opacity-100' : 'bg-transparent opacity-0')} />
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

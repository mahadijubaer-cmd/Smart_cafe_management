 'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpenText, CircleUserRound, CreditCard, MenuSquare } from 'lucide-react'

import Navbar from '@/components/layout/Navbar'
import CartSidebar from '@/components/menu/CartSidebar'
import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'

type BottomNavItem = {
  label: string
  href: string
  icon: ReactNode
}

const bottomNavItems: BottomNavItem[] = [
  { label: 'Menu', href: '/menu', icon: <MenuSquare className="h-5 w-5" /> },
  { label: 'Orders', href: '/order', icon: <BookOpenText className="h-5 w-5" /> },
  { label: 'Profile', href: '/profile', icon: <CircleUserRound className="h-5 w-5" /> },
  { label: 'Wallet', href: '/wallet', icon: <CreditCard className="h-5 w-5" /> },
]

export default function StudentLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useStore((state) => state.token)
  const isCartOpen = useStore((state) => state.isCartOpen)
  const closeCart = useStore((state) => state.closeCart)
  const setUser = useStore((state) => state.setUser)
  const setWalletBalance = useStore((state) => state.setWalletBalance)
  const setRewardPoints = useStore((state) => state.setRewardPoints)

  useEffect(() => {
    if (!token) {
      router.replace('/login')
    }
  }, [router, token])

  useEffect(() => {
    if (!token) {
      return
    }

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
        router.replace('/login')
      }
    }

    void syncUser()

    return () => {
      mounted = false
    }
  }, [router, setRewardPoints, setUser, setWalletBalance, token])

  const activeRoute = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-10px_30px_rgba(15,23,42,0.08)] lg:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-4 px-2 py-2">
          {bottomNavItems.map((item) => {
            const active = activeRoute(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs transition',
                  active ? 'font-semibold text-[#1A4D2E]' : 'text-slate-500 hover:text-slate-800',
                ].join(' ')}
              >
                <span className={active ? 'text-[#1A4D2E]' : 'text-slate-500'}>{item.icon}</span>
                <span>{item.label}</span>
                <span className={['h-0.5 w-8 rounded-full transition', active ? 'bg-[#1A4D2E] opacity-100' : 'bg-transparent opacity-0'].join(' ')} />
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

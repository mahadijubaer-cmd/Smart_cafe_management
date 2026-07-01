'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, ShoppingCart, X } from 'lucide-react'

import { useStore } from '@/store/useStore'
import NotificationBell from '@/components/layout/NotificationBell'

type NavItem = {
  label: string
  href: string
}

function getInitials(fullName: string | null) {
  if (!fullName) return 'U'
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function NavLink({ href, label, active = false, onClick }: NavItem & { active?: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        'rounded-full px-4 py-2 text-sm font-semibold transition',
        active ? 'bg-[#1A4D2E] text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100 hover:text-[#1A4D2E]',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useStore((state) => state.user)
  const tenantSlug = useStore((state) => state.tenantSlug)
  const walletBalance = useStore((state) => state.walletBalance)
  const cartCount = useStore((state) => state.cartCount)
  const toggleCart = useStore((state) => state.toggleCart)
  const clearAuth = useStore((state) => state.clearAuth)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [cartBounce, setCartBounce] = useState(false)
  const [previousCartCount, setPreviousCartCount] = useState(cartCount())

  const slug = tenantSlug ?? ''

  const navItems: NavItem[] = useMemo(() => [
    { label: 'Menu', href: `/${slug}/menu` },
    { label: 'My Orders', href: `/${slug}/order` },
    { label: 'Track Order', href: `/${slug}/track` },
  ], [slug])

  const itemCount = useMemo(() => cartCount(), [cartCount])
  const initials = getInitials(user?.full_name ?? null)

  useEffect(() => {
    if (itemCount > previousCartCount) {
      setCartBounce(true)
      const timeoutId = window.setTimeout(() => setCartBounce(false), 260)
      setPreviousCartCount(itemCount)
      return () => window.clearTimeout(timeoutId)
    }
    setPreviousCartCount(itemCount)
    return undefined
  }, [itemCount, previousCartCount])

  useEffect(() => {
    setMobileOpen(false)
    setDropdownOpen(false)
  }, [pathname])

  const handleLogout = () => {
    setDropdownOpen(false)
    clearAuth()
    router.push(slug ? `/${slug}/login` : '/login')
  }

  const activeRoute = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:bg-gray-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link href={`/${slug}/menu`} className="flex items-center gap-2 text-[#1A4D2E] transition hover:opacity-90">
              <span className="text-2xl" aria-hidden="true">🍽</span>
              <span className="text-lg font-bold tracking-tight sm:text-xl">BRACU Cafe</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} active={activeRoute(item.href)} />
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={`/${slug}/wallet`}
              className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              ৳ {Number(walletBalance).toFixed(0)}
            </Link>

            <NotificationBell />

            <button
              type="button"
              onClick={toggleCart}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:bg-gray-50"
              aria-label="Open cart"
            >
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 ? (
                <span
                  className={[
                    'absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm',
                    cartBounce ? 'cart-badge-bounce' : '',
                  ].join(' ')}
                >
                  {itemCount}
                </span>
              ) : null}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((open) => !open)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1A4D2E] text-sm font-bold text-white shadow-sm transition hover:bg-[#163f25]"
                aria-label="Open user menu"
              >
                {initials}
              </button>

              {dropdownOpen ? (
                <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
                  <Link href={`/${slug}/profile`} className="block px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50">
                    Profile
                  </Link>
                  <Link href={`/${slug}/wallet`} className="block px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50">
                    Wallet
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div
        className={[
          'fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={[
          'fixed left-0 top-0 z-50 h-full w-80 bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
            <div className="flex items-center gap-2 text-[#1A4D2E]">
              <span className="text-2xl" aria-hidden="true">🍽</span>
              <span className="font-bold">BRACU Cafe</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:bg-gray-50"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-4 px-4 py-5">
            <div className="space-y-2">
              {navItems.map((item) => (
                <NavLink key={item.href} {...item} active={activeRoute(item.href)} onClick={() => setMobileOpen(false)} />
              ))}
            </div>

            <div className="space-y-2 border-t border-gray-100 pt-4">
              <Link
                href={`/${slug}/wallet`}
                onClick={() => setMobileOpen(false)}
                className="block rounded-full px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
              >
                Wallet
              </Link>
              <Link
                href={`/${slug}/profile`}
                onClick={() => setMobileOpen(false)}
                className="block rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="block w-full rounded-full px-4 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes cart-badge-bounce {
          0% { transform: scale(0.7); }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .cart-badge-bounce { animation: cart-badge-bounce 260ms ease-out; }
      `}</style>
    </>
  )
}

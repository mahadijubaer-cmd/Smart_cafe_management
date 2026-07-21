'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Menu, ShoppingCart, User, Wallet } from 'lucide-react'

import { useStore } from '@/store/useStore'
import { useTenantInfo } from '@/hooks/useTenantInfo'
import NotificationBell from '@/components/layout/NotificationBell'
import Logo from '@/components/layout/Logo'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

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
      className={cn(
        'rounded-full px-4 py-2 text-sm font-semibold transition',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-primary'
      )}
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
  const [cartBounce, setCartBounce] = useState(false)
  const [previousCartCount, setPreviousCartCount] = useState(cartCount())

  const slug = tenantSlug ?? ''
  const { tenant } = useTenantInfo(slug)
  const orgName = tenant?.name ?? 'Cafe'

  // Same canonical route set as the mobile bottom tab bar (Menu/Orders/Track/Wallet/Profile) —
  // kept in sync so desktop and mobile never diverge (UIX-1).
  const navItems: NavItem[] = useMemo(() => [
    { label: 'Menu', href: `/${slug}/menu` },
    { label: 'My Orders', href: `/${slug}/order` },
    { label: 'Track Order', href: `/${slug}/track` },
    { label: 'Wallet', href: `/${slug}/wallet` },
    { label: 'Profile', href: `/${slug}/profile` },
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
  }, [pathname])

  const handleLogout = () => {
    clearAuth()
    router.push(slug ? `/${slug}/login` : '/login')
  }

  const activeRoute = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full lg:hidden" aria-label="Open navigation menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-primary">
                  <Logo theme="light" className="size-6" />
                  {orgName}
                </SheetTitle>
              </SheetHeader>

              <div className="flex flex-1 flex-col gap-4 px-4 pb-5">
                <div className="flex flex-col gap-2">
                  {navItems.map((item) => (
                    <NavLink key={item.href} {...item} active={activeRoute(item.href)} onClick={() => setMobileOpen(false)} />
                  ))}
                </div>

                <DropdownMenuSeparator className="mx-0" />

                <div className="flex flex-col gap-2">
                  <Button variant="ghost" className="justify-start rounded-full text-destructive hover:text-destructive" onClick={handleLogout}>
                    <LogOut data-icon="inline-start" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Link href={`/${slug}/menu`} className="flex items-center gap-2 text-primary transition hover:opacity-90">
            <Logo theme="light" className="size-6" />
            <span className="text-lg font-bold tracking-tight sm:text-xl">{orgName}</span>
          </Link>
        </div>

        <nav className="hidden items-center gap-2 lg:flex">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} active={activeRoute(item.href)} />
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button asChild variant="secondary" className="rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400">
            <Link href={`/${slug}/wallet`}>
              <Wallet data-icon="inline-start" />
              ৳ {Number(walletBalance).toFixed(0)}
            </Link>
          </Button>

          <NotificationBell />

          <Button
            variant="outline"
            size="icon"
            className="relative rounded-full"
            onClick={toggleCart}
            aria-label="Open cart"
          >
            <ShoppingCart />
            {itemCount > 0 ? (
              <Badge
                variant="destructive"
                className={cn(
                  'absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]',
                  cartBounce && 'cart-badge-bounce'
                )}
              >
                {itemCount}
              </Badge>
            ) : null}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Open user menu">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary font-bold text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href={`/${slug}/profile`}>
                    <User data-icon="inline-start" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/${slug}/wallet`}>
                    <Wallet data-icon="inline-start" />
                    Wallet
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                <LogOut data-icon="inline-start" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <style>{`
        @keyframes cart-badge-bounce {
          0% { transform: scale(0.7); }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .cart-badge-bounce { animation: cart-badge-bounce 260ms ease-out; }
      `}</style>
    </header>
  )
}

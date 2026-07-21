'use client'

import Link from 'next/link'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import MarqueeStrip from '@/components/layout/MarqueeStrip'

export default function Home() {
  const tenantSlug = useStore((state) => state.tenantSlug)
  const hasHydrated = useStore((state) => state.hasHydrated)

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#1A4D2E] px-6 py-16 text-center text-white">
      <img
        src="/brand/food-illustration-home.svg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative z-10 flex w-full flex-col items-center">
      <h1 className="motion-safe:animate-fade-up text-5xl font-black tracking-tight">
        Smart <em className="italic text-[#E8734A]">Cafe</em> Management
      </h1>

      {/* RFC-007: segment landing — cafeteria (registered accounts) vs restaurant (guest QR ordering) */}
      <div className="mt-12 grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        <Link
          href="/discover?segment=cafeteria"
          className="motion-safe:animate-fade-up group block"
          style={{ animationDelay: '160ms' }}
        >
          <Card className="flex flex-col items-start gap-3 rounded-2xl border-white/20 bg-white/5 p-8 text-left shadow-none transition duration-300 hover:-translate-y-1 hover:bg-white/10 hover:shadow-xl hover:shadow-black/20">
            <span className="text-3xl transition-transform duration-300 group-hover:scale-110">🍽️</span>
            <span className="text-xl font-bold text-white">Cafeteria</span>
            <span className="text-sm text-white/60">
              For corporate and academic communities. Log in with your account to order and pay from
              your wallet.
            </span>
          </Card>
        </Link>

        <Link
          href="/discover?segment=restaurant"
          className="motion-safe:animate-fade-up group block"
          style={{ animationDelay: '240ms' }}
        >
          <Card className="flex flex-col items-start gap-3 rounded-2xl border-white/20 bg-white/5 p-8 text-left shadow-none transition duration-300 hover:-translate-y-1 hover:bg-white/10 hover:shadow-xl hover:shadow-black/20">
            <span className="text-3xl transition-transform duration-300 group-hover:scale-110">🍔</span>
            <span className="text-xl font-bold text-white">Restaurant</span>
            <span className="text-sm text-white/60">
              Independent restaurants, franchises &amp; food courts. No account needed — scan the
              table QR to browse the menu and order as a guest.
            </span>
          </Card>
        </Link>
      </div>

      <div
        className="motion-safe:animate-fade-up mt-10 flex flex-col gap-4 sm:flex-row"
        style={{ animationDelay: '320ms' }}
      >
        {hasHydrated && tenantSlug ? (
          <Button asChild size="lg" className="rounded-2xl bg-white text-[#1A4D2E] transition-transform hover:-translate-y-0.5 hover:bg-white/90">
            <Link href={`/${tenantSlug}/login`}>Continue to {tenantSlug}</Link>
          </Button>
        ) : null}

        <Button asChild size="lg" variant="outline" className="rounded-2xl border-white/30 bg-transparent text-white transition-transform hover:-translate-y-0.5 hover:bg-white/10 hover:text-white">
          <Link href="/discover">Find your organisation</Link>
        </Button>

        <Button asChild size="lg" variant="outline" className="rounded-2xl border-white/30 bg-transparent text-white transition-transform hover:-translate-y-0.5 hover:bg-white/10 hover:text-white">
          <Link href="/register-organization">Register your organisation</Link>
        </Button>
      </div>

      <MarqueeStrip
        className="motion-safe:animate-fade-up mt-16 max-w-2xl"
        items={['Academic Cafeterias', 'Corporate Dining', 'Food Courts', 'Real-Time Orders', 'Wallet Payments', 'QR Ordering']}
      />
      </div>
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function Home() {
  const tenantSlug = useStore((state) => state.tenantSlug)
  const hasHydrated = useStore((state) => state.hasHydrated)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#1A4D2E] px-6 py-16 text-center text-white">
      <h1 className="text-5xl font-black tracking-tight">Smart Cafe Management</h1>
      <p className="mt-3 text-lg text-white/70">
        BRAC University CSE400 — Final Year Thesis
      </p>

      {/* RFC-007: segment landing — cafeteria (registered accounts) vs restaurant (guest QR ordering) */}
      <div className="mt-12 grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        <Link href="/discover?segment=cafeteria" className="group block">
          <Card className="flex flex-col items-start gap-3 rounded-2xl border-white/20 bg-white/5 p-8 text-left shadow-none transition hover:-translate-y-0.5 hover:bg-white/10">
            <span className="text-3xl">🍽️</span>
            <span className="text-xl font-bold text-white">Cafeteria</span>
            <span className="text-sm text-white/60">
              For corporate and academic communities. Log in with your account to order and pay from
              your wallet.
            </span>
          </Card>
        </Link>

        <Link href="/discover?segment=restaurant" className="group block">
          <Card className="flex flex-col items-start gap-3 rounded-2xl border-white/20 bg-white/5 p-8 text-left shadow-none transition hover:-translate-y-0.5 hover:bg-white/10">
            <span className="text-3xl">🍔</span>
            <span className="text-xl font-bold text-white">Restaurant</span>
            <span className="text-sm text-white/60">
              Independent restaurants, franchises &amp; food courts. No account needed — scan the
              table QR to browse the menu and order as a guest.
            </span>
          </Card>
        </Link>
      </div>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        {hasHydrated && tenantSlug ? (
          <Button asChild size="lg" className="rounded-2xl bg-white text-[#1A4D2E] hover:bg-white/90">
            <Link href={`/${tenantSlug}/login`}>Continue to {tenantSlug}</Link>
          </Button>
        ) : null}

        <Button asChild size="lg" variant="outline" className="rounded-2xl border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
          <Link href="/discover">Find your organisation</Link>
        </Button>

        <Button asChild size="lg" variant="outline" className="rounded-2xl border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
          <Link href="/register-organization">Register your organisation</Link>
        </Button>
      </div>
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useStore } from '@/store/useStore'

export default function Home() {
  const tenantSlug = useStore((state) => state.tenantSlug)
  const hasHydrated = useStore((state) => state.hasHydrated)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#1A4D2E] px-6 text-center text-white">
      <h1 className="text-5xl font-black tracking-tight">Smart Cafe Management</h1>
      <p className="mt-3 text-lg text-white/70">
        BRAC University CSE400 — Final Year Thesis
      </p>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        {hasHydrated && tenantSlug ? (
          <Link
            href={`/${tenantSlug}/login`}
            className="rounded-2xl bg-white px-8 py-3 font-semibold text-[#1A4D2E] transition hover:bg-white/90"
          >
            Continue to {tenantSlug}
          </Link>
        ) : null}

        <Link
          href="/discover"
          className="rounded-2xl border border-white/30 px-8 py-3 font-semibold text-white transition hover:bg-white/10"
        >
          Find your organisation
        </Link>

        <Link
          href="/register-organization"
          className="rounded-2xl border border-white/30 px-8 py-3 font-semibold text-white transition hover:bg-white/10"
        >
          Register your organisation
        </Link>
      </div>
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

/**
 * Superseded by RFC-010 (Phase 25 — specs/modules/signage.md). This route
 * required a logged-in staff JWT, which is wrong for unattended hardware —
 * it has no offline resilience, no admin-managed content, and no order
 * board/trending/offers slides. Kept as a deprecation notice only; pair the
 * physical display through /signage instead.
 */
export default function LegacyDisplayNotice() {
  const params = useParams<{ tenant_slug: string }>()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-10 text-center text-white">
      <span className="text-5xl" aria-hidden="true">🖥️</span>
      <h1 className="text-3xl font-bold">This display page has moved</h1>
      <p className="max-w-lg text-white/70">
        The old logged-in signage board for <strong>{params.tenant_slug}</strong> has been replaced by paired
        signage terminals with admin-managed playlists, live order status, trending items, and offers.
      </p>
      <p className="max-w-lg text-white/70">
        Open <span className="font-mono">/signage</span> on the display device and pair it with a code from{' '}
        <span className="font-mono">Devices</span> in the admin panel.
      </p>
      <Link
        href={`/${params.tenant_slug}/devices`}
        className="mt-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-950"
      >
        Go to Devices
      </Link>
    </main>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import ProtectedRoute from '@/components/ProtectedRoute'
import { Button } from '@/components/ui/button'

export default function TrackOrderLandingPage() {
  const router = useRouter()
  const [orderId, setOrderId] = useState('')

  const handleTrack = () => {
    const trimmed = orderId.trim()
    if (!trimmed) {
      return
    }

    router.push(`/track/${trimmed}`)
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#F5F0E8_0%,#ffffff_32%,#eef5ee_100%)] px-4 py-8 md:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
              Track Order
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Enter your order ID</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Paste the order ID from your checkout receipt or confirmation message to see live progress.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="order-id">
              Order ID
            </label>
            <input
              id="order-id"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              placeholder="e.g. 7f2a1c9b-..."
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#1A4D2E] focus:ring-2 focus:ring-[#1A4D2E]/20"
            />
          </div>

          <Button className="bg-[#1A4D2E] text-white hover:bg-[#163f25]" type="button" onClick={handleTrack} disabled={!orderId.trim()}>
            Track Order
          </Button>
        </div>
      </main>
    </ProtectedRoute>
  )
}
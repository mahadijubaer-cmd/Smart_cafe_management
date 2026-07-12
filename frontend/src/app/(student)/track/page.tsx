'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/useStore'

export default function TrackOrderLandingPage() {
  const router = useRouter()
  const params = useParams<{ tenant_slug?: string }>()
  const tenantSlugFromStore = useStore((state) => state.tenantSlug)
  const slug = params?.tenant_slug ?? tenantSlugFromStore ?? ''
  const [orderId, setOrderId] = useState('')

  const handleTrack = () => {
    const trimmed = orderId.trim()
    if (!trimmed) {
      return
    }

    router.push(`/${slug}/track/${trimmed}`)
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <main className="min-h-screen bg-background px-4 py-8 md:px-6 lg:px-8">
        <div className="motion-safe:animate-scale-in mx-auto max-w-3xl space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
          <PageHeader
            eyebrow="Track Order"
            title="Enter your order ID"
            description="Paste the order ID from your checkout receipt or confirmation message to see live progress."
          />

          <div className="space-y-3">
            <label className="block text-sm font-medium text-muted-foreground" htmlFor="order-id">
              Order ID
            </label>
            <input
              id="order-id"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              placeholder="e.g. 7f2a1c9b-..."
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" type="button" onClick={handleTrack} disabled={!orderId.trim()}>
            Track Order
          </Button>
        </div>
      </main>
    </ProtectedRoute>
  )
}
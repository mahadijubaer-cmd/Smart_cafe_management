'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import ProtectedRoute from '@/components/ProtectedRoute'
import CentralInventoryPanel from '@/components/inventory/CentralInventoryPanel'
import { useStore } from '@/store/useStore'

export default function CentralInventoryPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug
  const tenantType = useStore((state) => state.tenantType)

  if (tenantType && tenantType !== 'franchise_brand') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Central inventory is only available to franchise brands.</p>
      </div>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['super_admin', 'platform_admin']}>
      <main className="min-h-screen px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div>
            <Link href={`/${slug}/inventory`} className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
              <ArrowLeft data-icon="inline-start" />
              Back to Inventory
            </Link>
            <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Franchise Brand
            </p>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Central Inventory</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage the brand warehouse and transfer stock to outlets.</p>
          </div>

          <CentralInventoryPanel />
        </div>
      </main>
    </ProtectedRoute>
  )
}

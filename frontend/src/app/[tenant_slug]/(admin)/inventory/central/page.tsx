'use client'

import { useParams } from 'next/navigation'

import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
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
          <PageHeader
            eyebrow="Franchise Brand"
            title="Central Inventory"
            description="Manage the brand warehouse and transfer stock to outlets."
            breadcrumbs={[
              { label: 'Inventory', href: `/${slug}/inventory` },
              { label: 'Central Inventory' },
            ]}
          />

          <CentralInventoryPanel />
        </div>
      </main>
    </ProtectedRoute>
  )
}

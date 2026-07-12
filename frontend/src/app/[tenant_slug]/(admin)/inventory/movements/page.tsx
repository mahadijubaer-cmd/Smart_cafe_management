'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import StockMovementLog from '@/components/inventory/StockMovementLog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InventoryMovement } from '@/types'

export default function MovementsPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient
      .get('/inventory/movements')
      .then((res) => setMovements(res.data as InventoryMovement[]))
      .catch(() => toast.error('Failed to load movements'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <ProtectedRoute allowedRoles={['tenant_admin', 'outlet_admin', 'super_admin', 'platform_admin']}>
      <main className="min-h-screen px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <PageHeader
            title="Stock Movements"
            description="Complete audit trail of every stock change."
            breadcrumbs={[
              { label: 'Inventory', href: `/${slug}/inventory` },
              { label: 'Movements' },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Movement History</CardTitle>
            </CardHeader>
            <CardContent>
              <StockMovementLog movements={movements} loading={loading} />
            </CardContent>
          </Card>
        </div>
      </main>
    </ProtectedRoute>
  )
}

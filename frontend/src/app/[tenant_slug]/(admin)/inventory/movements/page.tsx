'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
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
    <ProtectedRoute allowedRoles={['tenant_admin', 'outlet_admin', 'super_admin', 'platform_admin', 'admin']}>
      <main className="min-h-screen px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <Link href={`/${slug}/inventory`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition mb-3">
              <ArrowLeft className="h-4 w-4" />
              Back to Inventory
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Stock Movements</h1>
            <p className="mt-1 text-sm text-slate-600">Complete audit trail of every stock change.</p>
          </div>

          <Card className="border-slate-200">
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

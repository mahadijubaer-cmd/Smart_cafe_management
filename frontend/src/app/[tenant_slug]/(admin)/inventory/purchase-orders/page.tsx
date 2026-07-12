'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, Clock, Package } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/layout/PageHeader'
import PurchaseOrderForm from '@/components/inventory/PurchaseOrderForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import type { InventoryItem, PurchaseOrder, PurchaseOrderStatus } from '@/types'

const statusVariants: Record<PurchaseOrderStatus, BadgeProps['variant']> = {
  draft: 'outline',
  submitted: 'secondary',
  approved: 'secondary',
  received: 'default',
  cancelled: 'destructive',
}

export default function PurchaseOrdersPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [receivingId, setReceivingId] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const [poRes, itemsRes] = await Promise.all([
        apiClient.get('/inventory/purchase-orders'),
        apiClient.get('/inventory/items'),
      ])
      setOrders(poRes.data as PurchaseOrder[])
      setInventoryItems(itemsRes.data as InventoryItem[])
    } catch {
      toast.error('Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  const handleReceive = async (poId: string) => {
    setReceivingId(poId)
    try {
      await apiClient.post(`/inventory/purchase-orders/${poId}/receive`)
      toast.success('Purchase order received — stock updated')
      void loadData()
    } catch {
      toast.error('Failed to receive order')
    } finally {
      setReceivingId(null)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['tenant_admin', 'outlet_admin', 'super_admin', 'platform_admin']}>
      <main className="min-h-screen px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <PageHeader
            title="Purchase Orders"
            description="Track supplier orders and receive stock."
            breadcrumbs={[
              { label: 'Inventory', href: `/${slug}/inventory` },
              { label: 'Purchase Orders' },
            ]}
            action={
              <Button type="button" onClick={() => setShowForm((v) => !v)}>
                {showForm ? 'Hide Form' : 'New Purchase Order'}
              </Button>
            }
          />

          {showForm ? (
            <PurchaseOrderForm inventoryItems={inventoryItems} onSuccess={() => { setShowForm(false); void loadData() }} />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package data-icon="inline-start" className="text-primary" />
                All Purchase Orders ({orders.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : orders.length === 0 ? (
                <Empty className="border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Package />
                    </EmptyMedia>
                    <EmptyTitle>No purchase orders yet</EmptyTitle>
                    <EmptyDescription>Create one above to start tracking a supplier order.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {orders.map((po) => (
                    <div key={po.po_id} className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{po.po_number}</p>
                          <Badge variant={statusVariants[po.status]}>{po.status}</Badge>
                          {po.is_transfer ? <Badge variant="secondary">Transfer</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {po.supplier_name ?? 'No supplier'} •{' '}
                          {po.items?.length ?? 0} line(s) •{' '}
                          {new Date(po.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {po.status === 'approved' || po.status === 'submitted' ? (
                          <Button
                            type="button"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleReceive(po.po_id)}
                            disabled={receivingId === po.po_id}
                          >
                            <CheckCircle data-icon="inline-start" />
                            {receivingId === po.po_id ? 'Receiving...' : 'Receive'}
                          </Button>
                        ) : null}
                        {po.status === 'draft' ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock data-icon="inline-start" /> Draft
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </ProtectedRoute>
  )
}

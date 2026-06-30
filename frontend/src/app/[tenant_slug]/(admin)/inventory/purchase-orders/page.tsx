'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Clock, Package } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import PurchaseOrderForm from '@/components/inventory/PurchaseOrderForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { InventoryItem, PurchaseOrder, PurchaseOrderStatus } from '@/types'

const statusColors: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-indigo-100 text-indigo-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
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
    <ProtectedRoute allowedRoles={['tenant_admin', 'outlet_admin', 'super_admin', 'platform_admin', 'admin']}>
      <main className="min-h-screen px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href={`/${slug}/inventory`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition mb-3">
                <ArrowLeft className="h-4 w-4" />
                Back to Inventory
              </Link>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Purchase Orders</h1>
              <p className="mt-1 text-sm text-slate-600">Track supplier orders and receive stock.</p>
            </div>
            <Button
              type="button"
              className="bg-[#1A4D2E] text-white hover:bg-[#163f25]"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? 'Hide Form' : 'New Purchase Order'}
            </Button>
          </div>

          {showForm ? (
            <PurchaseOrderForm inventoryItems={inventoryItems} onSuccess={() => { setShowForm(false); void loadData() }} />
          ) : null}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-[#1A4D2E]" />
                All Purchase Orders ({orders.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="animate-pulse space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100" />)}
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
                  <p className="text-sm text-slate-500">No purchase orders yet. Create one above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((po) => (
                    <div key={po.po_id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{po.po_number}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[po.status]}`}>
                            {po.status}
                          </span>
                          {po.is_transfer ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">Transfer</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {po.supplier_name ?? 'No supplier'} •{' '}
                          {po.items?.length ?? 0} line(s) •{' '}
                          {new Date(po.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {po.status === 'approved' || po.status === 'submitted' ? (
                          <Button
                            type="button"
                            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 text-sm"
                            onClick={() => handleReceive(po.po_id)}
                            disabled={receivingId === po.po_id}
                          >
                            <CheckCircle className="h-4 w-4" />
                            {receivingId === po.po_id ? 'Receiving...' : 'Receive'}
                          </Button>
                        ) : null}
                        {po.status === 'draft' ? (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> Draft
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

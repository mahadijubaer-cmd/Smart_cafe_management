'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, Box, ClipboardList, Package, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import InventoryTable from '@/components/inventory/InventoryTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InventoryItem, InventoryItemCreate, InventoryUnit } from '@/types'

const UNITS: InventoryUnit[] = ['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'dozen']

function AddItemModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<InventoryItemCreate>({
    name: '',
    unit: 'piece',
    quantity_on_hand: 0,
    reorder_level: 0,
    reorder_quantity: 0,
  })
  const [submitting, setSubmitting] = useState(false)

  const set = <K extends keyof InventoryItemCreate>(key: K, value: InventoryItemCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { toast.error('Name is required'); return }
    setSubmitting(true)
    try {
      await apiClient.post('/inventory/items', form)
      toast.success('Item added')
      onSuccess()
      onClose()
    } catch {
      toast.error('Failed to add item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Add Inventory Item</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="item-name">Name *</Label>
              <Input id="item-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Chicken Breast" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-sku">SKU</Label>
              <Input id="item-sku" value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value || null)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-unit">Unit *</Label>
              <select
                id="item-unit"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                value={form.unit}
                onChange={(e) => set('unit', e.target.value as InventoryUnit)}
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-qty">Quantity on Hand</Label>
              <Input id="item-qty" type="number" min={0} step="any" value={form.quantity_on_hand ?? 0} onChange={(e) => set('quantity_on_hand', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-reorder">Reorder Level</Label>
              <Input id="item-reorder" type="number" min={0} step="any" value={form.reorder_level ?? 0} onChange={(e) => set('reorder_level', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-reorder-qty">Reorder Quantity</Label>
              <Input id="item-reorder-qty" type="number" min={0} step="any" value={form.reorder_quantity ?? 0} onChange={(e) => set('reorder_quantity', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">Unit Cost (৳)</Label>
              <Input id="item-cost" type="number" min={0} step="any" value={form.unit_cost ?? ''} onChange={(e) => set('unit_cost', e.target.value ? Number(e.target.value) : null)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-supplier">Supplier Name</Label>
              <Input id="item-supplier" value={form.supplier_name ?? ''} onChange={(e) => set('supplier_name', e.target.value || null)} placeholder="Optional" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1 bg-[#1A4D2E] text-white hover:bg-[#163f25]" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Item'}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const params = useParams<{ tenant_slug: string }>()
  const slug = params.tenant_slug

  const [items, setItems] = useState<InventoryItem[]>([])
  const [lowStock, setLowStock] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const loadItems = async () => {
    try {
      const [allRes, lowRes] = await Promise.all([
        apiClient.get('/inventory/items'),
        apiClient.get('/inventory/items/low-stock'),
      ])
      setItems(allRes.data as InventoryItem[])
      setLowStock(lowRes.data as InventoryItem[])
    } catch {
      toast.error('Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  const handleDelete = async (itemId: string) => {
    await apiClient.delete(`/inventory/items/${itemId}`)
    setItems((prev) => prev.filter((item) => item.item_id !== itemId))
    toast.success('Item deleted')
  }

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <ProtectedRoute allowedRoles={['tenant_admin', 'outlet_admin', 'super_admin', 'platform_admin', 'admin']}>
      {showAdd ? <AddItemModal onClose={() => setShowAdd(false)} onSuccess={loadItems} /> : null}

      <main className="min-h-screen bg-[linear-gradient(180deg,#f2eee7_0%,#ffffff_34%,#edf5ef_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
                Inventory
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Stock Management</h1>
              <p className="mt-2 text-sm text-slate-600">Track all ingredients, packaging, and supplies.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/${slug}/inventory/purchase-orders`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <ClipboardList className="h-4 w-4" />
                Purchase Orders
              </Link>
              <Link
                href={`/${slug}/inventory/movements`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Package className="h-4 w-4" />
                Movements
              </Link>
              <Button
                type="button"
                className="gap-2 bg-[#1A4D2E] text-white hover:bg-[#163f25]"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>
          </div>

          {lowStock.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800">
                      {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below reorder level
                    </p>
                    <p className="text-sm text-amber-700">
                      {lowStock.slice(0, 5).map((i) => i.name).join(', ')}
                      {lowStock.length > 5 ? ` and ${lowStock.length - 5} more` : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <Box className="h-5 w-5 text-[#1A4D2E]" />
                  All Items ({filtered.length})
                </CardTitle>
                <Input
                  placeholder="Search by name or SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            </CardHeader>
            <CardContent>
              <InventoryTable items={filtered} loading={loading} onDelete={handleDelete} />
            </CardContent>
          </Card>
        </div>
      </main>
    </ProtectedRoute>
  )
}

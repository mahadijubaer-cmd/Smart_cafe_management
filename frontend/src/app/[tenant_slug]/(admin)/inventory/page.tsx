'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, Box, ClipboardList, Package, Plus } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import InventoryTable from '@/components/inventory/InventoryTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { InventoryItem, InventoryItemCreate, InventoryUnit } from '@/types'

const UNITS: InventoryUnit[] = ['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'dozen']

function AddItemModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
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
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="item-name">Name *</FieldLabel>
                <Input id="item-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Chicken Breast" />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-sku">SKU</FieldLabel>
                <Input id="item-sku" value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value || null)} placeholder="Optional" />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-unit">Unit *</FieldLabel>
                <Select value={form.unit} onValueChange={(value) => set('unit', value as InventoryUnit)}>
                  <SelectTrigger id="item-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="item-qty">Quantity on Hand</FieldLabel>
                <Input id="item-qty" type="number" min={0} step="any" value={form.quantity_on_hand ?? 0} onChange={(e) => set('quantity_on_hand', Number(e.target.value))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-reorder">Reorder Level</FieldLabel>
                <Input id="item-reorder" type="number" min={0} step="any" value={form.reorder_level ?? 0} onChange={(e) => set('reorder_level', Number(e.target.value))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-reorder-qty">Reorder Quantity</FieldLabel>
                <Input id="item-reorder-qty" type="number" min={0} step="any" value={form.reorder_quantity ?? 0} onChange={(e) => set('reorder_quantity', Number(e.target.value))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-cost">Unit Cost (৳)</FieldLabel>
                <Input id="item-cost" type="number" min={0} step="any" value={form.unit_cost ?? ''} onChange={(e) => set('unit_cost', e.target.value ? Number(e.target.value) : null)} placeholder="Optional" />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-supplier">Supplier Name</FieldLabel>
                <Input id="item-supplier" value={form.supplier_name ?? ''} onChange={(e) => set('supplier_name', e.target.value || null)} placeholder="Optional" />
              </Field>
            </div>

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Item'}
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
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
      <AddItemModal open={showAdd} onClose={() => setShowAdd(false)} onSuccess={loadItems} />

      <main className="min-h-screen bg-background px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                Inventory
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">Stock Management</h1>
              <p className="mt-2 text-sm text-muted-foreground">Track all ingredients, packaging, and supplies.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" asChild>
                <Link href={`/${slug}/inventory/purchase-orders`} className="gap-2">
                  <ClipboardList data-icon="inline-start" />
                  Purchase Orders
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/${slug}/inventory/movements`} className="gap-2">
                  <Package data-icon="inline-start" />
                  Movements
                </Link>
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => setShowAdd(true)}
              >
                <Plus data-icon="inline-start" />
                Add Item
              </Button>
            </div>
          </div>

          {lowStock.length > 0 ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle data-icon="inline-start" className="shrink-0 text-destructive" />
                  <div>
                    <p className="font-semibold text-destructive">
                      {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below reorder level
                    </p>
                    <p className="text-sm text-destructive/80">
                      {lowStock.slice(0, 5).map((i) => i.name).join(', ')}
                      {lowStock.length > 5 ? ` and ${lowStock.length - 5} more` : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <Box data-icon="inline-start" className="text-primary" />
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

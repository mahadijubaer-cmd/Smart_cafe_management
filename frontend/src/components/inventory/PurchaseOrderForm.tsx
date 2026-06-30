'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InventoryItem } from '@/types'

type LineItem = {
  inventory_item_id: string
  quantity_ordered: number
  unit_cost: number | ''
}

type Props = {
  inventoryItems: InventoryItem[]
  onSuccess?: () => void
}

export default function PurchaseOrderForm({ inventoryItems, onSuccess }: Props) {
  const [supplierName, setSupplierName] = useState('')
  const [supplierContact, setSupplierContact] = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([
    { inventory_item_id: '', quantity_ordered: 1, unit_cost: '' },
  ])
  const [submitting, setSubmitting] = useState(false)

  const addLine = () =>
    setLines((prev) => [...prev, { inventory_item_id: '', quantity_ordered: 1, unit_cost: '' }])

  const removeLine = (index: number) =>
    setLines((prev) => prev.filter((_, i) => i !== index))

  const updateLine = <K extends keyof LineItem>(index: number, key: K, value: LineItem[K]) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [key]: value } : line)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validLines = lines.filter((l) => l.inventory_item_id && l.quantity_ordered > 0)
    if (validLines.length === 0) {
      toast.error('Add at least one line item')
      return
    }

    setSubmitting(true)
    try {
      await apiClient.post('/inventory/purchase-orders', {
        supplier_name: supplierName || null,
        supplier_contact: supplierContact || null,
        expected_delivery: expectedDelivery || null,
        notes: notes || null,
        items: validLines.map((l) => ({
          inventory_item_id: l.inventory_item_id,
          quantity_ordered: l.quantity_ordered,
          unit_cost: l.unit_cost === '' ? null : Number(l.unit_cost),
        })),
      })
      toast.success('Purchase order created')
      onSuccess?.()
    } catch {
      toast.error('Failed to create purchase order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg">New Purchase Order</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier_name">Supplier Name</Label>
              <Input id="supplier_name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier_contact">Supplier Contact</Label>
              <Input id="supplier_contact" value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} placeholder="Phone / Email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expected_delivery">Expected Delivery</Label>
              <Input id="expected_delivery" type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Line Items</p>
            {lines.map((line, index) => (
              <div key={index} className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`item-${index}`}>Item</Label>
                  <select
                    id={`item-${index}`}
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                    value={line.inventory_item_id}
                    onChange={(e) => updateLine(index, 'inventory_item_id', e.target.value)}
                  >
                    <option value="">— Select item —</option>
                    {inventoryItems.map((item) => (
                      <option key={item.item_id} value={item.item_id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor={`qty-${index}`}>Qty</Label>
                  <Input
                    id={`qty-${index}`}
                    type="number"
                    min={0.001}
                    step="any"
                    value={line.quantity_ordered}
                    onChange={(e) => updateLine(index, 'quantity_ordered', Number(e.target.value))}
                  />
                </div>
                <div className="w-28 space-y-1">
                  <Label htmlFor={`cost-${index}`}>Unit Cost</Label>
                  <Input
                    id={`cost-${index}`}
                    type="number"
                    min={0}
                    step="any"
                    value={line.unit_cost}
                    onChange={(e) => updateLine(index, 'unit_cost', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Optional"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mb-0.5 h-9 w-9 shrink-0 rounded-lg p-0 text-red-500 hover:border-red-300 hover:bg-red-50"
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" className="gap-2 rounded-xl" onClick={addLine}>
              <Plus className="h-4 w-4" />
              Add Line
            </Button>
          </div>

          <Button type="submit" className="bg-[#1A4D2E] text-white hover:bg-[#163f25]" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Create Purchase Order'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

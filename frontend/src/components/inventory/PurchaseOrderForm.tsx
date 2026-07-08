'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">New Purchase Order</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="supplier_name">Supplier Name</FieldLabel>
                <Input id="supplier_name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Optional" />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier_contact">Supplier Contact</FieldLabel>
                <Input id="supplier_contact" value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} placeholder="Phone / Email" />
              </Field>
              <Field>
                <FieldLabel htmlFor="expected_delivery">Expected Delivery</FieldLabel>
                <Input id="expected_delivery" type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Line Items</p>
              {lines.map((line, index) => (
                <div key={index} className="flex items-end gap-3">
                  <Field className="flex-1">
                    <FieldLabel htmlFor={`item-${index}`}>Item</FieldLabel>
                    <Select
                      value={line.inventory_item_id}
                      onValueChange={(value) => updateLine(index, 'inventory_item_id', value)}
                    >
                      <SelectTrigger id={`item-${index}`}>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map((item) => (
                          <SelectItem key={item.item_id} value={item.item_id}>
                            {item.name} ({item.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="w-28">
                    <FieldLabel htmlFor={`qty-${index}`}>Qty</FieldLabel>
                    <Input
                      id={`qty-${index}`}
                      type="number"
                      min={0.001}
                      step="any"
                      value={line.quantity_ordered}
                      onChange={(e) => updateLine(index, 'quantity_ordered', Number(e.target.value))}
                    />
                  </Field>
                  <Field className="w-28">
                    <FieldLabel htmlFor={`cost-${index}`}>Unit Cost</FieldLabel>
                    <Input
                      id={`cost-${index}`}
                      type="number"
                      min={0}
                      step="any"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(index, 'unit_cost', e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Optional"
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="mb-0.5 size-9 shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                  >
                    <Trash2 data-icon="inline-start" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="w-fit gap-2" onClick={addLine}>
                <Plus data-icon="inline-start" />
                Add Line
              </Button>
            </div>

            <Button type="submit" className="w-fit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Create Purchase Order'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
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
import InventoryTable from '@/components/inventory/InventoryTable'
import type { InventoryItem } from '@/types'

type OutletOption = {
  outlet_tenant_id: string
  outlet_name: string
}

export default function CentralInventoryPanel() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [loading, setLoading] = useState(true)

  // Transfer form state
  const [selectedItem, setSelectedItem] = useState('')
  const [selectedOutlet, setSelectedOutlet] = useState('')
  const [transferQty, setTransferQty] = useState('')
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const [itemsRes, outletsRes] = await Promise.all([
          apiClient.get('/inventory/items?is_central=true'),
          apiClient.get('/analytics/outlets?period=today'),
        ])
        if (!mounted) return
        setItems(itemsRes.data as InventoryItem[])
        setOutlets((outletsRes.data as OutletOption[]) || [])
      } catch {
        if (mounted) toast.error('Failed to load central inventory')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => { mounted = false }
  }, [])

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem || !selectedOutlet || !transferQty) {
      toast.error('Fill all transfer fields')
      return
    }
    setTransferring(true)
    try {
      await apiClient.post('/inventory/transfer', {
        inventory_item_id: selectedItem,
        to_outlet_id: selectedOutlet,
        quantity: Number(transferQty),
      })
      toast.success('Transfer completed')
      setTransferQty('')
      // Refresh items
      const res = await apiClient.get('/inventory/items?is_central=true')
      setItems(res.data as InventoryItem[])
    } catch {
      toast.error('Transfer failed')
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Central Inventory — Brand Warehouse</CardTitle>
        </CardHeader>
        <CardContent>
          <InventoryTable items={items} loading={loading} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowRight data-icon="inline-start" className="text-primary" />
            Transfer Stock to Outlet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleTransfer}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="transfer-item">Item</FieldLabel>
                  <Select value={selectedItem} onValueChange={setSelectedItem}>
                    <SelectTrigger id="transfer-item">
                      <SelectValue placeholder="Select central item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.item_id} value={item.item_id}>
                          {item.name} ({Number(item.quantity_on_hand).toFixed(2)} {item.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="transfer-outlet">To Outlet</FieldLabel>
                  <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                    <SelectTrigger id="transfer-outlet">
                      <SelectValue placeholder="Select outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((outlet) => (
                        <SelectItem key={outlet.outlet_tenant_id} value={outlet.outlet_tenant_id}>
                          {outlet.outlet_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="transfer-qty">Quantity</FieldLabel>
                  <Input
                    id="transfer-qty"
                    type="number"
                    min={0.001}
                    step="any"
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    placeholder="e.g. 10.5"
                  />
                </Field>
              </div>
              <Button type="submit" className="w-fit gap-2" disabled={transferring}>
                <ArrowRight data-icon="inline-start" />
                {transferring ? 'Transferring...' : 'Transfer Stock'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

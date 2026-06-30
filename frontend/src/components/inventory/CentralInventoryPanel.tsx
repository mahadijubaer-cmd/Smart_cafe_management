'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Central Inventory — Brand Warehouse</CardTitle>
        </CardHeader>
        <CardContent>
          <InventoryTable items={items} loading={loading} />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-[#1A4D2E]" />
            Transfer Stock to Outlet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTransfer} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-item">Item</Label>
                <select
                  id="transfer-item"
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                >
                  <option value="">— Select central item —</option>
                  {items.map((item) => (
                    <option key={item.item_id} value={item.item_id}>
                      {item.name} ({Number(item.quantity_on_hand).toFixed(2)} {item.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-outlet">To Outlet</Label>
                <select
                  id="transfer-outlet"
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value)}
                >
                  <option value="">— Select outlet —</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.outlet_tenant_id} value={outlet.outlet_tenant_id}>
                      {outlet.outlet_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-qty">Quantity</Label>
                <Input
                  id="transfer-qty"
                  type="number"
                  min={0.001}
                  step="any"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  placeholder="e.g. 10.5"
                />
              </div>
            </div>
            <Button type="submit" className="bg-[#1A4D2E] text-white hover:bg-[#163f25] gap-2" disabled={transferring}>
              <ArrowRight className="h-4 w-4" />
              {transferring ? 'Transferring...' : 'Transfer Stock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

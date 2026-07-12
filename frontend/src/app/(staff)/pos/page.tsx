'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import PageHeader from '@/components/layout/PageHeader'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import apiClient from '@/lib/api'
import type { Category, MenuItem, Order, TableMap } from '@/types'

interface PosCartLine {
  item: MenuItem
  quantity: number
}

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function StaffPosPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [tables, setTables] = useState<TableMap[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<number | 0>(0)
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [tableId, setTableId] = useState<string>('')
  const [guestName, setGuestName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      apiClient.get<Category[]>('/menu/categories'),
      apiClient.get<MenuItem[]>('/menu/items'),
      apiClient.get<TableMap[]>('/tables/'),
    ])
      .then(([catRes, itemRes, tableRes]) => {
        setCategories(catRes.data)
        setItems(itemRes.data)
        setTables(tableRes.data)
        if (catRes.data.length > 0) setActiveCategoryId(catRes.data[0].category_id)
      })
      .catch(() => toast.error('Could not load menu/tables.'))
      .finally(() => setLoading(false))
  }, [])

  const visibleItems = useMemo(
    () => (activeCategoryId ? items.filter((i) => i.category_id === activeCategoryId) : items),
    [items, activeCategoryId]
  )

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0),
    [cart]
  )

  const addToCart = (item: MenuItem) => {
    setCart((current) => {
      const existing = current.find((l) => l.item.item_id === item.item_id)
      if (existing) {
        return current.map((l) => (l.item.item_id === item.item_id ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...current, { item, quantity: 1 }]
    })
  }

  const changeQuantity = (itemId: string, delta: number) => {
    setCart((current) =>
      current
        .map((l) => (l.item.item_id === itemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    )
  }

  const resetOrder = () => {
    setCart([])
    setGuestName('')
    setNotes('')
    setTableId('')
  }

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast.error('Add at least one item')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiClient.post<Order>('/orders/staff-pos', {
        items: cart.map((l) => ({ item_id: l.item.item_id, quantity: l.quantity })),
        table_id: tableId ? Number(tableId) : null,
        guest_name: guestName.trim() || null,
        special_notes: notes.trim() || null,
      })
      toast.success(`Order placed — ${formatCurrency(Number(res.data.total_amount))}. Confirmed, pay at counter.`)
      resetOrder()
    } catch {
      // apiClient interceptor shows the error toast
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <PageHeader
          title="POS — New Order"
          description="Take an order for a walk-in customer. No account needed — pay at the counter."
        />

        <div className="mt-4 flex gap-2 overflow-x-auto border-b border-border pb-3">
          {categories.map((cat) => (
            <Button
              key={cat.category_id}
              type="button"
              size="sm"
              variant={activeCategoryId === cat.category_id ? 'default' : 'secondary'}
              className="shrink-0 rounded-full"
              onClick={() => setActiveCategoryId(cat.category_id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const line = cart.find((l) => l.item.item_id === item.item_id)
            return (
              <div key={item.item_id} className="rounded-2xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{item.name}</p>
                  <p className="font-bold text-primary">{formatCurrency(Number(item.price))}</p>
                </div>
                <div className="mt-3 flex justify-end">
                  {line ? (
                    <div className="flex h-8 items-center gap-1 overflow-hidden rounded-full border border-border">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => changeQuantity(item.item_id, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => changeQuantity(item.item_id, 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full"
                      onClick={() => addToCart(item)}
                      disabled={!item.is_available}
                    >
                      + Add
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <aside className="h-fit rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold text-foreground">Order summary</h2>

        <div className="mt-3 space-y-2">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items yet</p>
          ) : (
            cart.map((line) => (
              <div key={line.item.item_id} className="flex justify-between text-sm">
                <span>{line.quantity}× {line.item.name}</span>
                <span>{formatCurrency(Number(line.item.price) * line.quantity)}</span>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>

        <FieldGroup className="mt-4 gap-3">
          <Field>
            <FieldLabel htmlFor="pos-table" className="text-xs font-semibold uppercase text-muted-foreground">
              Table (optional)
            </FieldLabel>
            <Select value={tableId || 'none'} onValueChange={(value) => setTableId(value === 'none' ? '' : value)}>
              <SelectTrigger id="pos-table">
                <SelectValue placeholder="Takeaway / counter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Takeaway / counter</SelectItem>
                {tables.map((t) => (
                  <SelectItem key={t.table_id} value={String(t.table_id)}>
                    Table {t.table_number} ({t.zone})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="pos-guest-name" className="text-xs font-semibold uppercase text-muted-foreground">
              Customer name (optional)
            </FieldLabel>
            <Input id="pos-guest-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </Field>

          <Field>
            <FieldLabel htmlFor="pos-notes" className="text-xs font-semibold uppercase text-muted-foreground">
              Notes
            </FieldLabel>
            <Input id="pos-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </FieldGroup>

        <Button type="button" className="mt-4 w-full rounded-full" onClick={handleSubmit} disabled={submitting || cart.length === 0}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Placing order…' : 'Place order'}
        </Button>
      </aside>
    </div>
  )
}

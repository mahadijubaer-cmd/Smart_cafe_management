'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import apiClient from '@/lib/api'
import { isRestaurantSegment } from '@/lib/segments'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import type { GuestOrderGroup, PublicMenuItem, PublicMenuResponse, PublicTenantInfoResponse } from '@/types'

interface GuestCartLine {
  item: PublicMenuItem
  quantity: number
}

const KIOSK_IDLE_RESET_MS = 90_000

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PublicMenuPage() {
  const params = useParams<{ public_slug: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = params.public_slug
  const isKiosk = searchParams.get('mode') === 'kiosk'
  const initialTable = searchParams.get('t') ?? ''

  const [info, setInfo] = useState<PublicTenantInfoResponse | null>(null)
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null)
  // A food-court menu has no unified categories — filter by vendor instead.
  const [activeCategoryId, setActiveCategoryId] = useState<number | 0>(0)
  const [activeVendorId, setActiveVendorId] = useState<string | 0>(0)
  const [cart, setCart] = useState<GuestCartLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [tableNumber, setTableNumber] = useState(initialTable)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [placedGroup, setPlacedGroup] = useState<GuestOrderGroup | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [payingOnline, setPayingOnline] = useState(false)

  const isFoodCourt = Boolean(menu?.vendors && menu.vendors.length > 0)
  // Cafeteria-segment tenants may publish a read-only public menu (RFC-007 Phase D) —
  // they already have accounts and order through the normal app, so no guest checkout here.
  const canOrder = Boolean(info && isRestaurantSegment(info.tenant_type))

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    Promise.all([
      apiClient.get<PublicTenantInfoResponse>(`/public/${slug}/info`),
      apiClient.get<PublicMenuResponse>(`/public/${slug}/menu`),
    ])
      .then(([infoRes, menuRes]) => {
        if (cancelled) return
        setInfo(infoRes.data)
        setMenu(menuRes.data)
        if (menuRes.data.categories.length > 0) {
          setActiveCategoryId(menuRes.data.categories[0].category_id)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  // Kiosk mode: idle-reset to the menu root after 90s of no interaction (spec: kiosk mode).
  useEffect(() => {
    if (!isKiosk) return
    let timer = window.setTimeout(() => {}, 0)

    const reset = () => {
      setCart([])
      setCheckoutOpen(false)
      setGuestName('')
      setGuestPhone('')
      setPlacedGroup(null)
      setQrData(null)
    }

    const bump = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(reset, KIOSK_IDLE_RESET_MS)
    }

    const events: (keyof WindowEventMap)[] = ['click', 'touchstart', 'keydown']
    events.forEach((evt) => window.addEventListener(evt, bump))
    bump()

    return () => {
      window.clearTimeout(timer)
      events.forEach((evt) => window.removeEventListener(evt, bump))
    }
  }, [isKiosk])

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0),
    [cart]
  )
  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart])

  const visibleItems = useMemo(() => {
    if (!menu) return []
    if (isFoodCourt) {
      return activeVendorId ? menu.items.filter((item) => item.vendor_id === activeVendorId) : menu.items
    }
    return activeCategoryId ? menu.items.filter((item) => item.category_id === activeCategoryId) : menu.items
  }, [menu, isFoodCourt, activeVendorId, activeCategoryId])

  const addToCart = (item: PublicMenuItem) => {
    setCart((current) => {
      const existing = current.find((line) => line.item.item_id === item.item_id)
      if (existing) {
        return current.map((line) =>
          line.item.item_id === item.item_id ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [...current, { item, quantity: 1 }]
    })
  }

  const changeQuantity = (itemId: string, delta: number) => {
    setCart((current) =>
      current
        .map((line) => (line.item.item_id === itemId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    )
  }

  const handleSubmitOrder = async () => {
    if (cart.length === 0) return
    if (!tableNumber.trim()) {
      toast.error('Enter your table number')
      return
    }
    if (!guestName.trim() || !guestPhone.trim()) {
      toast.error('Name and phone are required')
      return
    }

    setSubmitting(true)
    try {
      const res = await apiClient.post<GuestOrderGroup>(`/public/${slug}/orders`, {
        items: cart.map((line) => ({ item_id: line.item.item_id, quantity: line.quantity })),
        table_number: tableNumber.trim(),
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        is_kiosk: isKiosk,
      })
      toast.success(
        res.data.orders.length > 1
          ? `${res.data.orders.length} tickets placed! Waiting for staff to confirm.`
          : 'Order placed! Waiting for staff confirmation.'
      )
      setCart([])
      setCheckoutOpen(false)
      setPlacedGroup(res.data)

      apiClient
        .get<{ data: string }>(`/public/orders/${res.data.guest_token}/qr`)
        .then((qrRes) => setQrData(qrRes.data.data))
        .catch(() => setQrData(null))
    } catch {
      // apiClient's interceptor already shows a toast for the error detail
    } finally {
      setSubmitting(false)
    }
  }

  const handlePayOnline = async () => {
    if (!placedGroup) return
    setPayingOnline(true)
    try {
      const res = await apiClient.post<GuestOrderGroup>(`/public/orders/${placedGroup.guest_token}/pay`)
      setPlacedGroup(res.data)
      toast.success('Payment received — thank you!')
    } catch {
      // apiClient's interceptor already shows a toast for the error detail
    } finally {
      setPayingOnline(false)
    }
  }

  if (placedGroup) {
    const trackingPath = `/m/${slug}/track/${placedGroup.guest_token}`
    const allPaid = placedGroup.orders.every((o) => o.payment_status === 'paid')
    const canPayOnline = info?.guest_checkout_mode === 'online' && !allPaid
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-6 py-10 text-center">
        <Card className="w-full max-w-sm rounded-2xl p-6 shadow-sm">
          <p className="text-4xl">✅</p>
          <h1 className="mt-3 text-xl font-black text-foreground">
            {placedGroup.orders.length > 1 ? 'Orders placed!' : 'Order placed!'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {allPaid
              ? 'Paid — waiting for staff to confirm.'
              : canPayOnline
                ? 'Waiting for staff to confirm — pay online now or at the counter.'
                : "Waiting for staff to confirm — pay at the counter once it's ready."}
          </p>

          {placedGroup.orders.length > 1 ? (
            <div className="flex flex-col mt-4 text-left gap-2">
              {placedGroup.orders.map((o) => (
                <div key={o.order_id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
                  <span className="font-semibold text-foreground">{o.vendor_name ?? 'Order'}</span>
                  <span className="text-muted-foreground">{formatCurrency(Number(o.total_amount))}</span>
                </div>
              ))}
            </div>
          ) : null}

          {canPayOnline ? (
            <Button
              type="button"
              variant="outline"
              onClick={handlePayOnline}
              disabled={payingOnline}
              className="mt-4 w-full rounded-full border-2 border-primary text-primary hover:bg-primary/10"
            >
              {payingOnline ? 'Processing…' : `Pay online now — ${formatCurrency(Number(placedGroup.total_amount))}`}
            </Button>
          ) : null}

          <div className="mx-auto mt-5 flex h-40 w-40 items-center justify-center rounded-2xl border border-border bg-muted">
            {qrData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${qrData}`} alt="Tracking QR code" className="h-36 w-36 object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">Loading QR…</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Scan or save this link to track your order</p>

          <Button
            type="button"
            onClick={() => router.push(trackingPath)}
            className="mt-5 w-full rounded-full"
          >
            Track my order →
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPlacedGroup(null)
              setQrData(null)
            }}
            className="mt-3 w-full rounded-full"
          >
            Back to menu
          </Button>
        </Card>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Loading menu…</p>
      </main>
    )
  }

  if (error || !info || !menu) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 text-center">
        <div>
          <p className="text-4xl">🍽️</p>
          <h1 className="mt-4 text-xl font-bold text-foreground">Menu not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">This link is invalid or the venue hasn&apos;t enabled guest ordering.</p>
        </div>
      </main>
    )
  }

  return (
    <main className={`min-h-screen bg-muted/30 pb-32 ${isKiosk ? 'select-none' : ''}`}>
      <header className="px-6 py-8 text-center text-white" style={{ backgroundColor: info.brand_color }}>
        {info.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.logo_url} alt={info.name} className="mx-auto h-14 w-14 rounded-2xl object-cover" />
        ) : null}
        <h1 className="mt-2 text-3xl font-black tracking-tight">{info.name}</h1>
        {info.city ? <p className="mt-1 text-sm text-white/80">{info.city}</p> : null}
        <p className="mt-3 text-xs uppercase tracking-widest text-white/60">
          {!canOrder
            ? 'Browse our menu — log in to your account to order'
            : isFoodCourt
              ? 'Food court guest ordering — order from any stall'
              : 'Guest ordering — no account needed'}
        </p>
      </header>

      <div className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-border bg-background px-4 py-3">
        {isFoodCourt ? (
          <>
            <Button
              type="button"
              size="sm"
              variant={activeVendorId === 0 ? 'default' : 'secondary'}
              className="shrink-0 rounded-full"
              onClick={() => setActiveVendorId(0)}
            >
              All stalls
            </Button>
            {menu.vendors?.map((v) => (
              <Button
                key={v.vendor_id}
                type="button"
                size="sm"
                variant={activeVendorId === v.vendor_id ? 'default' : 'secondary'}
                className="shrink-0 rounded-full"
                onClick={() => setActiveVendorId(v.vendor_id)}
              >
                {v.vendor_name}
              </Button>
            ))}
          </>
        ) : (
          menu.categories.map((cat) => (
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
          ))
        )}
      </div>

      <div className="grid gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item) => {
          const line = cart.find((l) => l.item.item_id === item.item_id)
          return (
            <Card key={item.item_id} className="rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-foreground">{item.name}</h3>
                  {isFoodCourt && item.vendor_name ? (
                    <Badge variant="secondary" className="mt-1">{item.vendor_name}</Badge>
                  ) : null}
                </div>
                <p className="font-extrabold text-primary">{formatCurrency(Number(item.price))}</p>
              </div>
              {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}

              {canOrder ? (
              <div className="mt-4 flex justify-end">
                {line ? (
                  <div className="flex h-9 items-center overflow-hidden rounded-full border border-input">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-full w-9 rounded-none font-bold"
                      onClick={() => changeQuantity(item.item_id, -1)}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold">{line.quantity}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-full w-9 rounded-none font-bold"
                      onClick={() => changeQuantity(item.item_id, 1)}
                    >
                      +
                    </Button>
                  </div>
                ) : (
                  <Button type="button" size="sm" className="rounded-full" onClick={() => addToCart(item)}>
                    + Add
                  </Button>
                )}
              </div>
              ) : null}
            </Card>
          )
        })}
      </div>

      {canOrder && itemCount > 0 && !checkoutOpen ? (
        <Button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          className="fixed inset-x-4 bottom-4 z-30 flex h-auto items-center justify-between rounded-2xl px-6 py-4 shadow-2xl"
        >
          <span className="font-semibold">{itemCount} item{itemCount > 1 ? 's' : ''}</span>
          <span className="font-bold">{formatCurrency(total)} · Checkout →</span>
        </Button>
      ) : null}

      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl sm:rounded-2xl">
          <SheetHeader>
            <SheetTitle>Confirm your order</SheetTitle>
            <SheetDescription>
              {isFoodCourt
                ? "Pay at the counter after each stall confirms. Items from different stalls become separate tickets."
                : 'Pay at the counter after staff confirms your order.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col mt-4 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-table">Table number</Label>
              <Input
                id="guest-table"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="e.g. T-04"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-name">Your name</Label>
              <Input
                id="guest-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-phone">Phone number</Label>
              <Input
                id="guest-phone"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 font-semibold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>

          <SheetFooter className="mt-4 flex-row gap-3">
            <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={() => setCheckoutOpen(false)}>
              Back
            </Button>
            <Button
              type="button"
              className="flex-[1.5] rounded-full"
              onClick={handleSubmitOrder}
              disabled={submitting}
            >
              {submitting ? 'Placing order…' : 'Place order'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  )
}

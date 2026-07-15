'use client'

/**
 * Kiosk ordering experience (RFC-010 — specs/modules/kiosk.md).
 *
 * `KioskExperience` is data-source-agnostic (renderer contract, RFC-010 §2.5):
 * menu/config/order-placement come in as props, so the admin preview renders
 * the identical component against JWT preview endpoints with ordering disabled
 * (KSK-8). `KioskApp` is the thin device shell wiring it to /device/*.
 *
 * Accessibility (RFC-010 §2.7): ≥48px touch targets w/ ≥8px gaps (WCAG 2.5.8),
 * idle warning with ≥20s extend (WCAG 2.2.1), aria-live status announcements
 * (WCAG 4.1.3), large-text + high-contrast modes (WCAG 1.4.4/1.4.3), static
 * attract under prefers-reduced-motion (WCAG 2.2.2), EN/BN chrome toggle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Accessibility, ChevronLeft, Languages, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'

import deviceApi, { refreshDeviceProfile, type DeviceProfile } from '@/lib/deviceApi'
import { useDeviceWebSocket } from '@/hooks/useDeviceWebSocket'
import {
  ALLERGEN_LABELS,
  DIETARY_LABELS,
  t,
  type DeviceLang,
} from '@/components/device/strings'

// ── Shared types (mirrors PublicMenuResponse / kiosk_config shapes) ───────────

export interface KioskMenuItem {
  item_id: string
  category_id: number
  name: string
  description: string | null
  price: string
  image_url: string | null
  is_available: boolean
  allergens: string[]
  dietary_tags: string[]
  vendor_id?: string | null
  vendor_name?: string | null
}

export interface KioskMenuCategory {
  category_id: number
  name: string
}

export interface KioskMenu {
  categories: KioskMenuCategory[]
  items: KioskMenuItem[]
  vendors?: { vendor_id: string; vendor_name: string }[] | null
}

export interface KioskConfigShape {
  welcome_text_en?: string
  welcome_text_bn?: string
  attract_image_urls?: string[]
  featured_item_ids?: string[]
  accent_color?: string | null
  idle_timeout_seconds?: number
  allow_guest_name?: boolean
  show_dietary_tags?: boolean
}

interface CartLine {
  item: KioskMenuItem
  quantity: number
}

type Screen = 'attract' | 'browse' | 'detail' | 'cart' | 'number'

export interface PlacedOrder {
  pickupNumber: number | null
}

export interface KioskExperienceProps {
  tenantName: string
  menu: KioskMenu | null
  config: KioskConfigShape
  /** Absent → preview mode: submit disabled, "Preview mode" banner shown (KSK-8). */
  placeOrder?: (
    items: { item_id: string; quantity: number }[],
    guestName: string | null,
    notes: string | null,
  ) => Promise<PlacedOrder>
}

const IDLE_WARNING_SECONDS = 20 // WCAG 2.2.1: ≥20s to respond
const ORDER_NUMBER_AUTORETURN_SECONDS = 30

function formatPrice(price: string | number) {
  return `৳${Number(price).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/** WCAG 1.4.3 check for the tenant accent used as button fill under white text (KSK-7). */
function accentPassesContrast(hex: string | null | undefined): boolean {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return false
  const lum = [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2]
  return 1.05 / (L + 0.05) >= 4.5
}

export function KioskExperience({ tenantName, menu, config, placeOrder }: KioskExperienceProps) {
  const [screen, setScreen] = useState<Screen>('attract')
  const [lang, setLang] = useState<DeviceLang>('en')
  const [largeText, setLargeText] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [activeCategory, setActiveCategory] = useState<number | 'featured' | 'all'>('all')
  const [detailItem, setDetailItem] = useState<KioskMenuItem | null>(null)
  const [detailQty, setDetailQty] = useState(1)
  const [cart, setCart] = useState<CartLine[]>([])
  const [guestName, setGuestName] = useState('')
  const [notes, setNotes] = useState('')
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [pickupNumber, setPickupNumber] = useState<number | null>(null)

  // Idle timeout (KSK-6 / WCAG 2.2.1)
  const idleTimeoutSeconds = config.idle_timeout_seconds ?? 60
  const [idleWarning, setIdleWarning] = useState(false)
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(IDLE_WARNING_SECONDS)
  const lastActivityRef = useRef(Date.now())

  const isPreview = placeOrder === undefined

  const resetToAttract = useCallback(() => {
    // KSK-6: one customer's state must never leak to the next.
    setScreen('attract')
    setCart([])
    setGuestName('')
    setNotes('')
    setDetailItem(null)
    setPlaceError(null)
    setPickupNumber(null)
    setActiveCategory('all')
    setLargeText(false)
    setHighContrast(false)
    setLang('en')
    setIdleWarning(false)
  }, [])

  const touch = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (idleWarning) setIdleWarning(false)
  }, [idleWarning])

  // Idle watcher — runs on every screen past attract.
  useEffect(() => {
    if (screen === 'attract') return
    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current
      if (screen === 'number') {
        if (idleMs > ORDER_NUMBER_AUTORETURN_SECONDS * 1000) resetToAttract()
        return
      }
      if (!idleWarning && idleMs > idleTimeoutSeconds * 1000) {
        setIdleWarning(true)
        setWarningSecondsLeft(IDLE_WARNING_SECONDS)
      }
    }, 1000)
    return () => window.clearInterval(interval)
  }, [screen, idleWarning, idleTimeoutSeconds, resetToAttract])

  // Warning countdown
  useEffect(() => {
    if (!idleWarning) return
    const interval = window.setInterval(() => {
      setWarningSecondsLeft((s) => {
        if (s <= 1) {
          resetToAttract()
          return IDLE_WARNING_SECONDS
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [idleWarning, resetToAttract])

  const itemsById = useMemo(() => new Map((menu?.items ?? []).map((i) => [i.item_id, i])), [menu])
  const featuredItems = useMemo(
    () => (config.featured_item_ids ?? []).map((id) => itemsById.get(id)).filter(Boolean) as KioskMenuItem[],
    [config.featured_item_ids, itemsById],
  )
  const visibleItems = useMemo(() => {
    const items = menu?.items ?? []
    if (activeCategory === 'featured') return featuredItems
    if (activeCategory === 'all') return items
    return items.filter((i) => i.category_id === activeCategory)
  }, [menu, activeCategory, featuredItems])

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0)
  const cartTotal = cart.reduce((sum, l) => sum + Number(l.item.price) * l.quantity, 0)

  const accent = accentPassesContrast(config.accent_color) ? (config.accent_color as string) : undefined

  const addToCart = (item: KioskMenuItem, quantity: number) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.item_id === item.item_id)
      if (existing) {
        return prev.map((l) =>
          l.item.item_id === item.item_id ? { ...l, quantity: l.quantity + quantity } : l,
        )
      }
      return [...prev, { item, quantity }]
    })
  }

  const submitOrder = async () => {
    if (!placeOrder || cart.length === 0) return
    setPlacing(true)
    setPlaceError(null)
    try {
      const placed = await placeOrder(
        cart.map((l) => ({ item_id: l.item.item_id, quantity: l.quantity })),
        config.allow_guest_name !== false && guestName.trim() ? guestName.trim() : null,
        notes.trim() || null,
      )
      setPickupNumber(placed.pickupNumber)
      setScreen('number')
      lastActivityRef.current = Date.now()
    } catch {
      setPlaceError('Could not place the order — please try again or order at the counter')
    } finally {
      setPlacing(false)
    }
  }

  const welcome = lang === 'bn'
    ? config.welcome_text_bn || config.welcome_text_en || t('bn', 'welcomeDefault')
    : config.welcome_text_en || t('en', 'welcomeDefault')

  // Root classes: large-text bumps the rem baseline ~25% (WCAG 1.4.4);
  // high-contrast forces strong fg/bg pairs (WCAG 1.4.3+).
  const rootClass = [
    'flex min-h-screen flex-col bg-background text-foreground',
    largeText ? 'text-[125%]' : 'text-[100%]',
    highContrast ? 'contrast-125 saturate-150' : '',
  ].join(' ')

  const accentStyle = accent ? ({ '--color-primary': accent } as React.CSSProperties) : undefined

  // ── Attract ────────────────────────────────────────────────────────────────
  if (screen === 'attract') {
    return (
      <button
        type="button"
        className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-primary p-8 text-primary-foreground"
        style={accentStyle}
        onClick={() => {
          touch()
          setScreen('browse')
        }}
        aria-label={`${welcome}. ${t(lang, 'touchToStart')}`}
      >
        {(config.attract_image_urls?.length ?? 0) > 0 ? (
          <img
            src={config.attract_image_urls![0]}
            alt=""
            className="max-h-[40vh] max-w-[80vw] rounded-2xl object-cover motion-reduce:animate-none"
          />
        ) : (
          <span className="text-8xl" aria-hidden="true">🍽</span>
        )}
        <div className="text-center">
          <h1 className="text-5xl font-black md:text-6xl">{welcome}</h1>
          <p className="mt-3 text-2xl opacity-90">{tenantName}</p>
        </div>
        <span className="motion-safe:animate-pulse rounded-full border-2 border-current px-10 py-5 text-3xl font-bold motion-reduce:animate-none">
          {t(lang, 'touchToStart')}
        </span>
        {isPreview ? <PreviewBanner /> : null}
      </button>
    )
  }

  return (
    <div className={rootClass} style={accentStyle} onPointerDown={touch} onKeyDown={touch}>
      {isPreview ? <PreviewBanner /> : null}

      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          {screen !== 'browse' ? (
            <button
              type="button"
              onClick={() => setScreen(screen === 'detail' ? 'browse' : 'browse')}
              className="flex h-12 min-w-12 items-center justify-center gap-1 rounded-xl border px-3 text-lg font-semibold hover:bg-accent"
            >
              <ChevronLeft aria-hidden="true" /> {t(lang, 'back')}
            </button>
          ) : null}
          <span className="text-xl font-bold">{tenantName}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Language toggle (EN ⇄ BN) */}
          <button
            type="button"
            onClick={() => setLang((l) => (l === 'en' ? 'bn' : 'en'))}
            className="flex h-12 items-center gap-2 rounded-xl border px-4 text-lg font-semibold hover:bg-accent"
            aria-label={`Switch language to ${lang === 'en' ? 'Bangla' : 'English'}`}
          >
            <Languages aria-hidden="true" /> {t(lang, 'language')}
          </button>
          {/* Accessibility toggle */}
          <button
            type="button"
            onClick={() => {
              // Cycle: normal → large text → large + high contrast → normal
              if (!largeText) setLargeText(true)
              else if (!highContrast) setHighContrast(true)
              else {
                setLargeText(false)
                setHighContrast(false)
              }
            }}
            className={`flex h-12 items-center gap-2 rounded-xl border px-4 text-lg font-semibold hover:bg-accent ${largeText ? 'bg-primary text-primary-foreground' : ''}`}
            aria-label={`${t(lang, 'accessibility')}: ${t(lang, 'largeText')} ${largeText ? 'on' : 'off'}, ${t(lang, 'highContrast')} ${highContrast ? 'on' : 'off'}`}
            aria-pressed={largeText}
          >
            <Accessibility aria-hidden="true" />
            <span className="hidden sm:inline">{t(lang, 'accessibility')}</span>
          </button>
          {/* Cart */}
          {screen === 'browse' || screen === 'detail' ? (
            <button
              type="button"
              onClick={() => setScreen('cart')}
              disabled={cart.length === 0}
              className="relative flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-lg font-bold text-primary-foreground disabled:opacity-40"
              aria-label={`${t(lang, 'yourOrder')}: ${cartCount} items, ${formatPrice(cartTotal)}`}
            >
              <ShoppingBag aria-hidden="true" />
              {cartCount > 0 ? `${cartCount} · ${formatPrice(cartTotal)}` : t(lang, 'yourOrder')}
            </button>
          ) : null}
        </div>
      </header>

      {/* Live region for cart/status announcements (WCAG 4.1.3) */}
      <div aria-live="polite" className="sr-only">
        {cartCount > 0 ? `${cartCount} items in order, total ${formatPrice(cartTotal)}` : ''}
      </div>

      {/* ── Browse ── */}
      {screen === 'browse' ? (
        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 space-y-2 overflow-y-auto border-r bg-card p-3 md:w-56" aria-label="Categories">
            {featuredItems.length > 0 ? (
              <CategoryButton
                label={`★ ${t(lang, 'featured')}`}
                active={activeCategory === 'featured'}
                onClick={() => setActiveCategory('featured')}
              />
            ) : null}
            <CategoryButton label="All" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
            {(menu?.categories ?? []).map((c) => (
              <CategoryButton
                key={c.category_id}
                label={c.name}
                active={activeCategory === c.category_id}
                onClick={() => setActiveCategory(c.category_id)}
              />
            ))}
          </nav>
          <main className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 lg:grid-cols-3 xl:grid-cols-4">
            {menu === null ? (
              <p className="col-span-full p-8 text-center text-xl text-muted-foreground">…</p>
            ) : (
              visibleItems.map((item) => (
                <button
                  key={item.item_id}
                  type="button"
                  onClick={() => {
                    setDetailItem(item)
                    setDetailQty(1)
                    setScreen('detail')
                  }}
                  className="flex min-h-[180px] flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-transform hover:bg-accent motion-safe:active:scale-95"
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center bg-muted text-4xl" aria-hidden="true">🍽</div>
                  )}
                  <div className="flex flex-1 flex-col justify-between gap-1 p-3">
                    <span className="text-lg font-semibold leading-snug">{item.name}</span>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-primary">{formatPrice(item.price)}</span>
                      {item.vendor_name ? (
                        <span className="text-xs text-muted-foreground">{item.vendor_name}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </main>
        </div>
      ) : null}

      {/* ── Item detail ── */}
      {screen === 'detail' && detailItem ? (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-y-auto p-6">
          {detailItem.image_url ? (
            <img src={detailItem.image_url} alt="" className="max-h-64 w-full rounded-2xl object-cover" />
          ) : null}
          <div>
            <h2 className="text-3xl font-black">{detailItem.name}</h2>
            <p className="mt-1 text-2xl font-bold text-primary">{formatPrice(detailItem.price)}</p>
          </div>
          {detailItem.description ? <p className="text-xl text-muted-foreground">{detailItem.description}</p> : null}

          {/* Allergen chips: icon + text, never icon-only (EU FIC / RFC-010 §2.7) */}
          {detailItem.allergens.length > 0 ? (
            <div>
              <h3 className="mb-2 text-lg font-bold">{t(lang, 'allergens')}</h3>
              <ul className="flex flex-wrap gap-2">
                {detailItem.allergens.map((code) => {
                  const label = ALLERGEN_LABELS[code]
                  return (
                    <li key={code} className="flex items-center gap-2 rounded-full border-2 border-amber-500/60 bg-amber-500/10 px-4 py-2 text-lg font-semibold">
                      <span aria-hidden="true">{label?.icon ?? '⚠️'}</span>
                      {label ? label[lang] : code}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {config.show_dietary_tags !== false && detailItem.dietary_tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {detailItem.dietary_tags.map((tag) => {
                const label = DIETARY_LABELS[tag]
                return (
                  <li key={tag} className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                    <span aria-hidden="true">{label?.icon}</span>
                    {label ? label[lang] : tag}
                  </li>
                )
              })}
            </ul>
          ) : null}

          <div className="mt-auto flex items-center gap-4">
            <QuantityStepper lang={lang} value={detailQty} onChange={setDetailQty} />
            <button
              type="button"
              onClick={() => {
                addToCart(detailItem, detailQty)
                setScreen('browse')
              }}
              className="h-16 flex-1 rounded-2xl bg-primary text-2xl font-bold text-primary-foreground motion-safe:active:scale-95"
            >
              {t(lang, 'addToOrder')} · {formatPrice(Number(detailItem.price) * detailQty)}
            </button>
          </div>
        </main>
      ) : null}

      {/* ── Cart / confirm ── */}
      {screen === 'cart' ? (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-6">
          <h2 className="text-3xl font-black">{t(lang, 'yourOrder')}</h2>
          {cart.length === 0 ? (
            <p className="py-12 text-center text-xl text-muted-foreground">{t(lang, 'emptyCart')}</p>
          ) : (
            <>
              <ul className="space-y-3">
                {cart.map((line) => (
                  <li key={line.item.item_id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl font-semibold">{line.item.name}</p>
                      <p className="text-lg text-muted-foreground">{formatPrice(line.item.price)}</p>
                    </div>
                    <QuantityStepper
                      lang={lang}
                      value={line.quantity}
                      onChange={(q) =>
                        setCart((prev) =>
                          prev.map((l) => (l.item.item_id === line.item.item_id ? { ...l, quantity: q } : l)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((l) => l.item.item_id !== line.item.item_id))}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border text-destructive hover:bg-destructive/10"
                      aria-label={`${t(lang, 'remove')} ${line.item.name}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>

              {config.allow_guest_name !== false ? (
                <label className="block">
                  <span className="mb-1 block text-lg font-semibold">{t(lang, 'yourName')}</span>
                  <input
                    value={guestName}
                    maxLength={80}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="h-14 w-full rounded-xl border bg-background px-4 text-xl"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-lg font-semibold">{t(lang, 'notes')}</span>
                <input
                  value={notes}
                  maxLength={200}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-14 w-full rounded-xl border bg-background px-4 text-xl"
                />
              </label>

              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 text-center text-lg font-semibold">
                💳 {t(lang, 'payAtCounter')}
              </div>

              {placeError ? (
                <p aria-live="assertive" className="text-center text-lg font-semibold text-destructive">{placeError}</p>
              ) : null}

              <div className="mt-auto flex items-center justify-between gap-4 border-t pt-4">
                <span className="text-2xl font-black">
                  {t(lang, 'total')}: {formatPrice(cartTotal)}
                </span>
                <button
                  type="button"
                  onClick={() => void submitOrder()}
                  disabled={placing || isPreview}
                  className="h-16 rounded-2xl bg-primary px-10 text-2xl font-bold text-primary-foreground disabled:opacity-50 motion-safe:active:scale-95"
                >
                  {placing ? t(lang, 'placingOrder') : t(lang, 'placeOrder')}
                </button>
              </div>
            </>
          )}
        </main>
      ) : null}

      {/* ── Pickup number ── */}
      {screen === 'number' ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center" aria-live="assertive">
          <h2 className="text-4xl font-black text-primary">✓ {t(lang, 'orderPlaced')}</h2>
          <p className="text-2xl text-muted-foreground">{t(lang, 'yourNumber')}</p>
          <p className="text-[8rem] font-black leading-none tracking-tight">{pickupNumber ?? '—'}</p>
          <p className="max-w-md text-xl text-muted-foreground">{t(lang, 'collectInstructions')}</p>
          <button
            type="button"
            onClick={resetToAttract}
            className="h-16 rounded-2xl border-2 px-10 text-2xl font-bold hover:bg-accent"
          >
            {t(lang, 'startNewOrder')}
          </button>
        </main>
      ) : null}

      {/* ── Idle warning modal (WCAG 2.2.1) ── */}
      {idleWarning ? (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label={t(lang, 'stillThereTitle')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        >
          <div className="flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl bg-card p-10 text-center shadow-2xl">
            <h2 className="text-4xl font-black">{t(lang, 'stillThereTitle')}</h2>
            <p className="text-2xl text-muted-foreground">
              {t(lang, 'stillThereBody', { seconds: warningSecondsLeft })}
            </p>
            <button
              type="button"
              onClick={touch}
              className="h-20 w-full rounded-2xl bg-primary text-3xl font-bold text-primary-foreground motion-safe:active:scale-95"
            >
              {t(lang, 'stillHere')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CategoryButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`block min-h-12 w-full rounded-xl px-4 py-3 text-left text-lg font-semibold transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
      }`}
    >
      {label}
    </button>
  )
}

function QuantityStepper({ lang, value, onChange }: { lang: DeviceLang; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t(lang, 'quantity')}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex h-12 w-12 items-center justify-center rounded-xl border text-xl hover:bg-accent"
        aria-label="Decrease quantity"
      >
        <Minus aria-hidden="true" />
      </button>
      <span className="w-10 text-center text-2xl font-bold" aria-live="polite">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        className="flex h-12 w-12 items-center justify-center rounded-xl border text-xl hover:bg-accent"
        aria-label="Increase quantity"
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  )
}

function PreviewBanner() {
  return (
    <div className="pointer-events-none fixed left-1/2 top-2 z-[60] -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1 text-sm font-bold text-black shadow">
      Preview mode — orders disabled
    </div>
  )
}

// ── Device shell: wires the experience to /device/* (never used by preview) ──

export default function KioskApp({
  profile,
  onProfileRefresh,
}: {
  profile: DeviceProfile
  onProfileRefresh: (p: DeviceProfile) => void
}) {
  const [menu, setMenu] = useState<KioskMenu | null>(null)

  const loadMenu = useCallback(async () => {
    try {
      const res = await deviceApi.get('/device/menu')
      setMenu(res.data as KioskMenu)
    } catch {
      /* 401 handled by interceptor; transient errors keep the old menu */
    }
  }, [])

  useEffect(() => {
    void loadMenu()
    const interval = setInterval(() => void loadMenu(), 5 * 60_000)
    return () => clearInterval(interval)
  }, [loadMenu])

  // Live config/menu refresh via WS (KIOSK_CONFIG_UPDATED → /device/me).
  useDeviceWebSocket(profile.device_id, (event) => {
    if (event.type === 'KIOSK_CONFIG_UPDATED') {
      refreshDeviceProfile().then(onProfileRefresh).catch(() => undefined)
    }
  })

  const placeOrder = useCallback(
    async (
      items: { item_id: string; quantity: number }[],
      guestName: string | null,
      notes: string | null,
    ): Promise<PlacedOrder> => {
      const res = await deviceApi.post('/device/orders', {
        items,
        guest_name: guestName,
        special_notes: notes,
      })
      const orders = (res.data as { orders: { pickup_number: number | null }[] }).orders
      return { pickupNumber: orders[0]?.pickup_number ?? null }
    },
    [],
  )

  return (
    <KioskExperience
      tenantName={profile.tenant_name}
      menu={menu}
      config={(profile.kiosk_config ?? {}) as KioskConfigShape}
      placeOrder={placeOrder}
    />
  )
}

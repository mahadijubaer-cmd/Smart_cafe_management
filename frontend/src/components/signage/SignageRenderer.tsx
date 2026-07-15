'use client'

/**
 * Signage playlist renderer (RFC-010 — specs/modules/signage.md).
 *
 * Data-source-agnostic (renderer contract, RFC-010 §2.5): slides + data feeds
 * come in as props so the admin preview renders identical components (SGN-6).
 * Slides are filtered client-side by is_active + schedule window so a cached
 * playlist stays correct offline (SGN-2). Crossfade only, nothing flashes
 * (WCAG 2.3.1). Burn-in mitigation: 1–2px canvas shuffle every 5 min.
 */
import { useEffect, useMemo, useState } from 'react'

import { ALLERGEN_LABELS, t, type DeviceLang } from '@/components/device/strings'
import type { KioskMenu, KioskMenuItem } from '@/components/kiosk/KioskApp'

export interface SignageSlideShape {
  slide_id: string
  slide_type:
    | 'menu_board'
    | 'promo_image'
    | 'announcement'
    | 'order_status_board'
    | 'trending_items'
    | 'offers'
  position: number
  duration_seconds: number
  config: Record<string, unknown>
  active_from: string | null
  active_until: string | null
  is_active: boolean
}

export interface BoardOrder {
  order_id: string
  pickup_number: number
  status: string
}

export interface TrendingItem {
  item_id: string
  name: string
  image_url: string | null
  price: string
  quantity_sold: number
  rank: number
}

export interface SignageRendererProps {
  slides: SignageSlideShape[]
  menu: KioskMenu | null
  boardOrders: BoardOrder[]
  trending: TrendingItem[]
  tenantName: string
  lang?: DeviceLang
  online?: boolean
}

function slideVisibleNow(slide: SignageSlideShape, now: Date): boolean {
  if (!slide.is_active) return false
  if (slide.active_from && new Date(slide.active_from) > now) return false
  if (slide.active_until && new Date(slide.active_until) < now) return false
  return true
}

export default function SignageRenderer({
  slides,
  menu,
  boardOrders,
  trending,
  tenantName,
  lang = 'en',
  online = true,
}: SignageRendererProps) {
  const [index, setIndex] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [shuffle, setShuffle] = useState({ x: 0, y: 0 })

  // Re-evaluate schedule windows every 30s (SGN-2).
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const visible = useMemo(
    () => [...slides].sort((a, b) => a.position - b.position).filter((s) => slideVisibleNow(s, now)),
    [slides, now],
  )
  const current = visible.length > 0 ? visible[index % visible.length] : null

  // Advance by the current slide's duration.
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % Math.max(visible.length, 1)),
      Math.max(current.duration_seconds, 5) * 1000,
    )
    return () => clearTimeout(timer)
  }, [current, visible.length])

  // Burn-in mitigation: tiny translate shuffle every 5 min.
  useEffect(() => {
    const interval = setInterval(() => {
      setShuffle({ x: Math.round(Math.random() * 4 - 2), y: Math.round(Math.random() * 4 - 2) })
    }, 5 * 60_000)
    return () => clearInterval(interval)
  }, [])

  if (visible.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <span className="text-6xl" aria-hidden="true">🖥️</span>
        <h1 className="text-3xl font-bold">{t(lang, 'noContent')}</h1>
        <p className="text-xl text-muted-foreground">{tenantName}</p>
      </div>
    )
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-background text-foreground"
      style={{ transform: `translate(${shuffle.x}px, ${shuffle.y}px)` }}
    >
      {/* Crossfade: key remount + CSS fade (motion-reduce collapses to a cut) */}
      <div key={current!.slide_id + String(index)} className="min-h-screen motion-safe:animate-[fadeIn_600ms_ease]">
        <SlideBody
          slide={current!}
          menu={menu}
          boardOrders={boardOrders}
          trending={trending}
          tenantName={tenantName}
          lang={lang}
        />
      </div>

      {!online ? (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">
          <span className="h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse" aria-hidden="true" />
          {t(lang, 'reconnecting')}
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function SlideBody({
  slide,
  menu,
  boardOrders,
  trending,
  tenantName,
  lang,
}: {
  slide: SignageSlideShape
  menu: KioskMenu | null
  boardOrders: BoardOrder[]
  trending: TrendingItem[]
  tenantName: string
  lang: DeviceLang
}) {
  const cfg = slide.config ?? {}
  switch (slide.slide_type) {
    case 'menu_board':
      return <MenuBoardSlide menu={menu} cfg={cfg} tenantName={tenantName} lang={lang} />
    case 'promo_image':
      return <PromoImageSlide cfg={cfg} lang={lang} />
    case 'announcement':
      return <AnnouncementSlide cfg={cfg} lang={lang} />
    case 'order_status_board':
      return <OrderStatusBoardSlide orders={boardOrders} lang={lang} />
    case 'trending_items':
      return <TrendingItemsSlide items={trending} cfg={cfg} lang={lang} />
    case 'offers':
      return <OffersSlide cfg={cfg} lang={lang} />
    default:
      return null
  }
}

// ── menu_board ────────────────────────────────────────────────────────────────

function MenuBoardSlide({
  menu,
  cfg,
  tenantName,
  lang,
}: {
  menu: KioskMenu | null
  cfg: Record<string, unknown>
  tenantName: string
  lang: DeviceLang
}) {
  const categoryIds = (cfg.category_ids as number[] | undefined) ?? []
  const vendorId = cfg.vendor_id as string | undefined

  const items = (menu?.items ?? []).filter((i) => {
    if (vendorId && i.vendor_id !== vendorId) return false
    if (categoryIds.length > 0 && !categoryIds.includes(i.category_id)) return false
    return true
  })
  const categories = (menu?.categories ?? []).filter(
    (c) => categoryIds.length === 0 || categoryIds.includes(c.category_id),
  )
  const usedAllergens = [...new Set(items.flatMap((i) => i.allergens))]

  const grouped: { title: string; items: KioskMenuItem[] }[] =
    categories.length > 0
      ? categories
          .map((c) => ({ title: c.name, items: items.filter((i) => i.category_id === c.category_id) }))
          .filter((g) => g.items.length > 0)
      : [{ title: '', items }]

  return (
    <div className="flex min-h-screen flex-col p-10">
      <h1 className="mb-6 text-5xl font-black text-primary">{tenantName}</h1>
      <div className="grid flex-1 grid-cols-2 gap-x-12 gap-y-8 xl:grid-cols-3">
        {grouped.map((group) => (
          <section key={group.title || 'all'}>
            {group.title ? (
              <h2 className="mb-3 border-b-4 border-primary pb-1 text-3xl font-black">{group.title}</h2>
            ) : null}
            <ul className="space-y-2">
              {group.items.slice(0, 12).map((item) => (
                <li key={item.item_id} className="flex items-baseline justify-between gap-3 text-2xl">
                  <span className="font-semibold">
                    {item.name}
                    {item.allergens.length > 0 ? (
                      <sup className="ml-1 text-base font-normal text-amber-600">
                        {item.allergens.map((a) => ALLERGEN_LABELS[a]?.icon ?? '⚠️').join('')}
                      </sup>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-black text-primary">৳{Number(item.price).toLocaleString('en-BD')}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {/* EU FIC allergen legend — abbreviations must resolve to names (RFC-010 §2.7) */}
      {usedAllergens.length > 0 ? (
        <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-lg text-muted-foreground">
          <span className="font-bold">{t(lang, 'allergens')}:</span>
          {usedAllergens.map((code) => (
            <span key={code}>
              {ALLERGEN_LABELS[code]?.icon} {ALLERGEN_LABELS[code]?.[lang] ?? code}
            </span>
          ))}
        </footer>
      ) : null}
    </div>
  )
}

// ── promo_image ───────────────────────────────────────────────────────────────

function PromoImageSlide({ cfg, lang }: { cfg: Record<string, unknown>; lang: DeviceLang }) {
  const headline = (lang === 'bn' ? cfg.headline_bn : cfg.headline_en) ?? cfg.headline_en
  return (
    <div className="relative min-h-screen">
      {cfg.image_url ? (
        <img src={String(cfg.image_url)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-primary" />
      )}
      {headline || cfg.caption ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-12 text-white">
          {headline ? <h1 className="text-6xl font-black">{String(headline)}</h1> : null}
          {cfg.caption ? <p className="mt-2 text-3xl opacity-90">{String(cfg.caption)}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

// ── announcement ──────────────────────────────────────────────────────────────

function AnnouncementSlide({ cfg, lang }: { cfg: Record<string, unknown>; lang: DeviceLang }) {
  const title = (lang === 'bn' ? cfg.title_bn : cfg.title_en) ?? cfg.title_en
  const body = (lang === 'bn' ? cfg.body_bn : cfg.body_en) ?? cfg.body_en
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-primary p-16 text-center text-primary-foreground">
      <span className="text-7xl" aria-hidden="true">📢</span>
      {title ? <h1 className="max-w-5xl text-7xl font-black leading-tight">{String(title)}</h1> : null}
      {body ? <p className="max-w-4xl text-4xl leading-relaxed opacity-90">{String(body)}</p> : null}
    </div>
  )
}

// ── order_status_board (current orders) ───────────────────────────────────────

function OrderStatusBoardSlide({ orders, lang }: { orders: BoardOrder[]; lang: DeviceLang }) {
  // SGN-7: numbers + status only, never identities.
  const preparing = orders.filter((o) => o.status !== 'ready')
  const ready = orders.filter((o) => o.status === 'ready')
  return (
    <div className="grid min-h-screen grid-cols-2">
      <section className="flex flex-col border-r-4 border-border p-10">
        <h2 className="mb-8 text-5xl font-black text-amber-600">⏳ {t(lang, 'preparing')}</h2>
        <NumberGrid numbers={preparing.map((o) => o.pickup_number)} />
      </section>
      <section className="flex flex-col bg-emerald-500/10 p-10">
        <h2 className="mb-8 text-5xl font-black text-emerald-600">✓ {t(lang, 'ready')}</h2>
        <NumberGrid numbers={ready.map((o) => o.pickup_number)} emphasized />
      </section>
    </div>
  )
}

function NumberGrid({ numbers, emphasized = false }: { numbers: number[]; emphasized?: boolean }) {
  return (
    <div className="flex flex-wrap content-start gap-4" aria-live="polite">
      {numbers.map((n) => (
        <span
          key={n}
          className={`flex min-h-24 min-w-32 items-center justify-center rounded-3xl px-6 text-6xl font-black ${
            emphasized ? 'bg-emerald-600 text-white' : 'border-4 border-amber-500/50 bg-card'
          }`}
        >
          {n}
        </span>
      ))}
    </div>
  )
}

// ── trending_items ────────────────────────────────────────────────────────────

function TrendingItemsSlide({
  items,
  cfg,
  lang,
}: {
  items: TrendingItem[]
  cfg: Record<string, unknown>
  lang: DeviceLang
}) {
  const title = (lang === 'bn' ? cfg.title_bn : cfg.title_en) ?? cfg.title_en ?? t(lang, 'trendingTitle')
  return (
    <div className="flex min-h-screen flex-col p-12">
      <h1 className="mb-10 text-6xl font-black">🔥 {String(title)}</h1>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-6 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.item_id} className="relative flex items-center gap-5 rounded-3xl border-2 bg-card p-6 shadow-sm">
            <span className="absolute -left-3 -top-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl font-black text-primary-foreground">
              {item.rank}
            </span>
            {item.image_url ? (
              <img src={item.image_url} alt="" className="h-24 w-24 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted text-4xl" aria-hidden="true">🍽</div>
            )}
            <div className="min-w-0">
              <p className="truncate text-3xl font-bold">{item.name}</p>
              <p className="text-2xl font-black text-primary">৳{Number(item.price).toLocaleString('en-BD')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── offers ────────────────────────────────────────────────────────────────────

function OffersSlide({ cfg, lang }: { cfg: Record<string, unknown>; lang: DeviceLang }) {
  const offers = (cfg.offers as Array<Record<string, unknown>> | undefined) ?? []
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/15 to-transparent p-12">
      <h1 className="mb-10 text-6xl font-black">🎉 {t(lang, 'offersTitle')}</h1>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-8 xl:grid-cols-3">
        {offers.map((offer, i) => {
          const title = (lang === 'bn' ? offer.title_bn : offer.title_en) ?? offer.title_en
          return (
            <div key={i} className="flex flex-col overflow-hidden rounded-3xl border-2 bg-card shadow-md">
              {offer.image_url ? (
                <img src={String(offer.image_url)} alt="" className="h-44 w-full object-cover" />
              ) : null}
              <div className="flex flex-1 flex-col gap-2 p-6">
                <p className="text-3xl font-black">{String(title ?? '')}</p>
                {offer.subtitle ? <p className="text-xl text-muted-foreground">{String(offer.subtitle)}</p> : null}
                {offer.price_text ? (
                  <p className="mt-auto text-4xl font-black text-primary">{String(offer.price_text)}</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

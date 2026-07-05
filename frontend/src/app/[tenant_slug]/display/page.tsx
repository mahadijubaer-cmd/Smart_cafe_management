'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import apiClient from '@/lib/api'
import { useStore } from '@/store/useStore'
import type { Category, MenuItem } from '@/types'

const ROTATE_INTERVAL_MS = 8000

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** RFC-007 (Phase 22): read-only, auto-rotating signage board. Frontend-only —
 * reuses the tenant's normal (authenticated) menu endpoints, no dedicated backend. */
export default function SignagePage() {
  const params = useParams<{ tenant_slug: string }>()
  const router = useRouter()
  const slug = params.tenant_slug
  const token = useStore((state) => state.token)
  const brandColor = useStore((state) => state.brandColor)

  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) router.replace(`/${slug}/login`)
  }, [router, slug, token])

  useEffect(() => {
    if (!token) return
    Promise.all([apiClient.get<Category[]>('/menu/categories'), apiClient.get<MenuItem[]>('/menu/items')])
      .then(([catRes, itemRes]) => {
        setCategories(catRes.data.filter((c) => c.is_active !== false))
        setItems(itemRes.data.filter((i) => i.is_available))
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (categories.length === 0) return
    const timer = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % categories.length)
    }, ROTATE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [categories.length])

  const activeCategory = categories[activeIndex]
  const visibleItems = useMemo(
    () => (activeCategory ? items.filter((i) => i.category_id === activeCategory.category_id) : []),
    [items, activeCategory]
  )

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p>Loading menu board…</p>
      </main>
    )
  }

  if (categories.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-center text-white">
        <p>No menu categories to display yet.</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 px-10 py-8 text-white select-none">
      <header className="flex items-center justify-between">
        <h1 className="text-4xl font-black tracking-tight">{activeCategory?.name}</h1>
        <div className="flex gap-2">
          {categories.map((cat, index) => (
            <span
              key={cat.category_id}
              className="h-2 w-8 rounded-full transition-colors"
              style={{ backgroundColor: index === activeIndex ? brandColor || '#1A4D2E' : 'rgba(255,255,255,0.2)' }}
            />
          ))}
        </div>
      </header>

      <div className="mt-10 grid flex-1 grid-cols-2 content-start gap-6 xl:grid-cols-3">
        {visibleItems.map((item) => (
          <div key={item.item_id} className="flex items-center justify-between rounded-3xl bg-white/5 px-6 py-5">
            <div>
              <p className="text-2xl font-bold">{item.name}</p>
              {item.description ? <p className="mt-1 max-w-md text-sm text-white/50">{item.description}</p> : null}
            </div>
            <p className="text-3xl font-black" style={{ color: brandColor || '#1A4D2E' }}>
              {formatCurrency(Number(item.price))}
            </p>
          </div>
        ))}
      </div>
    </main>
  )
}

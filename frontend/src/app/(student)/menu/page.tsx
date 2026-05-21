'use client'

import { useEffect, useMemo, useState } from 'react'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import CategoryTabs from '@/components/menu/CategoryTabs'
import MenuItemCard from '@/components/menu/MenuItemCard'
import CartSidebar from '@/components/menu/CartSidebar'
import { useStore } from '@/store/useStore'
import type { Category, MenuItem } from '@/types'

type MenuItemApi = MenuItem

function MenuSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
          <div className="h-48 animate-pulse bg-slate-200" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 flex items-center justify-between">
              <div className="h-10 w-24 animate-pulse rounded-full bg-slate-200" />
              <div className="h-10 w-28 animate-pulse rounded-xl bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function StudentMenuPage() {
  const addToCart = useStore((state) => state.addToCart)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItemApi[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<number>(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadMenu = async () => {
      try {
        const [categoriesResponse, itemsResponse] = await Promise.all([
          apiClient.get('/menu/categories'),
          apiClient.get('/menu/items'),
        ])

        if (cancelled) {
          return
        }

        const loadedCategories = categoriesResponse.data as Category[]
        const loadedItems = itemsResponse.data as MenuItemApi[]
        const categoryNameMap = new Map(loadedCategories.map((category) => [category.category_id, category.name]))

        setCategories(loadedCategories)
        setItems(
          loadedItems.map((item) => ({
            ...item,
            category_name: categoryNameMap.get(item.category_id),
          }))
        )

        if (loadedCategories.length > 0) {
          setActiveCategoryId((current) => current || loadedCategories[0].category_id)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadMenu()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesCategory = activeCategoryId === 0 || item.category_id === activeCategoryId
      const matchesSearch = !query || item.name.toLowerCase().includes(query)
      return matchesCategory && matchesSearch
    })
  }, [activeCategoryId, items, search])

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <main className="min-h-screen bg-[linear-gradient(180deg,#F5F0E8_0%,#ffffff_32%,#eef5ee_100%)] px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#1A4D2E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#1A4D2E]">
                Menu
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
                Browse meals and add them to your cart
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Filter by category, search by name, and build your order quickly.
              </p>
            </div>

            <div className="w-full max-w-md">
              <label className="mb-2 block text-sm font-medium text-slate-700">Search items</label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by dish name"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {loading ? (
            <MenuSkeleton />
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1 space-y-6">
                <CategoryTabs
                  categories={categories}
                  activeId={activeCategoryId}
                  onChange={(categoryId) => setActiveCategoryId(categoryId)}
                />

                {filteredItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-black/10 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
                    No items match your current filters.
                  </div>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredItems.map((item) => (
                      <MenuItemCard
                        key={item.item_id}
                        item={item}
                        onAddToCart={(menuItem) => addToCart({ ...menuItem, quantity: 1 })}
                      />
                    ))}
                  </div>
                )}
              </div>

              <CartSidebar />
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  )
}
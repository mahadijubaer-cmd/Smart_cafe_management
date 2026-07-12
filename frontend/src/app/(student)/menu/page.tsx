'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ShoppingCart, X } from 'lucide-react'

import apiClient from '@/lib/api'
import ProtectedRoute from '@/components/ProtectedRoute'
import CategoryTabs from '@/components/menu/CategoryTabs'
import MenuItemCard from '@/components/menu/MenuItemCard'
import CartSidebar from '@/components/menu/CartSidebar'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import { useTenantInfo } from '@/hooks/useTenantInfo'
import type { Category, MenuItem } from '@/types'

type SortOption = 'default' | 'price-asc' | 'price-desc' | 'prep-asc'

const FOOD_EMOJIS = ['🍛', '🥟', '☕', '🌅', '🏠']

function formatHeroDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function MenuSkeleton() {
  return (
    <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:px-8">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <Skeleton className="h-40 rounded-none" />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-10 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ search, onClear }: { search: string; onClear: () => void }) {
  return (
    <Empty className="mx-4 border border-dashed border-border bg-card shadow-sm lg:mx-8">
      <EmptyMedia variant="icon" className="text-5xl">🍽</EmptyMedia>
      <EmptyTitle>No items found for &apos;{search}&apos;</EmptyTitle>
      <EmptyDescription>Try a different keyword, switch category, or clear the search.</EmptyDescription>
      <Button type="button" variant="outline" className="mt-2 rounded-full" onClick={onClear}>
        Clear search
      </Button>
    </Empty>
  )
}

function SortSelect({ value, onChange }: { value: SortOption; onChange: (value: SortOption) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as SortOption)}>
      <SelectTrigger className="rounded-2xl" aria-label="Sort menu">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Default</SelectItem>
        <SelectItem value="price-asc">Price: Low to High</SelectItem>
        <SelectItem value="price-desc">Price: High to Low</SelectItem>
        <SelectItem value="prep-asc">Prep Time</SelectItem>
      </SelectContent>
    </Select>
  )
}

export default function StudentMenuPage() {
  const addToCart = useStore((state) => state.addToCart)
  const cartCount = useStore((state) => state.cartCount)
  const openCart = useStore((state) => state.openCart)
  const tenantSlug = useStore((state) => state.tenantSlug)
  const { tenant } = useTenantInfo(tenantSlug ?? '')
  const [categories, setCategories] = useState<Category[]>([])
  const [allItems, setAllItems] = useState<MenuItem[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<number>(0)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('default')
  const [loading, setLoading] = useState(true)
  const [foodIndex, setFoodIndex] = useState(0)
  const [cartBounce, setCartBounce] = useState(false)
  const [previousCartCount, setPreviousCartCount] = useState(cartCount())

  const todayLabel = useMemo(() => formatHeroDate(new Date()), [])
  const itemCount = useMemo(() => cartCount(), [cartCount])
  const cyclingEmojis = useMemo(
    () => [...FOOD_EMOJIS.slice(foodIndex), ...FOOD_EMOJIS.slice(0, foodIndex)],
    [foodIndex]
  )

  useEffect(() => {
    const timerId = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => window.clearTimeout(timerId)
  }, [searchInput])

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
        const loadedItems = itemsResponse.data as MenuItem[]
        const categoryNameMap = new Map(loadedCategories.map((category) => [category.category_id, category.name]))
        const categoryCountMap = new Map<number, number>()

        for (const item of loadedItems) {
          categoryCountMap.set(item.category_id, (categoryCountMap.get(item.category_id) ?? 0) + 1)
        }

        setCategories(
          loadedCategories.map((category) => ({
            ...category,
            item_count: categoryCountMap.get(category.category_id) ?? 0,
          }))
        )
        setAllItems(
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

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setFoodIndex((current) => (current + 1) % FOOD_EMOJIS.length)
    }, 1800)

    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    if (itemCount > previousCartCount) {
      setCartBounce(true)
      const timeoutId = window.setTimeout(() => setCartBounce(false), 260)
      setPreviousCartCount(itemCount)
      return () => window.clearTimeout(timeoutId)
    }

    setPreviousCartCount(itemCount)
    return undefined
  }, [itemCount, previousCartCount])

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase()

    const matches = allItems.filter((item) => {
      const matchesCategory = activeCategoryId === 0 || item.category_id === activeCategoryId
      const matchesSearch = !query || item.name.toLowerCase().includes(query)
      const matchesAvailability = !availableOnly || item.is_available
      return matchesCategory && matchesSearch && matchesAvailability
    })

    const sorted = [...matches]

    switch (sortBy) {
      case 'price-asc':
        sorted.sort((left, right) => Number(left.price) - Number(right.price))
        break
      case 'price-desc':
        sorted.sort((left, right) => Number(right.price) - Number(left.price))
        break
      case 'prep-asc':
        sorted.sort((left, right) => Number(left.prep_time_mins) - Number(right.prep_time_mins))
        break
      default:
        sorted.sort((left, right) => left.name.localeCompare(right.name))
        break
    }

    return sorted
  }, [activeCategoryId, allItems, availableOnly, searchQuery, sortBy])

  const handleClearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
  }

  return (
    <ProtectedRoute allowedRoles={["student", "customer"]}>
      <main className="min-h-screen bg-background">
        <section className="relative h-32 overflow-hidden bg-gradient-to-r from-[#1A4D2E] to-[#2D6A4F] px-4 py-6 text-white lg:h-40 lg:px-8">
          <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <h1 className="text-3xl font-black tracking-tight lg:text-5xl">🍽 {tenant?.name ?? 'Cafe'} Menu</h1>
              <p className="text-sm text-white/90 lg:text-base">Fresh food, fast service — {todayLabel}</p>
            </div>

            <div className="hidden items-center gap-3 text-4xl lg:flex">
              {cyclingEmojis.map((emoji, index) => (
                <span
                  key={`${emoji}-${index}`}
                  className="hero-food-strip inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 shadow-sm backdrop-blur-sm"
                  style={{ animationDelay: `${index * 180}ms` }}
                >
                  {emoji}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="sticky top-16 z-30 border-b border-white/40 bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-7xl space-y-4 px-4 py-3 lg:px-8">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <label className="relative block">
                <span className="sr-only">Search items</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search items... (e.g. Biryani, Cha)"
                  className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {searchInput ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </label>

              <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Available Only</p>
                  <p className="text-sm text-muted-foreground">Show items ready to order</p>
                </div>
                <Switch checked={availableOnly} onCheckedChange={setAvailableOnly} />
              </div>

              <SortSelect value={sortBy} onChange={setSortBy} />
            </div>

            <CategoryTabs
              categories={categories}
              activeId={activeCategoryId}
              onChange={(categoryId) => setActiveCategoryId(categoryId)}
            />
          </div>
        </div>

        {loading ? (
          <div className="relative">
            <MenuSkeleton />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-6">
            <EmptyState search={searchInput.trim() || 'your query'} onClear={handleClearSearch} />
          </div>
        ) : (
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:px-8">
            {filteredItems.map((item, index) => (
              <div
                key={item.item_id}
                className="menu-item-enter"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <MenuItemCard item={item} onAddToCart={addToCart} />
              </div>
            ))}
          </div>
        )}

        <div className="px-4 pb-28 lg:px-8 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            <CartSidebar />
          </div>
        </div>

        <Button
          type="button"
          size="icon"
          onClick={openCart}
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full shadow-2xl lg:hidden"
          aria-label="Open cart"
        >
          <ShoppingCart className="h-6 w-6" />
          {itemCount > 0 ? (
            <span
              className={cn(
                'absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground',
                cartBounce ? 'cart-fab-bounce' : '',
              )}
            >
              {itemCount}
            </span>
          ) : null}
        </Button>

        <style>{`
          @keyframes food-strip-float {
            0%,
            100% {
              transform: translateY(0) scale(1);
              opacity: 0.85;
            }
            50% {
              transform: translateY(-4px) scale(1.03);
              opacity: 1;
            }
          }

          @keyframes cart-fab-bounce {
            0% {
              transform: scale(0.7);
            }
            60% {
              transform: scale(1.2);
            }
            100% {
              transform: scale(1);
            }
          }

          @keyframes menu-item-enter {
            from {
              opacity: 0;
              transform: translateY(16px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @media (prefers-reduced-motion: no-preference) {
            .hero-food-strip {
              animation: food-strip-float 2.6s ease-in-out infinite;
            }

            .cart-fab-bounce {
              animation: cart-fab-bounce 260ms ease-out;
            }

            .menu-item-enter {
              animation: menu-item-enter 200ms ease-out both;
            }
          }
        `}</style>
      </main>
    </ProtectedRoute>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'

import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/category'
import type { Category } from '@/types'

type CategoryTabsProps = {
  categories: Category[]
  activeId: number
  onChange: (id: number) => void
}

function getCategoryIcon(category: Category) {
  return CATEGORY_ICONS[category.name] || '🍽️'
}

function getCategoryColorClass(categoryName: string) {
  return CATEGORY_COLORS[categoryName] || 'bg-gray-50 text-gray-700 border-gray-200'
}

export default function CategoryTabs({ categories, activeId, onChange }: CategoryTabsProps) {
  const activeCategory = useMemo(
    () => categories.find((category) => category.category_id === activeId) ?? categories[0] ?? null,
    [activeId, categories]
  )
  const [displayCategoryId, setDisplayCategoryId] = useState(activeCategory?.category_id ?? 0)
  const [leavingCategoryId, setLeavingCategoryId] = useState<number | null>(null)
  const [entering, setEntering] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!activeCategory) {
      setDisplayCategoryId(0)
      setLeavingCategoryId(null)
      return
    }

    if (activeCategory.category_id === displayCategoryId) {
      return
    }

    const previousCategoryId = displayCategoryId
    setLeavingCategoryId(previousCategoryId)
    setDisplayCategoryId(activeCategory.category_id)
    setLeaving(false)
    setEntering(false)

    const enterFrame = window.requestAnimationFrame(() => setEntering(true))
    const leaveFrame = window.requestAnimationFrame(() => setLeaving(true))

    const cleanupTimer = window.setTimeout(() => {
      setLeavingCategoryId(null)
    }, 180)

    return () => {
      window.cancelAnimationFrame(enterFrame)
      window.cancelAnimationFrame(leaveFrame)
      window.clearTimeout(cleanupTimer)
    }
  }, [activeCategory, displayCategoryId])

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2">
        <div className="flex min-w-max gap-3">
          {categories.map((category) => {
            const isActive = category.category_id === activeId
            const icon = getCategoryIcon(category)
            const colorClass = getCategoryColorClass(category.name)

            return (
              <button
                key={category.category_id}
                type="button"
                onClick={() => onChange(category.category_id)}
                className={[
                  'snap-start rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow'
                    : `border ${colorClass} hover:brightness-95`,
                ].join(' ')}
                aria-pressed={isActive}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-base leading-none">
                    {icon}
                  </span>
                  <span>{category.name}</span>
                  <span
                    className={[
                      'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                      isActive ? 'bg-white/20 text-white' : 'bg-white/70 text-gray-700',
                    ].join(' ')}
                  >
                    {category.item_count ?? 0}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {activeCategory ? (
        <div className="relative h-11 overflow-hidden rounded-2xl border bg-background px-4 py-2">
          {leavingCategoryId ? (
            <div
              className={[
                'absolute inset-0 flex items-center gap-2 px-4 text-sm font-semibold text-muted-foreground transition-all duration-150',
                leaving ? 'translate-x-[-20px] opacity-0' : 'translate-x-0 opacity-100',
              ].join(' ')}
            >
              <span aria-hidden="true">
                {getCategoryIcon(categories.find((category) => category.category_id === leavingCategoryId) ?? activeCategory)}
              </span>
              <span>{categories.find((category) => category.category_id === leavingCategoryId)?.name ?? activeCategory.name}</span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
                {categories.find((category) => category.category_id === leavingCategoryId)?.item_count ?? activeCategory.item_count ?? 0}
              </span>
            </div>
          ) : null}

          <div
            className={[
              'absolute inset-0 flex items-center gap-2 px-4 text-sm font-semibold text-primary transition-all duration-200',
              entering ? 'translate-x-0 opacity-100' : 'translate-x-[20px] opacity-0',
            ].join(' ')}
          >
            <span aria-hidden="true">{getCategoryIcon(activeCategory)}</span>
            <span>{activeCategory.name}</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
              {activeCategory.item_count ?? 0}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
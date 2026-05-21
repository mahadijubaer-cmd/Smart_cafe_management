'use client'

import type { Category } from '@/types'

type CategoryTabsProps = {
  categories: Category[]
  activeId: number
  onChange: (categoryId: number) => void
}

export default function CategoryTabs({ categories, activeId, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {categories.map((category) => {
        const isActive = category.category_id === activeId

        return (
          <button
            key={category.category_id}
            type="button"
            onClick={() => onChange(category.category_id)}
            className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-[#1A4D2E] text-white shadow-md shadow-[#1A4D2E]/25'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {category.name}
          </button>
        )
      })}
    </div>
  )
}
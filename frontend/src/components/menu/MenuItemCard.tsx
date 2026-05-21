'use client'

import { useEffect, useState } from 'react'

import type { MenuItem } from '@/types'
import { Button } from '@/components/ui/button'

type MenuItemCardProps = {
  item: MenuItem
  onAddToCart: (item: MenuItem) => void
}

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80'

export default function MenuItemCard({ item, onAddToCart }: MenuItemCardProps) {
  const [added, setAdded] = useState(false)

  useEffect(() => {
    if (!added) {
      return
    }

    const timeoutId = window.setTimeout(() => setAdded(false), 1200)
    return () => window.clearTimeout(timeoutId)
  }, [added])

  const handleAdd = () => {
    onAddToCart(item)
    setAdded(true)
  }

  return (
    <article className="group overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative h-48 overflow-hidden">
        <img
          src={item.image_url || PLACEHOLDER_IMAGE}
          alt={item.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white">
            {item.category_name || `Category ${item.category_id}`}
          </span>
          {item.is_homemade ? (
            <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-amber-950">
              Homemade
            </span>
          ) : null}
        </div>

        {added ? (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-[1px]">
            <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
              Added to cart
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex h-full flex-col gap-4 p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{item.name}</h3>
          {item.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p> : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div>
            <p className="text-xl font-extrabold text-primary">BDT {Number(item.price).toFixed(2)}</p>
            <p className="text-xs text-slate-500">Prep time: {item.prep_time_mins} mins</p>
          </div>

          <Button type="button" className="bg-[#1A4D2E] text-white hover:bg-[#163f25]" onClick={handleAdd}>
            Add to Cart
          </Button>
        </div>
      </div>
    </article>
  )
}
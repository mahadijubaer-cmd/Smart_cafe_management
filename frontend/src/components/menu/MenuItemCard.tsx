'use client'

import { useEffect, useMemo, useState } from 'react'

import { CATEGORY_ICONS } from '@/lib/category'
import { useStore } from '@/store/useStore'
import type { MenuItem } from '@/types'

type MenuItemCardProps = {
  item: MenuItem
  onAddToCart: (item: MenuItem) => void
}

function getEmojiFallback(item: MenuItem) {
  if (!item.category_name) {
    return '🍽️'
  }

  return CATEGORY_ICONS[item.category_name] || '🍽️'
}

export default function MenuItemCard({ item, onAddToCart: _onAddToCart }: MenuItemCardProps) {
  const cartItemCount = useStore((state) => state.cartItemCount)
  const addToCart = useStore((state) => state.addToCart)
  const updateQuantity = useStore((state) => state.updateQuantity)
  const quantityInCart = cartItemCount(item.item_id)
  const [pulseBorder, setPulseBorder] = useState(false)

  useEffect(() => {
    if (!pulseBorder) {
      return
    }

    const timeoutId = window.setTimeout(() => setPulseBorder(false), 220)
    return () => window.clearTimeout(timeoutId)
  }, [pulseBorder])

  const unavailable = !item.is_available
  const imageSrc = item.image_url || ''
  const fallbackEmoji = useMemo(() => getEmojiFallback(item), [item])
  const hasQuantity = quantityInCart > 0

  const handleAdd = () => {
    if (unavailable) {
      return
    }

    if (!hasQuantity) {
      setPulseBorder(true)
    }

    addToCart(item)
  }

  const handleIncrement = () => {
    if (unavailable) {
      return
    }

    addToCart(item)
  }

  const handleDecrement = () => {
    updateQuantity(item.item_id, quantityInCart - 1)
  }

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        pulseBorder ? 'menu-card-pulse' : '',
      ].join(' ')}
    >
      <div className="relative h-40 overflow-hidden rounded-t-xl bg-[#F3EBDD]">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={item.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#F6E7C9_0%,#E8D4A6_45%,#D8B97A_100%)] text-5xl">
            <span aria-hidden="true">{fallbackEmoji}</span>
          </div>
        )}

        {item.is_homemade ? (
          <div className="absolute left-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-amber-950 shadow-sm">
            🏠 Homemade
          </div>
        ) : null}

        {unavailable ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="rounded-full bg-gray-800/90 px-4 py-2 text-sm font-semibold text-white shadow-lg">
              Currently Unavailable
            </span>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-bold leading-6 text-slate-900 sm:text-lg">{item.name}</h3>
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Available
            </div>
          </div>

          {item.description ? (
            <p className="line-clamp-2 text-sm leading-6 text-gray-500">{item.description}</p>
          ) : null}

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span aria-hidden="true">⏱</span>
            <span>{item.prep_time_mins} min</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-extrabold text-[#1A4D2E]">৳ {Number(item.price).toFixed(2)}</p>

          {hasQuantity ? (
            <div
              className={[
                'flex h-10 items-center overflow-hidden rounded-full border border-gray-200 bg-white transition-all duration-200 ease-out',
                quantityInCart > 9 ? 'w-32' : 'w-28',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={handleDecrement}
                className="flex h-full w-10 items-center justify-center text-lg font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                aria-label={`Decrease ${item.name}`}
                disabled={unavailable}
              >
                −
              </button>
              <span className="flex-1 text-center text-sm font-semibold text-slate-900">{quantityInCart}</span>
              <button
                type="button"
                onClick={handleIncrement}
                className="flex h-full w-10 items-center justify-center text-lg font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                aria-label={`Increase ${item.name}`}
                disabled={unavailable}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              disabled={unavailable}
              className="inline-flex h-10 w-20 items-center justify-center rounded-full bg-[#1A4D2E] px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:bg-[#163f25] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes menu-card-pulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(26, 77, 46, 0.22);
          }
          50% {
            transform: scale(1.02);
            box-shadow: 0 0 0 8px rgba(26, 77, 46, 0.08);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(26, 77, 46, 0);
          }
        }

        .menu-card-pulse {
          animation: menu-card-pulse 220ms ease-out;
        }
      `}</style>
    </article>
  )
}
'use client'

import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CATEGORY_ICONS } from '@/lib/category'
import { cn } from '@/lib/utils'
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
    <Card
      className={cn(
        'group relative overflow-hidden py-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        pulseBorder && 'menu-card-pulse'
      )}
    >
      <div className="relative h-40 overflow-hidden bg-[#F3EBDD]">
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
          <Badge className="absolute left-3 top-3 bg-amber-400 text-amber-950 hover:bg-amber-400">
            🏠 Homemade
          </Badge>
        ) : null}

        {unavailable ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Badge variant="secondary" className="bg-gray-800/90 text-white">
              Currently Unavailable
            </Badge>
          </div>
        ) : null}
      </div>

      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-bold leading-6 sm:text-lg">{item.name}</h3>
            <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
              <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Available
            </Badge>
          </div>

          {item.description ? (
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          ) : null}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true">⏱</span>
            <span>{item.prep_time_mins} min</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-extrabold text-primary">৳ {Number(item.price).toFixed(2)}</p>

          {hasQuantity ? (
            <div
              className={cn(
                'flex h-10 items-center overflow-hidden rounded-full border bg-background transition-all duration-200 ease-out',
                quantityInCart > 9 ? 'w-32' : 'w-28'
              )}
            >
              <button
                type="button"
                onClick={handleDecrement}
                className="flex h-full w-10 items-center justify-center text-lg font-bold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground"
                aria-label={`Decrease ${item.name}`}
                disabled={unavailable}
              >
                −
              </button>
              <span className="flex-1 text-center text-sm font-semibold">{quantityInCart}</span>
              <button
                type="button"
                onClick={handleIncrement}
                className="flex h-full w-10 items-center justify-center text-lg font-bold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground"
                aria-label={`Increase ${item.name}`}
                disabled={unavailable}
              >
                +
              </button>
            </div>
          ) : (
            <Button type="button" onClick={handleAdd} disabled={unavailable} className="h-10 w-20 rounded-full">
              + Add
            </Button>
          )}
        </div>
      </CardContent>

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
    </Card>
  )
}

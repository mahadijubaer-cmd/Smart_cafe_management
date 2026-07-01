'use client'

import Link from 'next/link'
import { UtensilsCrossed } from 'lucide-react'

export interface VendorSummary {
  tenant_id: string
  name: string
  slug: string
  logo_url?: string | null
}

interface VendorTileProps {
  vendor: VendorSummary
  orderCount: number
  onViewMenu?: () => void
}

export default function VendorTile({ vendor, orderCount, onViewMenu }: VendorTileProps) {
  const isActive = orderCount > 0

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* Logo / icon */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {vendor.logo_url ? (
            <img src={vendor.logo_url} alt={vendor.name} className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <UtensilsCrossed className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-900">{vendor.name}</p>
          <span
            className={[
              'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
              isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
            ].join(' ')}
          >
            {isActive ? 'Active' : 'Quiet'}
          </span>
        </div>
      </div>

      {/* Order count */}
      <div className="rounded-xl bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">Active orders</p>
        <p className="text-2xl font-black text-slate-900">{orderCount}</p>
      </div>

      <button
        type="button"
        onClick={onViewMenu}
        className="w-full rounded-xl border border-primary/30 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
      >
        View menu
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import apiClient from '@/lib/api'
import VendorMenuTabs from '@/components/food-court/VendorMenuTabs'
import type { VendorSummary } from '@/components/food-court/VendorTile'

interface VendorMenuSection {
  vendor_id: string
  vendor_name: string
  items: Array<{
    item_id: string
    name: string
    description?: string | null
    price: string
  }>
}

export default function FoodCourtMenuPage() {
  const [vendors, setVendors] = useState<VendorSummary[]>([])
  const [menu, setMenu] = useState<VendorMenuSection[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [vendorsRes, menuRes] = await Promise.allSettled([
          apiClient.get('/food-court/vendors'),
          apiClient.get('/food-court/menu'),
        ])
        if (vendorsRes.status === 'fulfilled') setVendors(vendorsRes.value.data)
        if (menuRes.status === 'fulfilled') setMenu(menuRes.value.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const displaySections =
    selectedVendorId === null
      ? menu
      : menu.filter((s) => s.vendor_id === selectedVendorId)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black text-slate-900">Unified Menu</h1>

      <VendorMenuTabs
        vendors={vendors}
        selected={selectedVendorId}
        onChange={setSelectedVendorId}
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : displaySections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-400">No items available.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {displaySections.map((section) => (
            <div key={section.vendor_id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                <span className="rounded-full bg-primary/10 px-3 py-0.5 text-primary">
                  {section.vendor_name}
                </span>
                <span className="text-slate-400">({section.items.length} items)</span>
              </h2>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <div
                    key={item.item_id}
                    className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        {item.description && (
                          <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-bold text-primary">
                        ৳{Number(item.price).toFixed(0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

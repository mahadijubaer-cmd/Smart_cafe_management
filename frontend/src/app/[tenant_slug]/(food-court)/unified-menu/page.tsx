'use client'

import { useEffect, useState } from 'react'
import apiClient from '@/lib/api'
import VendorMenuTabs from '@/components/food-court/VendorMenuTabs'
import type { VendorSummary } from '@/components/food-court/VendorTile'
import PageHeader from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { UtensilsCrossed } from 'lucide-react'

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
    <div className="motion-safe:animate-fade-up space-y-5">
      <PageHeader title="Unified Menu" />

      <VendorMenuTabs
        vendors={vendors}
        selected={selectedVendorId}
        onChange={setSelectedVendorId}
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : displaySections.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UtensilsCrossed />
            </EmptyMedia>
            <EmptyTitle>No items available</EmptyTitle>
            <EmptyDescription>This vendor hasn&apos;t added any menu items yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-8">
          {displaySections.map((section) => (
            <div key={section.vendor_id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">
                  {section.vendor_name}
                </Badge>
                <span className="text-muted-foreground">({section.items.length} items)</span>
              </h2>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <Card key={item.item_id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-card-foreground">{item.name}</p>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-bold text-primary">
                          ৳{Number(item.price).toFixed(0)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

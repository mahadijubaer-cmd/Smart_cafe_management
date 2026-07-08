'use client'

import { UtensilsCrossed } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {vendor.logo_url ? (
            <img src={vendor.logo_url} alt={vendor.name} className="size-10 rounded-xl object-cover" />
          ) : (
            <UtensilsCrossed className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-card-foreground">{vendor.name}</p>
          <Badge variant={isActive ? 'default' : 'secondary'} className="mt-1">
            {isActive ? 'Active' : 'Quiet'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-xl bg-muted px-4 py-3">
          <p className="text-xs text-muted-foreground">Active orders</p>
          <p className="mt-1 text-2xl font-black text-foreground">{orderCount}</p>
        </div>
      </CardContent>

      <CardFooter>
        <Button type="button" variant="outline" className="w-full" onClick={onViewMenu}>
          View menu
        </Button>
      </CardFooter>
    </Card>
  )
}

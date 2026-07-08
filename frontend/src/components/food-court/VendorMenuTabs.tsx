'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { VendorSummary } from './VendorTile'

interface VendorMenuTabsProps {
  vendors: VendorSummary[]
  selected: string | null
  onChange: (id: string | null) => void
}

const ALL_VALUE = '__all__'

export default function VendorMenuTabs({ vendors, selected, onChange }: VendorMenuTabsProps) {
  return (
    <Tabs
      value={selected ?? ALL_VALUE}
      onValueChange={(value) => onChange(value === ALL_VALUE ? null : value)}
    >
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
        <TabsTrigger
          value={ALL_VALUE}
          className="rounded-full border border-input data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          All Vendors
        </TabsTrigger>
        {vendors.map((v) => (
          <TabsTrigger
            key={v.tenant_id}
            value={v.tenant_id}
            className="rounded-full border border-input data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            {v.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

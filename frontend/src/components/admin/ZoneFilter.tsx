'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ZoneFilterProps {
  zones: string[]
  selected: string | null
  onChange: (zone: string | null) => void
}

const ALL_VALUE = '__all__'

export default function ZoneFilter({ zones, selected, onChange }: ZoneFilterProps) {
  return (
    <Tabs
      value={selected ?? ALL_VALUE}
      onValueChange={(value) => onChange(value === ALL_VALUE ? null : value)}
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto bg-muted p-1">
        <TabsTrigger value={ALL_VALUE}>All</TabsTrigger>
        {zones.map((zone) => (
          <TabsTrigger key={zone} value={zone}>
            {zone}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

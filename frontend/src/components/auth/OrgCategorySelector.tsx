'use client'

import { Check } from 'lucide-react'
import { getSegment, type Segment } from '@/lib/segments'
import { TENANT_TYPE_META } from '@/lib/tenantTypes'
import type { TenantType } from '@/types'

/**
 * Tenant types an owner may self-register (RFC-006, BR-ORG-1).
 * franchise_outlet / food_court_vendor are intentionally excluded — they must
 * be created under an existing parent organization.
 */
export const SELF_SERVE_TYPES: TenantType[] = [
  'independent_restaurant',
  'corporate',
  'academic',
  'franchise_brand',
  'food_court',
]

interface OrgCategorySelectorProps {
  selected: TenantType | null
  onSelect: (type: TenantType) => void
  /** When set, only self-serve types belonging to this segment are shown (see getSegment). */
  segmentFilter?: Segment | null
}

export default function OrgCategorySelector({ selected, onSelect, segmentFilter }: OrgCategorySelectorProps) {
  const visibleTypes = segmentFilter
    ? SELF_SERVE_TYPES.filter((type) => getSegment(type) === segmentFilter)
    : SELF_SERVE_TYPES

  return (
    <div className="grid gap-3">
      {visibleTypes.map((type, i) => {
        const meta = TENANT_TYPE_META[type]
        const isSelected = type === selected
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className={`motion-safe:animate-fade-up flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isSelected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm'
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{meta.label}</p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{meta.description}</p>
            </div>
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
                isSelected ? 'scale-110 border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 text-transparent'
              }`}
            >
              <Check className="size-4" />
            </span>
          </button>
        )
      })}
    </div>
  )
}

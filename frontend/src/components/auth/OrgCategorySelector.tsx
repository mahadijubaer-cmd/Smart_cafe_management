'use client'

import { Check } from 'lucide-react'
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
}

export default function OrgCategorySelector({ selected, onSelect }: OrgCategorySelectorProps) {
  return (
    <div className="grid gap-3">
      {SELF_SERVE_TYPES.map((type) => {
        const meta = TENANT_TYPE_META[type]
        const isSelected = type === selected
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isSelected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-black/10 bg-white hover:border-primary/40 hover:shadow-sm'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">{meta.label}</p>
              <p className="mt-1 text-xs leading-snug text-slate-500">{meta.description}</p>
            </div>
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300 text-transparent'
              }`}
            >
              <Check className="h-4 w-4" />
            </span>
          </button>
        )
      })}
    </div>
  )
}

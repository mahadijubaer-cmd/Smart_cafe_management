import type { TenantType } from '@/types'

/**
 * Generic, human-facing metadata for each tenant type, derived from the four
 * SCMS tenant models (Master Documentation v3.1, Sections 3–6).
 *
 * `label`       — generic category name (not the organisation's own name).
 * `description` — one line on how that category functions.
 */
export interface TenantTypeMeta {
  label: string
  description: string
}

export const TENANT_TYPE_META: Record<TenantType, TenantTypeMeta> = {
  academic: {
    label: 'Academic Cafeteria',
    description: 'Campus dining for a university or college — student meal benefits & homemade marketplace.',
  },
  corporate: {
    label: 'Corporate Cafeteria',
    description: 'In-house cafeteria for a company or institution, run as a self-contained tenant.',
  },
  independent_restaurant: {
    label: 'Independent Restaurant',
    description: 'A standalone restaurant managing its own menu, tables, and staff.',
  },
  franchise_brand: {
    label: 'Franchise Brand',
    description: 'A parent brand with a master menu shared across multiple outlets.',
  },
  franchise_outlet: {
    label: 'Franchise Outlet',
    description: 'A single branch of a franchise brand, inheriting the brand menu.',
  },
  food_court: {
    label: 'Food Court',
    description: 'A shared food hall hosting multiple vendors with common tables and delivery staff.',
  },
  food_court_vendor: {
    label: 'Food Court Vendor',
    description: 'An individual stall inside a food court with its own menu and orders.',
  },
}

export function getTenantTypeMeta(type: TenantType): TenantTypeMeta {
  return (
    TENANT_TYPE_META[type] ?? {
      label: type,
      description: '',
    }
  )
}

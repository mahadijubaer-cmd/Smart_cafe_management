import type { TenantType } from '@/types'

// Mirrors backend/app/core/segments.py SEGMENT_MAP — segment is always derived
// from tenant_type, never stored. See specs/system/segments.md (RFC-007).
export type Segment = 'cafeteria' | 'restaurant'

const SEGMENT_MAP: Record<TenantType, Segment> = {
  corporate: 'cafeteria',
  academic: 'cafeteria',
  independent_restaurant: 'restaurant',
  franchise_brand: 'restaurant',
  franchise_outlet: 'restaurant',
  food_court: 'restaurant',
  food_court_vendor: 'restaurant',
}

export function getSegment(tenantType: TenantType): Segment {
  return SEGMENT_MAP[tenantType]
}

export function isRestaurantSegment(tenantType: TenantType): boolean {
  return getSegment(tenantType) === 'restaurant'
}

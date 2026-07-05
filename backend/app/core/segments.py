"""Segment derivation (RFC-007 / Phase 22).

Segment is a UX classification of a tenant — "cafeteria" or "restaurant" — used to
decide which routes/capabilities apply. It is ALWAYS derived from `tenant_type`.
There is no `segment` column anywhere; never add one. See specs/system/segments.md.
"""
from __future__ import annotations

from app.models.tenant import TenantType

CAFETERIA = "cafeteria"
RESTAURANT = "restaurant"

SEGMENT_MAP: dict[TenantType, str] = {
    TenantType.corporate: CAFETERIA,
    TenantType.academic: CAFETERIA,
    TenantType.independent_restaurant: RESTAURANT,
    TenantType.franchise_brand: RESTAURANT,
    TenantType.franchise_outlet: RESTAURANT,
    TenantType.food_court: RESTAURANT,
    TenantType.food_court_vendor: RESTAURANT,
}


def get_segment(tenant_type: TenantType | str) -> str:
    """Return "cafeteria" or "restaurant" for the given tenant_type."""
    if isinstance(tenant_type, str):
        tenant_type = TenantType(tenant_type)
    return SEGMENT_MAP[tenant_type]


def is_restaurant_segment(tenant_type: TenantType | str) -> bool:
    return get_segment(tenant_type) == RESTAURANT

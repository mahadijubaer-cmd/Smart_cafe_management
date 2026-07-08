"""Subscription tier resource limits (RFC-009, PA-2/PA-3).

TIER_LIMITS is the single source of truth for per-tier resource caps. `None` means unlimited.
"""
from __future__ import annotations

from fastapi import HTTPException

from app.models.tenant import SubscriptionTier

TIER_LIMITS: dict[SubscriptionTier, dict[str, int | None]] = {
    SubscriptionTier.free: {"max_outlets": 1, "max_menu_items": 20, "max_staff": 2},
    SubscriptionTier.starter: {"max_outlets": 3, "max_menu_items": 100, "max_staff": 10},
    SubscriptionTier.professional: {"max_outlets": 10, "max_menu_items": 500, "max_staff": 50},
    SubscriptionTier.enterprise: {"max_outlets": None, "max_menu_items": None, "max_staff": None},
}

_RESOURCE_LABELS = {
    "max_outlets": "outlets",
    "max_menu_items": "menu items",
    "max_staff": "staff members",
}


def check_tier_limit(tier: SubscriptionTier, resource: str, current_count: int) -> None:
    """Raise 402 if creating one more `resource` would exceed the tier's cap."""
    limit = TIER_LIMITS[tier][resource]
    if limit is not None and current_count >= limit:
        label = _RESOURCE_LABELS[resource]
        raise HTTPException(
            status_code=402,
            detail=f"Tier limit reached: {tier.value} allows up to {limit} {label} (currently {current_count}).",
        )

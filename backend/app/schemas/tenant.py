from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.tenant import SubscriptionTier, TenantType


class TenantCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    tenant_type: TenantType
    subscription_tier: SubscriptionTier = SubscriptionTier.starter
    parent_tenant_id: UUID | None = None
    logo_url: str | None = None
    brand_color: str = Field(default="#1A4D2E", max_length=7)
    allowed_email_domain: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    homemade_enabled: bool = False
    inventory_strict_mode: bool = False


class OutletCreate(BaseModel):
    """Used by POST /tenants/{id}/outlets — tenant_type and parent_tenant_id are set server-side."""

    name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    subscription_tier: SubscriptionTier = SubscriptionTier.starter
    logo_url: str | None = None
    brand_color: str = Field(default="#1A4D2E", max_length=7)
    allowed_email_domain: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    homemade_enabled: bool = False
    inventory_strict_mode: bool = False


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    logo_url: str | None = None
    brand_color: str | None = Field(default=None, max_length=7)
    subscription_tier: SubscriptionTier | None = None
    allowed_email_domain: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    homemade_enabled: bool | None = None
    inventory_strict_mode: bool | None = None


class TenantResponse(BaseModel):
    tenant_id: UUID
    parent_tenant_id: UUID | None
    tenant_type: TenantType
    name: str
    slug: str
    logo_url: str | None
    brand_color: str
    subscription_tier: SubscriptionTier
    is_active: bool
    allowed_email_domain: str | None
    address: str | None
    city: str | None
    phone: str | None
    contact_email: str | None
    homemade_enabled: bool
    inventory_strict_mode: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TenantListResponse(BaseModel):
    items: list[TenantResponse]
    total: int

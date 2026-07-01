from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.tenant import SubscriptionTier, TenantType


# Tenant types an owner may create via public self-serve signup (RFC-006, BR-ORG-1).
# franchise_outlet / food_court_vendor are excluded — they require a parent_tenant_id.
SELF_SERVE_TENANT_TYPES: set[TenantType] = {
    TenantType.independent_restaurant,
    TenantType.corporate,
    TenantType.academic,
    TenantType.franchise_brand,
    TenantType.food_court,
}


class TenantPublicResponse(BaseModel):
    """Safe public fields — no billing, contact, or internal config exposed."""
    name: str
    slug: str
    tenant_type: TenantType
    logo_url: str | None
    city: str | None
    brand_color: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class TenantPublicDetailResponse(TenantPublicResponse):
    """Extends public response with domain restriction — needed by register page."""
    allowed_email_domain: str | None


class TenantPublicListResponse(BaseModel):
    items: list[TenantPublicResponse]
    total: int


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


class OrgRegisterDetails(BaseModel):
    """Organization fields for public self-serve signup (RFC-006)."""
    name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    tenant_type: TenantType
    city: str | None = Field(default=None, max_length=100)
    contact_email: EmailStr | None = None
    brand_color: str = Field(default="#1A4D2E", max_length=7)
    allowed_email_domain: str | None = Field(default=None, max_length=150)


class OrgRegisterAdmin(BaseModel):
    """First-admin account for a self-registered organization (RFC-006)."""
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class TenantRegister(BaseModel):
    """Public organization onboarding — creates a tenant + its first admin (RFC-006)."""
    organization: OrgRegisterDetails
    admin: OrgRegisterAdmin


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


class TenantSettingsUpdate(BaseModel):
    """Self-service update for admin roles. slug / tenant_type / subscription_tier / is_active immutable."""
    name: str | None = Field(default=None, min_length=2, max_length=150)
    logo_url: str | None = None
    brand_color: str | None = Field(default=None, max_length=7)
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    allowed_email_domain: str | None = None
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

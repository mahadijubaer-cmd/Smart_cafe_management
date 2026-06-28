from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TenantType(str, enum.Enum):
    franchise_brand = "franchise_brand"
    franchise_outlet = "franchise_outlet"
    corporate = "corporate"
    academic = "academic"
    independent_restaurant = "independent_restaurant"
    food_court = "food_court"
    food_court_vendor = "food_court_vendor"


class SubscriptionTier(str, enum.Enum):
    free = "free"
    starter = "starter"
    professional = "professional"
    enterprise = "enterprise"


class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("uuid_generate_v4()"),
    )
    parent_tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        # Self-referential FK defined at table level via string
        nullable=True,
    )
    tenant_type: Mapped[TenantType] = mapped_column(
        SQLEnum(TenantType, name="tenanttype"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brand_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#1A4D2E", server_default=text("'#1A4D2E'"))
    subscription_tier: Mapped[SubscriptionTier] = mapped_column(
        SQLEnum(SubscriptionTier, name="subscriptiontier"),
        nullable=False,
        default=SubscriptionTier.starter,
        server_default=SubscriptionTier.starter.value,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    allowed_email_domain: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    homemade_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    inventory_strict_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    # Self-referential: brand → outlets
    outlets: Mapped[list[Tenant]] = relationship(
        "Tenant",
        primaryjoin="Tenant.parent_tenant_id == Tenant.tenant_id",
        foreign_keys="Tenant.parent_tenant_id",
        back_populates="brand",
    )
    brand: Mapped[Tenant | None] = relationship(
        "Tenant",
        primaryjoin="Tenant.tenant_id == Tenant.parent_tenant_id",
        foreign_keys="Tenant.parent_tenant_id",
        back_populates="outlets",
        remote_side="Tenant.tenant_id",
    )

    # Cross-model relationships (back-populated from other models)
    users: Mapped[list] = relationship("User", foreign_keys="User.tenant_id", back_populates="tenant")

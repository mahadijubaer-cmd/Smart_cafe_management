from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, ForeignKey, Integer, Numeric, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, Enum):
    # Legacy value — kept so existing DB rows with role='student' remain valid
    student = "student"
    # Current values
    customer = "customer"
    staff = "staff"
    server = "server"          # food-court shared floor runner
    cleaner = "cleaner"
    outlet_admin = "outlet_admin"
    tenant_admin = "tenant_admin"
    food_court_admin = "food_court_admin"
    super_admin = "super_admin"
    platform_admin = "platform_admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # Email is unique per tenant, not globally
        UniqueConstraint("email", "tenant_id", name="uq_user_email_tenant"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("uuid_generate_v4()"),
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # For franchise outlet staff: the specific outlet they belong to
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="userrole"),
        nullable=False,
        default=UserRole.customer,
        server_default=UserRole.customer.value,
    )
    student_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    employee_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    wallet_balance: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )
    reward_points: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    email_verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    tenant: Mapped["Tenant"] = relationship(  # noqa: F821
        "Tenant", foreign_keys=[tenant_id], back_populates="users"
    )
    orders = relationship("Order", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    menu_items = relationship("MenuItem", back_populates="listed_by_user")
    reward_logs = relationship("RewardLog", back_populates="user")
    cleaner_logs = relationship("CleanerLog", back_populates="cleaner")
    reservations = relationship("Reservation", back_populates="user")

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Re-export everything so other modules can import from one place
from app.models.tenant import Tenant, TenantType, SubscriptionTier  # noqa: F401
from app.models.user import User, UserRole  # noqa: F401
from app.models.menu import Category, MenuItem  # noqa: F401
from app.models.order import Order, OrderItem, OrderStatus, OrderSource, PaymentStatus, PaymentMethod  # noqa: F401
from app.models.table import TablesMap, TableMap, TableStatus  # noqa: F401
from app.models.inventory import (  # noqa: F401
    InventoryCategory, InventoryItem, MenuItemRecipe,
    InventoryMovement, PurchaseOrder, PurchaseOrderItem,
    InventoryUnit, StockMovementType, PurchaseOrderStatus,
)
from app.models.device import (  # noqa: F401
    Device, DeviceType, KioskConfig, SignagePlaylist, SignageSlide, SignageSlideType,
)
from app.models.payment_gateway import (  # noqa: F401
    TenantPaymentGateway, GatewayType, GatewayTransaction, GatewayPurpose, GatewayTransactionStatus,
)
from app.models.wallet_transaction import WalletTransaction  # noqa: F401


# ─────────────────────────────────────────────
# ENUMS (support models)
# ─────────────────────────────────────────────

class CleanerStatus(str, enum.Enum):
    assigned = "assigned"
    in_progress = "in_progress"
    done = "done"


class ReservationStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


# ─────────────────────────────────────────────
# RESERVATION
# ─────────────────────────────────────────────

class Reservation(Base):
    __tablename__ = "reservations"

    reservation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    table_id: Mapped[int] = mapped_column(ForeignKey("tables_map.table_id"), nullable=False)
    reserved_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_mins: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    status: Mapped[ReservationStatus] = mapped_column(
        SQLEnum(ReservationStatus, name="reservationstatus"),
        default=ReservationStatus.active,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )

    user = relationship("User", back_populates="reservations")
    table = relationship("TablesMap", back_populates="reservations")


# ─────────────────────────────────────────────
# PAYMENT
# ─────────────────────────────────────────────

class Payment(Base):
    __tablename__ = "payments"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    amount = mapped_column(__import__("sqlalchemy").Numeric(10, 2), nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(
        SQLEnum(PaymentMethod, name="paymentmethod"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="success", nullable=False)
    transaction_ref: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )

    order = relationship("Order", back_populates="payments")
    user = relationship("User", back_populates="payments")


# ─────────────────────────────────────────────
# CLEANER LOG
# ─────────────────────────────────────────────

class CleanerLog(Base):
    __tablename__ = "cleaner_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cleaner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    table_id: Mapped[int] = mapped_column(ForeignKey("tables_map.table_id"), nullable=False)
    triggered_by_order: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
    cleaned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[CleanerStatus] = mapped_column(
        SQLEnum(CleanerStatus, name="cleanerstatus"),
        default=CleanerStatus.assigned,
        nullable=False,
    )

    cleaner = relationship("User", back_populates="cleaner_logs")
    table = relationship("TablesMap", back_populates="cleaner_logs")
    triggered_order = relationship("Order", back_populates="cleaner_logs")


# ─────────────────────────────────────────────
# REWARD LOG
# ─────────────────────────────────────────────

class RewardLog(Base):
    __tablename__ = "reward_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=True
    )
    points_earned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    points_redeemed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )

    user = relationship("User", back_populates="reward_logs")
    order = relationship("Order", back_populates="reward_logs")


# ─────────────────────────────────────────────
# NOTIFICATION
# ─────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    notif_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


# ─────────────────────────────────────────────
# OTP AUDIT LOG
# ─────────────────────────────────────────────

class OtpLog(Base):
    __tablename__ = "otp_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(50), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)


# ─────────────────────────────────────────────
# QR CODE REGISTRY
# ─────────────────────────────────────────────

class QrCode(Base):
    __tablename__ = "qr_codes"

    qr_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.order_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    emailed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order = relationship("Order")


# ─────────────────────────────────────────────
# RECEIPT LOG
# ─────────────────────────────────────────────

class ReceiptLog(Base):
    __tablename__ = "receipt_logs"

    receipt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.order_id", ondelete="CASCADE"),
        nullable=False,
    )
    receipt_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    emailed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order = relationship("Order")


# ─────────────────────────────────────────────
# STAFF INVITATIONS
# ─────────────────────────────────────────────

class StaffInvitation(Base):
    __tablename__ = "staff_invitations"

    invite_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )


# ─────────────────────────────────────────────
# PLATFORM AUDIT LOG (RFC-009)
# ─────────────────────────────────────────────

class PlatformAuditLog(Base):
    """Audit trail of platform_admin actions. Outlives the actor/target it describes —
    actor_id/target_tenant_id are SET NULL (not CASCADE) and actor_email/target_tenant_name/
    target_tenant_slug are denormalized so a log entry stays readable after either is gone.
    """
    __tablename__ = "platform_audit_logs"

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_email: Mapped[str] = mapped_column(String(150), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    target_tenant_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    target_tenant_slug: Mapped[str | None] = mapped_column(String(80), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True
    )

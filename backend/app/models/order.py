from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, Computed, DateTime, Enum as SQLEnum,
    ForeignKey, Integer, Numeric, String, Text, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OrderStatus(str, enum.Enum):
    pending_confirmation = "pending_confirmation"  # RFC-007: guest orders awaiting staff confirmation
    pending = "pending"
    confirmed = "confirmed"
    preparing = "preparing"
    ready = "ready"
    delivered = "delivered"
    cancelled = "cancelled"


class OrderSource(str, enum.Enum):
    """RFC-007 (Phase 22): where an order originated."""
    customer_app = "customer_app"
    staff_pos = "staff_pos"
    guest_qr = "guest_qr"
    kiosk = "kiosk"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    refunded = "refunded"


class PaymentMethod(str, enum.Enum):
    wallet = "wallet"
    simulation = "simulation"
    bkash = "bkash"
    nagad = "nagad"
    card = "card"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL AND guest_token IS NULL) OR "
            "(user_id IS NULL AND guest_token IS NOT NULL AND order_source IN ('guest_qr', 'kiosk'))",
            name="chk_order_identity",
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    table_id: Mapped[int | None] = mapped_column(ForeignKey("tables_map.table_id"), nullable=True)
    order_source: Mapped[OrderSource] = mapped_column(
        SQLEnum(OrderSource, name="ordersource"),
        nullable=False,
        default=OrderSource.customer_app,
        server_default=OrderSource.customer_app.value,
    )
    # Not unique: a food-court guest cart spanning multiple vendors is split into
    # sibling Order rows (one per vendor tenant_id) that share one guest_token —
    # see order_service.create_food_court_guest_order (RFC-007 §Phase D).
    guest_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    guest_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    guest_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # OR-12 (RFC-010): per-tenant daily counter shown on kiosk confirmation +
    # signage order board. NULL for non-device orders.
    pickup_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_slot: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        SQLEnum(OrderStatus, name="orderstatus"),
        nullable=False,
        default=OrderStatus.pending,
        server_default=OrderStatus.pending.value,
    )
    total_amount: Mapped[float] = mapped_column(
        Numeric(10, 2), nullable=False, default=0, server_default=text("0.00")
    )
    discount_amount: Mapped[float] = mapped_column(
        Numeric(10, 2), nullable=False, default=0, server_default=text("0.00")
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SQLEnum(PaymentStatus, name="paymentstatus"),
        nullable=False,
        default=PaymentStatus.pending,
        server_default=PaymentStatus.pending.value,
    )
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        SQLEnum(PaymentMethod, name="paymentmethod"),
        nullable=True,
    )
    special_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    user = relationship("User", back_populates="orders")
    table = relationship("TablesMap", back_populates="orders")
    payments = relationship("Payment", back_populates="order")
    cleaner_logs = relationship("CleanerLog", back_populates="triggered_order")
    reward_logs = relationship("RewardLog", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
    )

    order_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_items.item_id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    subtotal: Mapped[float] = mapped_column(
        Numeric(10, 2),
        Computed("quantity * unit_price", persisted=True),
        nullable=False,
    )

    order = relationship("Order", back_populates="items")
    menu_item = relationship("MenuItem", back_populates="order_items")

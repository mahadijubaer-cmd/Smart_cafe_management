from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Enum as SQLEnum,
    ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class InventoryUnit(str, enum.Enum):
    kg = "kg"
    g = "g"
    litre = "litre"
    ml = "ml"
    piece = "piece"
    packet = "packet"
    dozen = "dozen"


class StockMovementType(str, enum.Enum):
    purchase = "purchase"
    transfer_in = "transfer_in"
    transfer_out = "transfer_out"
    consumption = "consumption"
    adjustment = "adjustment"
    waste = "waste"


class PurchaseOrderStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    received = "received"
    cancelled = "cancelled"


# ─────────────────────────────────────────────
# INVENTORY CATEGORY
# ─────────────────────────────────────────────

class InventoryCategory(Base):
    __tablename__ = "inventory_categories"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_inv_cat_tenant_name"),
    )

    inv_category_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    items = relationship("InventoryItem", back_populates="category")


# ─────────────────────────────────────────────
# INVENTORY ITEM
# ─────────────────────────────────────────────

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("tenant_id", "outlet_id", "sku", name="uq_inv_item_tenant_outlet_sku"),
    )

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    inv_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_categories.inv_category_id", ondelete="SET NULL"),
        nullable=True,
    )
    is_central: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit: Mapped[InventoryUnit] = mapped_column(
        SQLEnum(InventoryUnit, name="inventory_unit"),
        nullable=False,
        default=InventoryUnit.piece,
        server_default=text("'piece'"),
    )
    quantity_on_hand: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=0, server_default=text("0"))
    reorder_level: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=0, server_default=text("0"))
    reorder_quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=0, server_default=text("0"))
    unit_cost: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    supplier_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    supplier_contact: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    category = relationship("InventoryCategory", back_populates="items")
    recipes = relationship("MenuItemRecipe", back_populates="inventory_item")
    movements = relationship("InventoryMovement", back_populates="inventory_item")


# ─────────────────────────────────────────────
# MENU ITEM RECIPE
# ─────────────────────────────────────────────

class MenuItemRecipe(Base):
    __tablename__ = "menu_item_recipes"
    __table_args__ = (
        UniqueConstraint("menu_item_id", "inventory_item_id", name="uq_recipe_menu_inv"),
        CheckConstraint("quantity_per_serving > 0", name="ck_recipe_qty_positive"),
    )

    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.item_id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity_per_serving: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)

    menu_item = relationship("MenuItem", back_populates="recipes")
    inventory_item = relationship("InventoryItem", back_populates="recipes")


# ─────────────────────────────────────────────
# INVENTORY MOVEMENT (stock audit trail)
# ─────────────────────────────────────────────

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    movement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    movement_type: Mapped[StockMovementType] = mapped_column(
        SQLEnum(StockMovementType, name="stock_movement_type"),
        nullable=False,
    )
    quantity_delta: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    quantity_before: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    quantity_after: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.order_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    purchase_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.po_id", ondelete="SET NULL"),
        nullable=True,
    )
    performed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True
    )

    inventory_item = relationship("InventoryItem", back_populates="movements")
    purchase_order = relationship("PurchaseOrder", back_populates="movements")


# ─────────────────────────────────────────────
# PURCHASE ORDER
# ─────────────────────────────────────────────

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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
    is_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    from_tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id"),
        nullable=True,
    )
    po_number: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[PurchaseOrderStatus] = mapped_column(
        SQLEnum(PurchaseOrderStatus, name="purchase_order_status"),
        nullable=False,
        default=PurchaseOrderStatus.draft,
        server_default=text("'draft'"),
    )
    supplier_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    supplier_contact: Mapped[str | None] = mapped_column(String(100), nullable=True)
    expected_delivery: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    line_items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")
    movements = relationship("InventoryMovement", back_populates="purchase_order")


# ─────────────────────────────────────────────
# PURCHASE ORDER LINE ITEM
# ─────────────────────────────────────────────

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    __table_args__ = (
        CheckConstraint("quantity_ordered > 0", name="ck_po_item_qty_positive"),
    )

    po_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.po_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.item_id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity_ordered: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    quantity_received: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=0, server_default=text("0"))
    unit_cost: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    purchase_order = relationship("PurchaseOrder", back_populates="line_items")
    inventory_item = relationship("InventoryItem")

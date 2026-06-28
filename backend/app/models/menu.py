from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        # Name unique per tenant (not globally)
        UniqueConstraint("tenant_id", "name", name="uq_category_tenant_name"),
    )

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    icon_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    items = relationship("MenuItem", back_populates="category")


class MenuItem(Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_menu_items_price_nonnegative"),
    )

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # franchise: NULL = brand-level item; SET = outlet override
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id", ondelete="RESTRICT"), nullable=False)
    listed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    is_homemade: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    prep_time_mins: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default=text("10"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    category = relationship("Category", back_populates="items")
    listed_by_user = relationship("User", back_populates="menu_items")
    order_items = relationship("OrderItem", back_populates="menu_item")
    recipes = relationship("MenuItemRecipe", back_populates="menu_item")

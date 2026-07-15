"""Schemas for the public/guest ordering surface (RFC-007, Phase 22)."""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.menu import CategoryResponse, MenuItemResponse
from app.schemas.order import OrderItemCreate


class PublicMenuItem(MenuItemResponse):
    """Adds vendor attribution for food-court unified menus (null for single-vendor tenants)."""
    vendor_id: str | None = None
    vendor_name: str | None = None


class PublicFoodCourtVendor(BaseModel):
    vendor_id: str
    vendor_name: str


class PublicMenuResponse(BaseModel):
    categories: list[CategoryResponse]
    items: list[PublicMenuItem]
    vendors: list[PublicFoodCourtVendor] | None = None


class PublicTenantInfoResponse(BaseModel):
    name: str
    slug: str
    public_slug: str
    tenant_type: str
    logo_url: str | None
    brand_color: str
    address: str | None
    city: str | None
    phone: str | None
    guest_checkout_mode: str = "counter"

    model_config = ConfigDict(from_attributes=True)


class GuestOrderCreate(BaseModel):
    items: list[OrderItemCreate] = Field(..., min_length=1)
    table_number: str = Field(..., min_length=1, max_length=10)
    guest_name: str = Field(..., min_length=1, max_length=80)
    guest_phone: str = Field(..., min_length=7, max_length=20)
    special_notes: str | None = None
    is_kiosk: bool = False


class GuestOrderItemResponse(BaseModel):
    item_id: UUID
    quantity: int
    unit_price: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)


class GuestOrderResponse(BaseModel):
    order_id: UUID
    guest_token: UUID
    status: str
    order_source: str
    table_id: int | None = None
    total_amount: Decimal
    payment_status: str = "pending"
    payment_method: str | None = None
    guest_name: str | None = None
    guest_phone: str | None = None
    pickup_number: int | None = None  # OR-12 (RFC-010): set on kiosk orders
    special_notes: str | None = None
    created_at: datetime
    updated_at: datetime
    items: list[GuestOrderItemResponse] = []
    vendor_id: str | None = None
    vendor_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class GuestOrderGroupResponse(BaseModel):
    """A 'guest session': one or more sibling orders sharing one guest_token.

    Single-vendor restaurants always get a one-order group. Food-court carts
    spanning multiple vendors are split into one order per vendor, each an
    independent ticket for that vendor's own kitchen/staff, but tracked and
    paid together as one guest session.
    """
    guest_token: UUID
    total_amount: Decimal
    orders: list[GuestOrderResponse]

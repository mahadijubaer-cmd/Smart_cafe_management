from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.schemas.menu import MenuItemResponse


class OrderItemCreate(BaseModel):
    item_id: UUID
    quantity: int = Field(..., gt=0)


class OrderCreate(BaseModel):
    items: list[OrderItemCreate] = Field(..., min_items=1)
    table_id: int | None = None
    time_slot: datetime
    special_notes: str | None = None
    redeem_points: bool = False


class OrderItemResponse(BaseModel):
    order_item_id: UUID
    item_id: UUID
    # Read from the guarded `menu_item_safe` ORM property (never triggers a lazy
    # load) rather than the `menu_item` relationship name directly.
    menu_item: MenuItemResponse | None = Field(default=None, validation_alias="menu_item_safe")
    quantity: int
    unit_price: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class OrderResponse(BaseModel):
    order_id: UUID
    user_id: UUID | None = None
    table_id: int | None = None
    table_number: str | None = None
    time_slot: datetime
    status: str
    order_source: str = "customer_app"
    guest_name: str | None = None
    guest_phone: str | None = None
    total_amount: Decimal
    discount_amount: Decimal
    payment_status: str
    payment_method: str | None = None
    special_notes: str | None = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OrderUpdateStatus(BaseModel):
    status: str = Field(
        ...,
        pattern="^(pending_confirmation|pending|confirmed|preparing|ready|delivered|cancelled)$",
    )


class StaffPosOrderCreate(BaseModel):
    """RFC-007 (Phase 22): staff-entered order for a walk-in customer (restaurant
    segment POS flow). Attributed to the staff member's own account — pay at
    counter, no wallet debit. See modules/orders.md OR-11."""
    items: list[OrderItemCreate] = Field(..., min_length=1)
    table_id: int | None = None
    guest_name: str | None = Field(default=None, max_length=80)
    special_notes: str | None = None

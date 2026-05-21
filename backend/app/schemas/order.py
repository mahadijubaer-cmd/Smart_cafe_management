from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from datetime import datetime
from decimal import Decimal


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
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    
    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    order_id: UUID
    user_id: UUID
    table_id: int | None = None
    time_slot: datetime
    status: str
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
    status: str = Field(..., pattern="^(pending|confirmed|preparing|ready|delivered|cancelled)$")

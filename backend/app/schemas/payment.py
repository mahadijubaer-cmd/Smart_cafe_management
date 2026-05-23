from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentCreate(BaseModel):
    order_id: UUID
    method: str = Field(..., pattern="^(wallet|simulation)$")


class PaymentResponse(BaseModel):
    payment_id: UUID
    order_id: UUID
    amount: Decimal
    method: str
    status: str
    
    model_config = ConfigDict(from_attributes=True)


class TopupRequest(BaseModel):
    amount: Decimal = Field(..., gt=0, le=10000)


class PaymentOrderInfo(BaseModel):
    order_id: UUID
    total_amount: Decimal
    discount_amount: Decimal
    payment_status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentHistoryResponse(BaseModel):
    payment_id: UUID
    order_id: UUID
    amount: Decimal
    method: str
    status: str
    created_at: datetime
    order: PaymentOrderInfo

    model_config = ConfigDict(from_attributes=True)

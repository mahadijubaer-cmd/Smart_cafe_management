from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from decimal import Decimal


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

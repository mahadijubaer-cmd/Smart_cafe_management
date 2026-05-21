from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class CategoryResponse(BaseModel):
    category_id: int
    name: str
    icon_url: str | None = None
    display_order: int
    
    model_config = ConfigDict(from_attributes=True)


class MenuItemCreate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    image_url: str | None = None
    is_available: bool = True
    is_homemade: bool = False
    prep_time_mins: int = 10


class MenuItemUpdate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    image_url: str | None = None
    is_available: bool
    is_homemade: bool
    prep_time_mins: int = 10


class MenuItemResponse(BaseModel):
    item_id: UUID
    category_id: int
    name: str
    description: str | None = None
    price: Decimal
    image_url: str | None = None
    is_available: bool
    is_homemade: bool
    prep_time_mins: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

from pydantic import BaseModel, ConfigDict, Field

from app.models.table import TableStatus


class TableResponse(BaseModel):
    table_id: int
    table_number: str
    zone: str
    capacity: int
    status: str
    position_x: int
    position_y: int

    model_config = ConfigDict(from_attributes=True)


class TableCreate(BaseModel):
    table_number: str = Field(..., min_length=1, max_length=20)
    zone: str = "indoor"
    capacity: int = Field(..., ge=1)
    position_x: int | None = None
    position_y: int | None = None


class TableUpdate(BaseModel):
    table_number: str = Field(..., min_length=1, max_length=20)
    zone: str = Field(..., min_length=1, max_length=50)
    capacity: int = Field(..., ge=1, le=50)
    position_x: int = Field(..., ge=0, le=11)
    position_y: int = Field(..., ge=0, le=7)


class TableLayoutItem(BaseModel):
    table_id: int
    position_x: int = Field(..., ge=0, le=11)
    position_y: int = Field(..., ge=0, le=7)
    zone: str = Field(..., max_length=50)
    capacity: int = Field(..., ge=1)


class TableLayoutBatch(BaseModel):
    tables: list[TableLayoutItem]


class TableUpdateStatus(BaseModel):
    status: TableStatus = TableStatus.available

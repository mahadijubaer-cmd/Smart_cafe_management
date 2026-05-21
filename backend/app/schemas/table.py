from pydantic import BaseModel, ConfigDict


class TableResponse(BaseModel):
    table_id: int
    table_number: str
    zone: str
    capacity: int
    status: str
    position_x: int
    position_y: int
    
    model_config = ConfigDict(from_attributes=True)


class TableUpdateStatus(BaseModel):
    status: str = "available"

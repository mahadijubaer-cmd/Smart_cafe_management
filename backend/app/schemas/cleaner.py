from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CleanerInfo(BaseModel):
    user_id: UUID
    full_name: str
    email: str

    model_config = ConfigDict(from_attributes=True)


class TableInfo(BaseModel):
    table_id: int
    table_number: str
    zone: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class CleanerLogBase(BaseModel):
    log_id: UUID
    cleaner_id: UUID
    table_id: int
    status: str
    assigned_at: datetime
    cleaned_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CleanerAssignmentResponse(CleanerLogBase):
    table: TableInfo


class CleanerAssignmentAdminResponse(CleanerLogBase):
    cleaner: CleanerInfo
    table: TableInfo


class CleanerLogResponse(CleanerAssignmentResponse):
    pass


class CleanerLogUpdate(BaseModel):
    status: str

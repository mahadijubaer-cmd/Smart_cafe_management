from decimal import Decimal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import UserRole
from app.models.tenant import TenantType


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.customer


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    tenant_slug: str = Field(..., description="Slug of the tenant to register under")
    student_id: str | None = None
    phone: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    tenant_slug: str = Field(..., description="Slug of the tenant to authenticate against")


class UserResponse(UserBase):
    user_id: UUID
    tenant_id: UUID
    outlet_id: UUID | None
    wallet_balance: Decimal
    reward_points: int
    email_verified: bool
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    tenant_id: UUID
    tenant_type: TenantType
    tenant_slug: str
    outlet_id: UUID | None = None
    role: UserRole


class TokenData(BaseModel):
    user_id: UUID | None = None
    role: UserRole | None = None
    tenant_id: UUID | None = None
    tenant_type: TenantType | None = None
    tenant_slug: str | None = None
    outlet_id: UUID | None = None
    jti: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    tenant_slug: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str
    tenant_slug: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = None
    student_id: str | None = None

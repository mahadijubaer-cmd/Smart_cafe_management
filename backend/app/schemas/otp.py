from pydantic import BaseModel, EmailStr, Field


class OtpSendRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(
        ...,
        pattern="^(login|email_verification|password_reset)$",
        description="One of: login, email_verification, password_reset",
    )
    tenant_slug: str


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(..., pattern="^(login|email_verification|password_reset)$")
    otp_code: str = Field(..., min_length=6, max_length=6, pattern="^[0-9]{6}$")
    tenant_slug: str


class OtpSendResponse(BaseModel):
    message: str
    email: str
    purpose: str


class OtpVerifyResponse(BaseModel):
    verified: bool
    message: str

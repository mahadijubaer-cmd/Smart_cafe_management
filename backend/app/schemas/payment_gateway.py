from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.payment_gateway import GatewayType


class GatewayConfigUpsert(BaseModel):
    """Upsert body for PUT /payment-gateways/me/{gateway_type}.

    Omitting a secret field on an update keeps the previously stored value —
    never wipes a secret just because the admin only toggled is_enabled/is_sandbox
    (mirrors the genuine-partial-update convention already used by
    PATCH /tenants/me/settings).
    """
    is_enabled: bool = False
    is_sandbox: bool = True

    # SSLCommerz
    store_id: str | None = Field(default=None, max_length=100)
    store_password: str | None = Field(default=None, max_length=255)

    # bKash
    app_key: str | None = Field(default=None, max_length=150)
    app_secret: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=150)
    password: str | None = Field(default=None, max_length=255)


class GatewayConfigMasked(BaseModel):
    """Never includes a decrypted secret — see ADR-015."""
    gateway_type: GatewayType
    is_enabled: bool
    is_sandbox: bool
    public_identifier: str | None
    has_credentials: bool

    model_config = ConfigDict(from_attributes=True)


class AvailableGatewayResponse(BaseModel):
    wallet: bool = True
    simulation: bool = True
    sslcommerz: bool = False
    bkash: bool = False


class GatewayInitiateRequest(BaseModel):
    order_id: UUID
    gateway_type: GatewayType


class GatewayTopupInitiateRequest(BaseModel):
    gateway_type: GatewayType
    amount: float = Field(..., gt=0, le=10000)


class GatewayInitiateResponse(BaseModel):
    gateway_transaction_id: str
    redirect_url: str

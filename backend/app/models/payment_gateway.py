"""Per-tenant payment gateway integration (RFC-011, ADR-015).

`tenant_payment_gateways` holds each tenant's own SSLCommerz/bKash configuration —
only the genuinely secret sub-fields (store password, app secret) are encrypted
(see app.core.crypto); non-secret identifiers (store_id, username) live in
`public_identifier` so the admin's masked-list read never needs to decrypt anything.

`gateway_transactions` tracks the async initiate -> redirect -> callback/IPN ->
settle lifecycle a real gateway requires, unlike the synchronous `payments` row
created today for `wallet`/`simulation`. `order_id`/`user_id`/`guest_token` are all
nullable because no single one applies to every purpose (wallet top-up has no
order; guest checkout has no user).
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum as SQLEnum, ForeignKey, JSON, Numeric, String, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

JSONVariant = JSON().with_variant(JSONB(), "postgresql")


class GatewayType(str, enum.Enum):
    sslcommerz = "sslcommerz"
    bkash = "bkash"


class GatewayPurpose(str, enum.Enum):
    order_payment = "order_payment"
    wallet_topup = "wallet_topup"


class GatewayTransactionStatus(str, enum.Enum):
    initiated = "initiated"
    pending = "pending"
    success = "success"
    failed = "failed"
    cancelled = "cancelled"


class TenantPaymentGateway(Base):
    __tablename__ = "tenant_payment_gateways"
    __table_args__ = (
        UniqueConstraint("tenant_id", "gateway_type", name="uq_tenant_payment_gateways_tenant_type"),
    )

    gateway_config_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    gateway_type: Mapped[GatewayType] = mapped_column(
        SQLEnum(GatewayType, name="gatewaytype"), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_sandbox: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    # Non-secret identifiers only (SSLCommerz store_id; bKash username+app_key as a small JSON
    # string) — deliberately plaintext so the admin masked-list read never decrypts anything.
    public_identifier: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # Fernet-encrypted JSON blob holding only the genuinely secret sub-fields
    # (SSLCommerz store_password; bKash app_secret/password) — see app.core.crypto.
    credentials_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    tenant = relationship("Tenant")


class GatewayTransaction(Base):
    __tablename__ = "gateway_transactions"

    gateway_transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Resolved owner tenant (order_service.resolve_public_owner_tenant for a food-court guest
    # cart) — not blindly order.tenant_id, which may be the vendor child tenant instead.
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purpose: Mapped[GatewayPurpose] = mapped_column(
        SQLEnum(GatewayPurpose, name="gatewaypurpose"), nullable=False
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.order_id"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True
    )
    guest_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    gateway_type: Mapped[GatewayType] = mapped_column(
        SQLEnum(GatewayType, name="gatewaytype"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[GatewayTransactionStatus] = mapped_column(
        SQLEnum(GatewayTransactionStatus, name="gatewaytransactionstatus"),
        nullable=False,
        default=GatewayTransactionStatus.initiated,
        server_default=GatewayTransactionStatus.initiated.value,
    )
    gateway_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gateway_external_ref: Mapped[str | None] = mapped_column(String(150), nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(JSONVariant, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    tenant = relationship("Tenant")
    order = relationship("Order")
    user = relationship("User")

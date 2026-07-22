"""Wallet transaction ledger (RFC-011 PAY-9 / WAL-3).

Documented in specs/system/data-model.md since before RFC-011 as the wallet system's
"authoritative audit trail," but never actually created — PaymentService.topup() only
ever did a bare `user.wallet_balance += amount`. Built here for real, using the exact
shape already documented (signed `amount`: positive = credit/topup/refund, negative =
debit — kept as-is rather than redesigned, since nothing in code ever contradicted it).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    txn_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    # Positive = topup/refund (credit), negative = debit.
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # order_id for an order-payment debit, or gateway_transactions.gateway_transaction_id
    # for a gateway-driven top-up; null for a direct/simulation top-up.
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    tenant = relationship("Tenant")
    user = relationship("User")

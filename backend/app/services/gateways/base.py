"""Common interface every payment gateway client implements (RFC-011).

SSLCommerzGateway (Stage 2) is the first implementation; native bKash (Stage 4)
implements the same interface so the router/settlement code in payments.py
doesn't change per gateway.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal


class GatewayInitiationError(RuntimeError):
    """Raised when a gateway's session-initiation call itself fails (not a payment failure)."""


@dataclass
class GatewaySession:
    redirect_url: str
    raw_response: dict = field(default_factory=dict)


@dataclass
class GatewayValidationResult:
    success: bool
    verified_amount: Decimal | None = None
    external_ref: str | None = None
    raw_response: dict = field(default_factory=dict)


class GatewayClient:
    async def initiate(
        self,
        *,
        tran_id: str,
        amount: Decimal,
        success_url: str,
        fail_url: str,
        cancel_url: str,
        ipn_url: str,
        customer_name: str,
        customer_email: str,
        customer_phone: str,
    ) -> GatewaySession:
        raise NotImplementedError

    async def validate(self, *, val_id: str, tran_id: str) -> GatewayValidationResult:
        raise NotImplementedError

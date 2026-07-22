"""bKash Tokenized Checkout gateway client (RFC-011 Stage 4, v1.2.0-beta).

Grant Token -> Create Payment -> Execute Payment. Execute *is* the PAY-7/PAY-14
verification step for bKash — there is no separate "validate" call the way
SSLCommerz's validationserverAPI is separate from its Session API.

A fresh token is granted on every call rather than cached — bKash's tokens last
~1hr and refresh-token support adds real complexity for a gain that only matters
under heavy request volume; simplicity was chosen deliberately for this stage.

bKash registers exactly one `callbackURL` at Create Payment time and redirects the
browser back to it via a plain GET with `?paymentID=&status=` query params — see
`routers/payments.py`'s `bkash_callback` and specs/modules/payments.md PAY-14.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
import logging

import httpx

from app.services.gateways.base import (
    GatewayClient,
    GatewayInitiationError,
    GatewaySession,
    GatewayTestResult,
    GatewayValidationResult,
)

logger = logging.getLogger(__name__)

_SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
_LIVE_BASE = "https://tokenized.pay.bka.sh/v1.2.0-beta"
_TIMEOUT = 15.0


class BkashGateway(GatewayClient):
    def __init__(self, app_key: str, app_secret: str, username: str, password: str, is_sandbox: bool = True):
        self.app_key = app_key
        self.app_secret = app_secret
        self.username = username
        self.password = password
        self.base_url = _SANDBOX_BASE if is_sandbox else _LIVE_BASE

    async def _grant_token(self, client: httpx.AsyncClient) -> str | None:
        response = await client.post(
            f"{self.base_url}/tokenized/checkout/token/grant",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "username": self.username,
                "password": self.password,
            },
            json={"app_key": self.app_key, "app_secret": self.app_secret},
        )
        data = response.json()
        return data.get("id_token")

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
        """bKash has one `callbackURL`, not three — the router passes its single bKash-specific
        callback route via `success_url`; `fail_url`/`cancel_url`/`ipn_url` are unused here (bKash
        discriminates outcome via a `status` query param on that one URL, not separate URLs)."""
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            id_token = await self._grant_token(client)
            if not id_token:
                raise GatewayInitiationError("bKash token grant failed — check app credentials")

            response = await client.post(
                f"{self.base_url}/tokenized/checkout/create",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": id_token,
                    "X-APP-Key": self.app_key,
                },
                json={
                    "mode": "0011",
                    "payerReference": (customer_phone or "01700000000")[:20],
                    "callbackURL": success_url,
                    "amount": str(amount),
                    "currency": "BDT",
                    "intent": "sale",
                    "merchantInvoiceNumber": tran_id[:24],
                },
            )
            data = response.json()

        if data.get("statusCode") != "0000" or not data.get("bkashURL"):
            logger.warning("bKash create-payment failed: %s", data.get("statusMessage") or data)
            raise GatewayInitiationError(data.get("statusMessage") or "bKash payment creation failed")

        return GatewaySession(redirect_url=data["bkashURL"], raw_response=data)

    async def validate(self, *, val_id: str, tran_id: str) -> GatewayValidationResult:
        """`val_id` here is bKash's own `paymentID` (from the callback query string) — Execute
        Payment both finalizes and verifies in one call (PAY-14)."""
        payment_id = val_id
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            id_token = await self._grant_token(client)
            if not id_token:
                return GatewayValidationResult(success=False, raw_response={"error": "token grant failed"})

            response = await client.post(
                f"{self.base_url}/tokenized/checkout/execute/{payment_id}",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": id_token,
                    "X-APP-Key": self.app_key,
                },
                json={},
            )
            data = response.json()

        amount: Decimal | None = None
        try:
            if data.get("amount") is not None:
                amount = Decimal(str(data["amount"]))
        except InvalidOperation:
            amount = None

        success = data.get("statusCode") == "0000" and data.get("transactionStatus") == "Completed"
        return GatewayValidationResult(
            success=success,
            verified_amount=amount if success else None,
            external_ref=data.get("trxID"),
            raw_response=data,
        )

    async def test_connection(self) -> GatewayTestResult:
        """RFC-011 Stage 5 / PAY-15 — Grant Token only, no payment is created."""
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                id_token = await self._grant_token(client)
        except httpx.HTTPError as exc:
            return GatewayTestResult(success=False, message=f"Could not reach bKash: {exc}")

        if id_token:
            return GatewayTestResult(success=True, message="Credentials verified — token granted successfully.")
        return GatewayTestResult(success=False, message="bKash rejected the credentials (no token returned).")

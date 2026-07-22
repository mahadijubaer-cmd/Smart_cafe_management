"""SSLCommerz gateway client (RFC-011 Stage 2).

Session API (initiate) + validationserverAPI (validate) — the two real SSLCommerz
REST endpoints. Sandbox base URL requires no real merchant account (store_id
`testbox` / store_password `qwerty`, published by SSLCommerz for anyone to test
with) — see specs/operations/deployment.md.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
import logging
import uuid

import httpx

from app.services.gateways.base import (
    GatewayClient,
    GatewayInitiationError,
    GatewaySession,
    GatewayTestResult,
    GatewayValidationResult,
)

logger = logging.getLogger(__name__)

_SANDBOX_BASE = "https://sandbox.sslcommerz.com"
_LIVE_BASE = "https://securepay.sslcommerz.com"
_TIMEOUT = 15.0


class SSLCommerzGateway(GatewayClient):
    def __init__(self, store_id: str, store_password: str, is_sandbox: bool = True):
        self.store_id = store_id
        self.store_password = store_password
        self.base_url = _SANDBOX_BASE if is_sandbox else _LIVE_BASE

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
        payload = {
            "store_id": self.store_id,
            "store_passwd": self.store_password,
            "total_amount": str(amount),
            "currency": "BDT",
            "tran_id": tran_id,
            "success_url": success_url,
            "fail_url": fail_url,
            "cancel_url": cancel_url,
            "ipn_url": ipn_url,
            # No physical shipping for a dine-in/restaurant order.
            "shipping_method": "NO",
            "product_name": "SCMS Order",
            "product_category": "Food & Beverage",
            "product_profile": "general",
            "cus_name": customer_name or "Customer",
            "cus_email": customer_email or "customer@example.com",
            "cus_add1": "N/A",
            "cus_city": "Dhaka",
            "cus_postcode": "1000",
            "cus_country": "Bangladesh",
            "cus_phone": customer_phone or "01700000000",
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(f"{self.base_url}/gwprocess/v4/api.php", data=payload)
        data = response.json()

        if data.get("status") != "SUCCESS" or not data.get("GatewayPageURL"):
            logger.warning("SSLCommerz session init failed: %s", data.get("failedreason") or data)
            raise GatewayInitiationError(data.get("failedreason") or "SSLCommerz session initiation failed")

        return GatewaySession(redirect_url=data["GatewayPageURL"], raw_response=data)

    async def validate(self, *, val_id: str, tran_id: str) -> GatewayValidationResult:
        params = {
            "val_id": val_id,
            "store_id": self.store_id,
            "store_passwd": self.store_password,
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{self.base_url}/validator/api/validationserverAPI.php", params=params
            )
        data = response.json()

        status_ok = data.get("status") in ("VALID", "VALIDATED")
        tran_id_matches = data.get("tran_id") == tran_id
        amount: Decimal | None = None
        if status_ok and tran_id_matches:
            try:
                amount = Decimal(str(data.get("amount")))
            except (InvalidOperation, TypeError):
                amount = None

        return GatewayValidationResult(
            success=status_ok and tran_id_matches and amount is not None,
            verified_amount=amount,
            external_ref=data.get("bank_tran_id") or val_id,
            raw_response=data,
        )

    async def test_connection(self) -> GatewayTestResult:
        """RFC-011 Stage 5 / PAY-15 — a real Session API call with a nominal payload. Creates one
        genuine, immediately-abandoned SSLCommerz session (harmless — indistinguishable from any
        customer who opens checkout and never pays); there is no separate auth-only endpoint."""
        payload = {
            "store_id": self.store_id,
            "store_passwd": self.store_password,
            "total_amount": "10.00",
            "currency": "BDT",
            "tran_id": f"test-connection-{uuid.uuid4().hex}",
            "success_url": "https://example.com/",
            "fail_url": "https://example.com/",
            "cancel_url": "https://example.com/",
            "shipping_method": "NO",
            "product_name": "Connection test",
            "product_category": "Test",
            "product_profile": "general",
            "cus_name": "Test",
            "cus_email": "test@example.com",
            "cus_add1": "N/A",
            "cus_city": "Dhaka",
            "cus_postcode": "1000",
            "cus_country": "Bangladesh",
            "cus_phone": "01700000000",
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.post(f"{self.base_url}/gwprocess/v4/api.php", data=payload)
            data = response.json()
        except httpx.HTTPError as exc:
            return GatewayTestResult(success=False, message=f"Could not reach SSLCommerz: {exc}")

        if data.get("status") == "SUCCESS":
            return GatewayTestResult(success=True, message="Credentials verified — session created successfully.")
        return GatewayTestResult(success=False, message=data.get("failedreason") or "SSLCommerz rejected the credentials.")

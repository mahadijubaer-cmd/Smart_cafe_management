# Module: Payments

**Router:** `backend/app/routers/payments.py`  
**Schemas:** `backend/app/schemas/payment.py`  
**Service:** `backend/app/services/payment_service.py`  
**Last verified:** 2026-07-22

---

## Overview

Manages the pre-paid wallet system. Customers top up their wallet balance, which is debited when orders are placed. Payment records link orders to transactions. Reward points are awarded as a background task after successful payment.

---

## API Endpoints

### `POST /api/v1/payments/pay`

**Auth:** Required | **Roles:** `customer`, `student`

**Request body:** `PaymentCreate`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `order_id` | UUID | Yes | Must belong to the authenticated user |
| `method` | str | Yes | Pattern: `^(wallet\|simulation)$` |

> `bkash`, `nagad`, `card` appear in the `PaymentMethod` enum but the schema restricts to `wallet` and `simulation` only until gateway integration is complete.

**Business logic:**
1. Verify order belongs to `current_user`
2. Process payment via `PaymentService.pay_order()`
3. After commit: background task awards reward points (`earn_reward_points()`)

**Side effect (background):** `users.reward_points += floor(order.total_amount / 10)`

**Response `200`:** `PaymentResponse`

```json
{
  "payment_id": "3fa85f64-...",
  "order_id": "...",
  "amount": "240.00",
  "method": "wallet",
  "status": "paid"
}
```

---

### `POST /api/v1/payments/topup`

**Auth:** Required | **Roles:** `customer`, `student`

**Request body:** `TopupRequest`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `amount` | Decimal | Yes | `gt=0`, `le=10000` per transaction |

**Business logic:** `users.wallet_balance += amount`; creates `wallet_transaction` record.

**Response `200`:** `{ "wallet_balance": 850.0 }`

> Note: `wallet_balance` is returned as a float in the response, not Decimal string.

---

### `GET /api/v1/payments/history`

**Auth:** Required | **Roles:** `customer`, `student`

> Only the authenticated user's own payment history. No admin override on this endpoint.

**Response `200`:** `list[PaymentHistoryResponse]`

```json
[
  {
    "payment_id": "...",
    "order_id": "...",
    "amount": "240.00",
    "method": "wallet",
    "status": "paid",
    "transaction_ref": null,
    "created_at": "...",
    "order": { ... }
  }
]
```

---

## Pydantic Schemas

### `PaymentCreate`
```python
class PaymentCreate(BaseModel):
    order_id: UUID
    method: str = Field(..., pattern="^(wallet|simulation)$")
```

### `TopupRequest`
```python
class TopupRequest(BaseModel):
    amount: Decimal = Field(..., gt=0, le=10000)
```

### `PaymentResponse`
```python
class PaymentResponse(BaseModel):
    payment_id: UUID
    order_id: UUID
    amount: Decimal
    method: str
    status: str
```

### `PaymentHistoryResponse`
```python
class PaymentHistoryResponse(BaseModel):
    payment_id: UUID
    order_id: UUID
    amount: Decimal
    method: str
    status: str
    transaction_ref: str | None
    created_at: datetime
    order: OrderResponse    # nested order summary
```

---

## Wallet Business Rules

### WAL-1: Only Tenant-Scoped Top-Up
A user can only top up their own wallet. Admins cannot top up on behalf of users via this endpoint (use admin-level tooling or seed scripts for that).

### WAL-2: Wallet Cannot Go Negative
Order placement fails before deduction if `wallet_balance < total_amount - discount_amount` (rule OR-6).  
There is no credit or overdraft facility.

### WAL-3: Wallet Balance Is Denormalized
`users.wallet_balance` is updated on every transaction for performance.  
The authoritative audit trail is `wallet_transactions`.  
If `wallet_balance` and the sum of `wallet_transactions` disagree, `wallet_transactions` is the source of truth.

> **✅ Actually implemented RFC-011 Stage 1 (2026-07-22) — see PAY-9.** This rule was documented
> since before RFC-011 but the table never existed and `topup()` never wrote to it (spec/code drift,
> not a deliberate deferral). Now real: `PaymentService.topup()` and every gateway-driven wallet
> mutation write a `wallet_transactions` row.

### WAL-4: Wallet/Reward Triggers No-Op for Guest Orders
✅ [Phase 22 — Implemented 2026-07-05] (RFC-007). When `order.user_id IS NULL` (`order_source IN
('guest_qr','kiosk')`, see `modules/orders.md` OR-11 and `system/data-model.md`):
- No wallet deduction happens at order placement — guest orders skip `POST /payments/pay` entirely.
- No `reward_points` are earned or reversed (RWD-1/RWD-4 do not apply — there is no user to credit).
- Default payment for a guest order is **pay-at-counter**: staff call
  `PATCH /orders/{order_id}/mark-paid` (`order_service.mark_paid_at_counter`), which sets
  `payment_status='paid'` and creates no `wallet_transaction`. Rejects `order_source='customer_app'`
  orders with `400` (those go through the wallet).
- **WAL-5** covers the online alternative.

### WAL-5: Simulated Online Guest Payment
✅ [Phase 22 Phase 2 — Implemented 2026-07-05] (RFC-007). When the owning tenant has
`guest_checkout_mode='online'` (resolved via `order_service.resolve_public_owner_tenant()` — the
food-court parent for a food-court guest session, the tenant itself otherwise), a guest may instead
call `POST /public/orders/{guest_token}/pay` (`order_service.pay_guest_order_online`) at any point
before all sibling orders in the session are cancelled. Sets `payment_status='paid'`,
`payment_method='simulation'` on **every non-cancelled order in the guest session** — one guest
action pays the whole cart, even if it was split across multiple food-court vendors (WAL-4 covers
the alternative, per-order, staff-initiated pay-at-counter path for exactly this reason: each
vendor's own counter still marks its own ticket paid independently). This is a **simulated
gateway**, mirroring the existing authenticated `PaymentMethod.simulation` behaviour (always
succeeds, no real card/SSLCOMMERZ call). Rejects with `400` if the owning tenant is still
`guest_checkout_mode='counter'`, if every order is already paid, or if every order was cancelled.
Publishes `ORDER_PAID` per paid order, each on the guest's WS channel (`target_guest_token`) — see
`modules/websocket.md`. Real payment-gateway integration (SSLCOMMERZ or similar) remains
unimplemented; `simulation` is a placeholder value, not a claim that a real transaction occurred.

---

## Payment Method Values

| Method | Status |
|---|---|
| `wallet` | ✓ Active — uses internal wallet balance |
| `simulation` | ✓ Active — test mode, always succeeds |
| `sslcommerz` | 🚧 RFC-011 in progress — real gateway, per-tenant configured (Stage 2: authenticated checkout; Stage 3: guest checkout + wallet top-up) |
| `bkash` | 🚧 RFC-011 in progress — native bKash Tokenized Checkout, per-tenant configured (Stage 4) |
| `nagad` | ❌ Enum value only, unused legacy — SSLCommerz's own hosted checkout covers this channel |
| `card` | ❌ Enum value only, unused legacy — SSLCommerz's own hosted checkout covers this channel |

The `PaymentCreate.method` Pydantic validator enforces `wallet|simulation` only — **unchanged by
RFC-011**, since real gateways use new, separate endpoints (`POST /payments/gateway/initiate`, not
`POST /payments/pay`) rather than widening this validator. See RFC-011 for the full new endpoint set,
added incrementally per stage below.

---

## Payment Gateway Integration (RFC-011, ADR-015) — Stage 1 status: data model + admin config

**Stage 1 (this update) delivers:** `tenant_payment_gateways` / `gateway_transactions` /
`wallet_transactions` tables (see `specs/system/data-model.md`), Fernet credential encryption
(`specs/system/security.md` §8b, ADR-015), and the admin config CRUD endpoints below. **No consumer
checkout flow changes yet** — `POST /payments/pay`/`POST /payments/topup` are unchanged; real gateway
checkout ships in Stages 2–4.

### `GET /api/v1/payment-gateways/me`

**Auth:** Required | **Roles:** `tenant_admin`, `outlet_admin`, `food_court_admin`, `super_admin`,
`platform_admin` (same set gating `/tenants/me/settings` and `/public-link`)

Returns this tenant's configured gateways with credentials masked — **never** the decrypted secret.

**Response `200`:** `list[GatewayConfigMasked]`

```json
[
  {
    "gateway_type": "sslcommerz",
    "is_enabled": true,
    "is_sandbox": true,
    "public_identifier": "testbox",
    "has_credentials": true
  }
]
```

A gateway type with no row yet simply doesn't appear in the list (not a 404, not a null placeholder).

---

### `PUT /api/v1/payment-gateways/me/{gateway_type}`

**Auth:** Required | **Roles:** same as above

**Path param:** `gateway_type` — `sslcommerz` | `bkash`

**Request body:** `GatewayConfigUpsert` — gateway-specific secret fields (SSLCommerz:
`store_id`, `store_password`; bKash: `app_key`, `app_secret`, `username`, `password`), plus
`is_enabled`, `is_sandbox`. Omitting a secret field on an update **keeps the previously stored
value** (never wipes a secret just because the admin only toggled `is_enabled`) — mirrors this
project's existing genuine-partial-update convention (`PATCH /tenants/me/settings`,
`specs/modules/tenants.md`).

**Business logic:**
1. Encrypt the secret sub-fields (`store_password` / `app_secret`+`password`) via
   `crypto.encrypt_json()` — `500` with a clear message if `ENCRYPTION_KEY` is unset (PAY-6, fail-loud
   per ADR-015, not a silent plaintext write).
2. Upsert the `tenant_payment_gateways` row (unique on `tenant_id`+`gateway_type`).

**Response `200`:** `GatewayConfigMasked` (same shape as the list endpoint)

---

### `DELETE /api/v1/payment-gateways/me/{gateway_type}`

**Auth:** Required | **Roles:** same as above

Removes the tenant's configuration for one gateway type entirely (disables it and discards
credentials — not just a soft-disable). **Response:** `204 No Content`.

---

### `GET /api/v1/payment-gateways/available`

**Auth:** Required (authenticated checkout)

Returns which payment methods the calling user's tenant currently supports, for the checkout UI to
render dynamically instead of a hardcoded list.

**Response `200`:**
```json
{ "wallet": true, "simulation": true, "sslcommerz": true, "bkash": false }
```

`wallet`/`simulation` are always `true` (no gateway configuration needed). `sslcommerz`/`bkash` are
`true` only when that tenant has a row with `is_enabled=true` **and** stored credentials present.

---

## Business Rules — Payment Gateway Integration (RFC-011)

**PAY-6:** Gateway credentials are encrypted at rest (ADR-015) and never returned decrypted by any
API response, including the admin's own config endpoints.

**PAY-7:** A gateway callback/IPN is never trusted without independent server-to-server verification
against the gateway's own validation API, amount included. *(Enforced starting Stage 2 — no
callback/IPN endpoints exist yet in Stage 1.)*

**PAY-8:** IPN settlement is idempotent — a `gateway_transactions` row already in a terminal status
is never re-settled by a duplicate delivery. *(Stage 2+.)*

**PAY-9:** Every `wallet_balance` mutation writes a `wallet_transactions` row — closes the
previously-stale WAL-3 claim below, retrofitted in Stage 1 onto the *existing* synchronous
`topup()`, before any gateway complexity.

**PAY-10:** Food-court guest carts resolve the owner tenant (`resolve_public_owner_tenant`) for
gateway lookup, not the vendor's own `tenant_id`. *(Stage 3.)*

**PAY-11:** Real gateways are additive — `wallet`/`simulation` remain available on every tenant
regardless of gateway configuration.

**PAY-12:** No subscription-tier gating — every tier may configure and enable both gateway types.

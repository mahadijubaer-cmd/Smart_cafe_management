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
| `sslcommerz` | ✅ Active — real gateway, per-tenant configured (authenticated + guest checkout) |
| `bkash` | ✅ Active — native bKash Tokenized Checkout, per-tenant configured (Stage 4) |
| `nagad` | ❌ Enum value only, unused legacy — SSLCommerz's own hosted checkout covers this channel |
| `card` | ❌ Enum value only, unused legacy — SSLCommerz's own hosted checkout covers this channel |

The `PaymentCreate.method` Pydantic validator enforces `wallet|simulation` only — **unchanged by
RFC-011**, since real gateways use new, separate endpoints (`POST /payments/gateway/initiate`, not
`POST /payments/pay`) rather than widening this validator. See RFC-011 for the full new endpoint set,
added incrementally per stage below.

---

## Payment Gateway Integration (RFC-011, ADR-015)

**Stage 1** delivered `tenant_payment_gateways` / `gateway_transactions` / `wallet_transactions`
tables (see `specs/system/data-model.md`), Fernet credential encryption (`specs/system/security.md`
§8b, ADR-015), and the admin config CRUD endpoints below — no consumer checkout flow changes yet.

**Stage 2** delivered real SSLCommerz checkout for **authenticated order payment**
(`POST /payments/gateway/{initiate,{id}/callback/{outcome},ipn}` — the existing `wallet`/
`simulation` paths, `POST /payments/pay`/`POST /payments/topup`, remain completely unchanged).

**Stage 3** delivered the same real-gateway checkout for **guest/QR ordering** (restaurant-segment
tenants, `guest_checkout_mode='online'`) — see `specs/modules/public-surface.md`'s
`GET /public/{public_slug}/payment-methods` and `POST /public/orders/{guest_token}/pay/gateway/initiate`
for the full endpoint spec; this file only adds the settlement-side business rules (PAY-10, PAY-13)
since the callback/IPN endpoints themselves are shared with Stage 2, not duplicated. Wallet top-up
gateway payment is **not** in this stage — deferred, not yet scheduled.

**Stage 4 (this update) delivers:** native bKash Tokenized Checkout (v1.2.0-beta) as the second
`GatewayClient` implementation (`services/gateways/bkash_gateway.py`). Every existing endpoint —
`POST /payments/gateway/initiate`, `POST /public/orders/{guest_token}/pay/gateway/initiate`, the
callback/IPN settlement helpers — works unchanged for `gateway_type=bkash`; `build_gateway_client`
in `gateway_configs_service.py` gained one new branch. The **only** new route is
`GET /payments/gateway/{gateway_transaction_id}/bkash-callback` (see below and PAY-14) — bKash's
redirect shape genuinely differs from SSLCommerz's and can't reuse the same path.

**Stage 5 (this update) delivers:** a real `POST /payment-gateways/me/{gateway_type}/test`
connectivity check (PAY-15) — previously a stub in the RFC's plan, not previously implemented at all.

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

### `POST /api/v1/payments/gateway/initiate` — Stage 2

**Auth:** Required | **Roles:** `customer`, `student`

**Request body:**

| Field | Type | Notes |
|---|---|---|
| `order_id` | UUID | Must belong to the authenticated user, `payment_status='pending'` |
| `gateway_type` | `sslcommerz` \| `bkash` | Must be enabled+configured for the caller's tenant |

**Business logic:**
1. Load the order (404 if missing, 403 if not the caller's, 400 if already paid — same checks as
   `POST /payments/pay`).
2. Load the tenant's decrypted gateway config (server-only, never logged) — `400` if not
   enabled/configured (mirrors `available`'s own definition of "supported").
3. Create a `gateway_transactions` row (`status='initiated'`, `amount` = order total minus discount).
4. Call the gateway's Session API with `tran_id` = this row's ID as 32-char hex (no dashes — safely
   within every gateway's tran_id length limit) and callback URLs built from a new `BACKEND_URL`
   setting (the backend's own externally-reachable base URL — distinct from `FRONTEND_URL`, since
   these URLs are called by the gateway's servers, not the browser):
   - `success_url`/`fail_url`/`cancel_url`: `{BACKEND_URL}/api/v1/payments/gateway/{gateway_transaction_id}/callback/{outcome}`
   - `ipn_url`: `{BACKEND_URL}/api/v1/payments/gateway/ipn`
5. On a gateway-side session-init failure: mark the row `failed`, `502`.

**Response `200`:** `GatewayInitiateResponse` — `{ "gateway_transaction_id": "...", "redirect_url": "https://sandbox.sslcommerz.com/..." }`. The frontend does a full-page navigation (`window.location.href`) to `redirect_url` — this is a hosted-checkout redirect, not an API call the SPA stays on.

**Errors:** `404` order not found · `403` not the caller's order · `400` already paid, or gateway not configured · `502` gateway session-init failed.

---

### `POST /api/v1/payments/gateway/{gateway_transaction_id}/callback/{outcome}` — Stage 2

**Auth:** None — this is the browser-redirect landing point after the customer completes (or
abandons) the gateway's hosted page. Rate-limited `20/minute` per IP (`slowapi`, same mechanism as
`otp.py`) since real end users hit this, unlike the IPN endpoint below.

**Path params:** `gateway_transaction_id` (UUID) · `outcome` ∈ `success` \| `fail` \| `cancel`
(anything else → `404`)

**Business logic:**
1. Parse the gateway's POSTed form body (SSLCommerz redirects the browser here via an
   auto-submitting form, not a plain GET).
2. Load the `gateway_transactions` row **with a row lock** (`SELECT ... FOR UPDATE`) — serializes
   against a concurrent IPN delivery for the same row (PAY-8).
3. If already in a terminal status (`success`/`failed`/`cancelled`): skip re-settlement, just
   redirect (idempotent — a customer refreshing the landing page, or IPN having already settled it,
   must not re-process).
4. `outcome=success`: verify via the gateway's own validation API (PAY-7) — checks `status`,
   confirms the validated `amount` matches the row's `amount` exactly, before marking `success` and
   (for `purpose=order_payment`) creating the matching `payments` row + flipping
   `orders.payment_status='paid'` (same shape as `PaymentService.pay_order`, so
   `GET /payments/history` needs no changes).
5. `outcome=fail`/`cancel`: marks the row `failed`/`cancelled`, no `payments` row created (mirrors
   guest checkout's existing precedent of not writing a `payments` row for a non-settled attempt).
6. Redirects (`303 See Other`) to the frontend: `{FRONTEND_URL}/{tenant_slug}/track/{order_id}?payment={success|failed|cancelled}`.

---

### `POST /api/v1/payments/gateway/ipn` — Stage 2

**Auth:** None (server-to-server webhook — the gateway calls this directly, no browser involved).
**Not** `slowapi`-limited (PAY-7/8's rationale: throttling here risks rate-limiting the gateway's own
retry behavior, which is the opposite of what's wanted — idempotency, not rate-limiting, is the
defense).

**Business logic:** same settlement path as the callback endpoint's `success` branch (row-locked,
idempotent, validates via the gateway's own API before trusting anything) — reachable independently
of whether the browser ever completes its own redirect back (e.g. the customer closed the tab on the
gateway's page). Always returns `{"status": "ok"}` (or `"ignored"` for an unrecognized `tran_id`) —
gateways generally expect a `200` acknowledgement regardless of the payment's own outcome.

---

### `GET /api/v1/payments/gateway/{gateway_transaction_id}/bkash-callback` — Stage 4

**Auth:** None — browser-redirect landing point, bKash's equivalent of the SSLCommerz callback
above. Rate-limited `20/minute` per IP, same as the SSLCommerz callback.

bKash's Tokenized Checkout registers exactly **one** `callbackURL` at Create Payment time (not three
like SSLCommerz), and redirects the browser back to it via a plain `GET` with `?paymentID=...&status=
success|failure|cancel` appended — a genuinely different shape from SSLCommerz's POST-form,
per-outcome-URL callback, hence a dedicated route rather than reusing
`POST /payments/gateway/{id}/callback/{outcome}`.

**Business logic:**
1. Read `paymentID` and `status` from the query string.
2. Load the `gateway_transactions` row with a row lock (identical to the SSLCommerz callback).
3. `status=success` → `_settle_success` (shared helper) — internally calls
   `BkashGateway.validate(val_id=paymentID, ...)`, which calls bKash's **Execute Payment** API
   (`POST /tokenized/checkout/execute/{paymentID}`) — for bKash, Execute *is* the verification step
   (PAY-14), there is no separate "query only" call in the settlement path.
4. `status=failure`/`cancel` → `_settle_non_success` with the corresponding outcome — no Execute
   call made (nothing to execute on an abandoned/failed attempt).
5. Same shared `_build_frontend_redirect` as every other gateway — `order_id` vs `guest_token`
   branch is identical to SSLCommerz's.

**Response:** `303` redirect to the frontend tracking page with `?payment=success|failed|cancelled`,
identical shape to the SSLCommerz callback.

---

### `POST /api/v1/payment-gateways/me/{gateway_type}/test` — Stage 5

**Auth:** Required | **Roles:** same as the config CRUD endpoints above.

A real connectivity check against the tenant's saved credentials — makes one genuine call to the
configured gateway (sandbox or live, per the saved `is_sandbox` flag), not a stub. Works even if
the gateway row is currently `is_enabled=false` (an admin should be able to test before switching a
gateway live) — the only requirement is that credentials have been saved at all.

**Business logic:**
1. Load the tenant's decrypted config for `gateway_type`, ignoring `is_enabled`
   (`get_decrypted_config_any` — distinct from the `is_enabled`-gated getter used by checkout/
   settlement) — `400` if no credentials have ever been saved for this gateway type.
2. `sslcommerz`: calls the real Session API with a nominal payload (amount `10`, dummy callback
   URLs never actually visited) — `SUCCESS` response ⇒ credentials valid. This does create one
   real, immediately-abandoned SSLCommerz session (harmless — indistinguishable from any customer
   who opens checkout and never pays).
3. `bkash`: calls Grant Token only, with the saved `app_key`/`app_secret`/`username`/`password` — a
   returned `id_token` ⇒ credentials valid. No payment/session is created by this check.
4. Any network error or gateway-side rejection is caught and reported as a failure with the
   gateway's own message, never raised as a `500`.

**Response `200`:** `{ "success": true, "message": "..." }` or `{ "success": false, "message": "..." }`.
Always `200` — a failed connectivity check is a normal, expected response shape, not a server error.

**Errors:** `400` no credentials saved for this gateway type yet.

---

## Business Rules — Payment Gateway Integration (RFC-011)

**PAY-6:** Gateway credentials are encrypted at rest (ADR-015) and never returned decrypted by any
API response, including the admin's own config endpoints.

**PAY-7:** ✅ Enforced from Stage 2. A gateway callback/IPN is never trusted without independent
server-to-server verification against the gateway's own validation API, amount included exactly.

**PAY-8:** ✅ Enforced from Stage 2. IPN/callback settlement is idempotent — a `gateway_transactions`
row already in a terminal status is never re-settled by a duplicate delivery, enforced via
`SELECT ... FOR UPDATE` row locking so a concurrent callback+IPN race can't double-settle either.

**PAY-9:** Every `wallet_balance` mutation writes a `wallet_transactions` row — closes the
previously-stale WAL-3 claim below, retrofitted in Stage 1 onto the *existing* synchronous
`topup()`, before any gateway complexity.

**PAY-10:** ✅ Enforced from Stage 3. Food-court guest carts resolve the owner tenant
(`resolve_public_owner_tenant`) for gateway lookup, not the vendor's own `tenant_id` — see
`modules/public-surface.md`'s `POST /public/orders/{guest_token}/pay/gateway/initiate`.

**PAY-13:** Guest-session gateway settlement never creates a `payments` row — it flips
`payment_status`/`payment_method` directly on every payable sibling order, mirroring the existing
simulated guest-payment precedent (WAL-5). Only *authenticated* order-gateway settlement creates a
`payments` row (so `GET /payments/history`, a customer-account-only endpoint, needs no changes).

**PAY-11:** Real gateways are additive — `wallet`/`simulation` remain available on every tenant
regardless of gateway configuration.

**PAY-12:** No subscription-tier gating — every tier may configure and enable both gateway types.

**PAY-14:** ✅ Enforced from Stage 4. bKash's Execute Payment call (`POST
/tokenized/checkout/execute/{paymentID}`) is both the finalize step **and** the PAY-7 verification
step — unlike SSLCommerz, where a separate `validationserverAPI` call verifies a payment already
finalized on SSLCommerz's side. `BkashGateway.validate()` calls Execute exactly once per settlement
attempt (the existing row-lock + terminal-status check from PAY-8 already prevents a second Execute
call for the same `gateway_transactions` row — bKash's own API also rejects a duplicate Execute for
an already-executed `paymentID`, so this is defense in depth, not the only safeguard). bKash's own
callback shape (single `callbackURL`, `GET` redirect with `?paymentID=&status=` query params) is
different enough from SSLCommerz's (three POST-form URLs) that it gets its own route
(`GET /payments/gateway/{id}/bkash-callback`) rather than reusing
`POST /payments/gateway/{id}/callback/{outcome}` — both routes funnel into the same shared
`_settle_success`/`_settle_non_success`/`_build_frontend_redirect` helpers, so PAY-7/8/10/13 all
apply identically regardless of which gateway triggered settlement.

**PAY-15:** ✅ Enforced from Stage 5. `POST /payment-gateways/me/{gateway_type}/test` performs a
genuine live call against the configured gateway (not a stub) and never requires `is_enabled=true`
first — an admin can verify credentials before switching a gateway live.

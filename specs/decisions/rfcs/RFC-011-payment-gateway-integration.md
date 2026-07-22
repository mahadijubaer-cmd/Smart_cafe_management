# RFC-011: Per-Tenant Payment Gateway Integration (SSLCommerz + Native bKash)

**Date:** 2026-07-22
**Author:** Mahadi Jubaer
**Status:** Accepted
**Related spec files:** `modules/payments.md`, `modules/public-surface.md`, `modules/tenants.md`,
`system/data-model.md`, `system/security.md`, `frontend/overview.md`, `operations/deployment.md`,
`operations/roadmap.md`, `decisions/adrs/ADR-015-tenant-secret-encryption.md`

---

## 1. Motivation

SCMS today has exactly two payment "methods": internal wallet balance and `simulation` (always
succeeds, no money moves). `specs/operations/roadmap.md` lists a real payment-gateway integration as
one of two remaining roadmap items, marked "genuinely blocked on external resources (needs real
merchant credentials)." That blocker doesn't actually hold for build-and-test: **SSLCommerz publishes
a public sandbox merchant account** (`store_id=testbox`, `store_passwd=qwerty`) and **bKash publishes
sandbox developer credentials** in their own docs — both usable by anyone without a real registered
business, which unblocks full end-to-end implementation and testing now. Each tenant's own real
merchant credentials (once they have one) simply replace the sandbox values in the same UI, with no
further code change.

The request driving this RFC: every tenant admin should be able to configure **their own** payment
gateway credentials — SSLCommerz and/or native bKash — from an admin settings page, and every
consumer-facing checkout (authenticated order checkout, guest/QR checkout, wallet top-up) should show
only the payment methods that tenant has actually enabled. This is a per-tenant capability, not a
platform-wide toggle: `wallet`/`simulation` stay universally available (they need no external
credentials), while `sslcommerz`/`bkash` only appear for a tenant that has configured and enabled
them.

**Why both gateways, not just SSLCommerz:** SSLCommerz's own hosted checkout page already lets a
customer pick a card, bKash, Nagad, Rocket, Upay, or net banking — one merchant integration, one
redirect flow, covers all of those channels. A tenant who already has their **own** bKash merchant
account and wants bKash's own branded checkout (not routed through a third-party aggregator's page)
needs a second, independent integration against bKash's own Tokenized Checkout API. Both are in scope
for this RFC.

**Why not tier-gated:** unlike the existing numeric `max_outlets`/`max_menu_items`/`max_staff` caps
(`backend/app/core/tier_limits.py`), this capability is available to every subscription tier —
explicitly decided with the user, not something this RFC invents a monetization rule for.

---

## 2. Proposed Design

### 2.1 Overview

A new pluggable gateway layer: each tenant has zero or more `TenantPaymentGateway` rows (one per
gateway type), holding enable/sandbox flags and encrypted credentials. A common `GatewayClient`
interface (`initiate()` / `validate_callback()`) is implemented once per gateway
(`SSLCommerzGateway`, `BkashGateway`). A new `GatewayTransaction` table tracks the async
initiate→redirect→callback/IPN→settle lifecycle that a real gateway requires (unlike today's
synchronous wallet/simulation flow). A new `WalletTransaction` ledger table backs both the existing
direct top-up and the new gateway-driven top-up, closing a pre-existing spec/code gap (see §2.6,
PAY-9). Every consumer-facing checkout point calls one new read endpoint
(`GET /payment-gateways/available`) to know which methods to render; existing `wallet`/`simulation`
paths are untouched.

### 2.2 User-Facing Behaviour

**Tenant admin** (`tenant_admin`/`outlet_admin`/`food_court_admin`/`super_admin`/`platform_admin`,
the same role set already gating the existing Public Link / Settings pages): a new **Payment
Settings** page, one card per gateway type. Each card: an enable switch, a sandbox/live switch,
gateway-specific credential fields (SSLCommerz: Store ID + Store Password; bKash: App Key + App
Secret + Username + Password), a masked display of any already-saved secret (never the real value —
only the last few characters or a placeholder), and a "Test connection" button that makes one real
call against the configured gateway/sandbox and reports success/failure immediately.

**Authenticated customer checkout** (`(student)/order/page.tsx`'s existing step-4 payment-method
radio list): today shows exactly "Wallet payment" / "Simulation payment". Once the tenant has an
enabled gateway, the same list gains "Pay with SSLCommerz (card, mobile banking, net banking)" and/or
"Pay with bKash". Choosing either redirects the browser to that gateway's real hosted checkout page;
on completion the gateway redirects back to the existing order-tracking page, which shows a
success/failure banner instead of the old "always succeeds" assumption.

**Guest/QR checkout** (`m/[public_slug]/page.tsx`): today's single "Pay now" button (simulated) gains
the same real-gateway choice whenever the owning tenant (resolved via the existing
`resolve_public_owner_tenant`, correct for food-court vendor carts too) has one enabled. Simulation
stays available as the always-on fallback so demo/QA flows never break.

**Wallet top-up** (`(student)/wallet/page.tsx`, also reachable via the
`[tenant_slug]/(customer)/wallet` re-export): today's direct-credit top-up form gains the same
real-gateway choice for adding real money to the wallet balance.

### 2.3 New or Changed API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/payment-gateways/me` | `_ADMIN_ROLES` | Masked list of this tenant's configured gateways |
| `PUT` | `/api/v1/payment-gateways/me/{gateway_type}` | `_ADMIN_ROLES` | Upsert one gateway's config (credentials encrypted at rest) |
| `DELETE` | `/api/v1/payment-gateways/me/{gateway_type}` | `_ADMIN_ROLES` | Remove a configured gateway |
| `POST` | `/api/v1/payment-gateways/me/{gateway_type}/test` | `_ADMIN_ROLES` | Live connectivity check against the configured (sandbox or live) gateway |
| `GET` | `/api/v1/payment-gateways/available` | Required (authenticated checkout) | Which methods to show this tenant's logged-in customer |
| `GET` | `/api/v1/public/tenants/{slug}/payment-methods` | None (guest checkout) | Same, resolved via owner-tenant for food-court vendors |
| `POST` | `/api/v1/payments/gateway/initiate` | Required | `{order_id, gateway_type}` → creates a `GatewayTransaction`, returns `{redirect_url, gateway_transaction_id}` |
| `POST` | `/api/v1/payments/gateway/{gateway_transaction_id}/callback/{outcome}` | None (browser redirect target) | `outcome ∈ success\|fail\|cancel`; verifies via the gateway's own validation call, settles, redirects to the frontend tracking/wallet page with `?payment=` |
| `POST` | `/api/v1/payments/gateway/ipn` | None (server-to-server webhook) | Idempotent settlement path; verified via the gateway's validation API, never trusts the raw payload |
| `POST` | `/api/v1/payments/topup/gateway/initiate` | Required | `{amount, gateway_type}` → same `GatewayTransaction` flow, `purpose=wallet_topup` |
| `POST` | `/api/v1/public/orders/{guest_token}/pay/gateway/initiate` | None (guest, capability = `guest_token`) | `{gateway_type}` → guest-session equivalent of the order-payment initiate |

Existing `POST /payments/pay` (wallet/simulation) and `POST /payments/topup` (direct credit) and
`POST /public/orders/{guest_token}/pay` (simulated) are **unchanged** — real gateways are additive.

Full request/response schemas: `specs/modules/payments.md`.

### 2.4 Database Changes

```sql
CREATE TYPE gatewaytype AS ENUM ('sslcommerz', 'bkash');
CREATE TYPE gatewaytransactionstatus AS ENUM ('initiated', 'pending', 'success', 'failed', 'cancelled');
CREATE TYPE gatewaypurpose AS ENUM ('order_payment', 'wallet_topup');
CREATE TYPE wallettransactiondirection AS ENUM ('credit', 'debit');
CREATE TYPE wallettransactionsource AS ENUM ('gateway_topup', 'simulation_topup', 'order_payment', 'manual');

ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'sslcommerz';
-- 'bkash' already exists as an enum value (added in migration 0003, never wired up until now)

CREATE TABLE tenant_payment_gateways (
    gateway_config_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    gateway_type gatewaytype NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
    public_identifier VARCHAR(150),      -- non-secret: SSLCommerz store_id / bKash username+app_key
    credentials_encrypted TEXT,           -- Fernet blob: only the genuinely secret sub-fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, gateway_type)
);

CREATE TABLE gateway_transactions (
    gateway_transaction_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    purpose gatewaypurpose NOT NULL,
    order_id UUID REFERENCES orders(order_id),
    user_id UUID REFERENCES users(user_id),
    guest_token UUID,
    gateway_type gatewaytype NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status gatewaytransactionstatus NOT NULL DEFAULT 'initiated',
    gateway_ref VARCHAR(100),             -- our generated tran_id
    gateway_external_ref VARCHAR(150),     -- the gateway's own val_id / trxID
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
    wallet_transaction_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),
    amount NUMERIC(10,2) NOT NULL,
    direction wallettransactiondirection NOT NULL,
    source wallettransactionsource NOT NULL,
    reference_id UUID,                     -- optional pointer to gateway_transactions.gateway_transaction_id
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Full column-level detail: `specs/system/data-model.md`.

### 2.5 Frontend Pages / Components

| Page / Component | Path | What it does |
|---|---|---|
| Payment Settings (new) | `[tenant_slug]/(admin)/payment-settings/page.tsx` | Admin config UI, mirrors `public-link/page.tsx`'s load/save/toast pattern |
| Admin nav (modified) | `[tenant_slug]/(admin)/layout.tsx` | New `NAV_DEFS` entry, gated by existing `_ADMIN_ROLES` |
| Checkout (modified) | `(student)/order/page.tsx` | Dynamic payment-method list from `GET /payment-gateways/available` |
| Order tracking (modified) | `(student)/track/[orderId]/page.tsx` | Reads `?payment=success\|failed\|cancelled`, shows banner |
| Guest checkout (modified) | `m/[public_slug]/page.tsx` | Same dynamic method list, guest-scoped |
| Wallet (modified) | `(student)/wallet/page.tsx` | Gateway-driven top-up option alongside existing direct top-up |

### 2.6 Business Rules

**PAY-6 — Gateway credentials are encrypted at rest, decrypted only server-side for a live gateway
call.** No API response — including the admin's own `GET /payment-gateways/me` — ever returns a
decrypted secret. See ADR-015 for the encryption mechanism.

**PAY-7 — A gateway callback/IPN is never trusted without independent server-to-server
verification.** Every settlement (callback or IPN) must call the gateway's own validation API
(SSLCommerz `validationserverAPI`, bKash `payment/status`) and compare the verified amount against
the `GatewayTransaction.amount` before marking anything paid. A mismatch is rejected, not "trusted
with a warning."

**PAY-8 — IPN settlement is idempotent.** A `GatewayTransaction` already in a terminal status
(`success`/`failed`/`cancelled`) is never re-settled by a duplicate IPN delivery — checked before any
wallet credit or order-payment write, not after.

**PAY-9 — Wallet balance changes are always ledgered.** Every `wallet_balance` mutation (existing
direct top-up, new gateway top-up, order payment) writes a `WalletTransaction` row. This closes a
pre-existing gap: `specs/modules/payments.md`'s WAL-3 has claimed since before this RFC that
`wallet_transactions` is "the authoritative audit trail," but no such table has ever existed in the
codebase — `topup()` has only ever done a bare balance increment. Retrofitted immediately (Stage 1,
before any gateway complexity) rather than left stale.

**PAY-10 — Food-court guest carts resolve the owner tenant for gateway lookup, not the vendor.**
Mirrors the existing `resolve_public_owner_tenant` precedent already used by
`pay_guest_order_online` — a food-court vendor's own `Order.tenant_id` is not necessarily the tenant
whose gateway configuration applies.

**PAY-11 — Real gateways are additive, never replace `wallet`/`simulation`.** Both existing methods
stay available on every tenant regardless of gateway configuration, so no demo, QA, or existing
integration test path breaks.

**PAY-12 — No subscription-tier gating.** Every tier may configure and enable both gateway types —
explicitly decided against extending `tier_limits.py`'s numeric-cap mechanism to a new boolean
feature flag for this capability.

---

## 3. Alternatives Considered

- **Extend the existing `Payment` model instead of a new `GatewayTransaction` table** — rejected:
  `Payment.order_id`/`user_id` are non-nullable FKs, incompatible with wallet top-up (no order) and
  guest checkout (no user, only `guest_token`). Making both nullable would force every existing
  `Payment` query to add null-checks for a shape change that only exists to support gateways.
- **SSLCommerz only, defer native bKash** — considered and offered to the user as the simpler,
  lower-risk option (one integration covers all bKash/Nagad/Rocket/card channels via SSLCommerz's own
  hosted page); the user chose both gateways now.
- **Gate gateway access by subscription tier** — considered as a monetization lever consistent with
  existing tier-capped resources; the user explicitly declined, no gating in this RFC.
- **Reuse `slowapi`'s per-IP limiter on the new IPN endpoint** — rejected: IPN calls originate from
  the gateway's own servers and are retried by design; per-IP throttling would rate-limit the gateway
  itself. Idempotency (PAY-8), not rate-limiting, is the correct IPN defense. The *browser-redirect*
  callback endpoint, hit by real users, does get a normal `slowapi` limit.

---

## 4. Open Questions

- [x] SSLCommerz-only vs. also native bKash — **resolved: both, now.**
- [x] Tier-gate gateway access — **resolved: no gating.**
- [x] Wallet top-up in scope now vs. later — **resolved: in scope now.**
- [ ] A platform-admin oversight view (which tenants have gateways configured) was raised during
  design review as adjacent scope creep — **deferred**, not part of this RFC; would need its own RFC
  section if wanted later.

---

## 5. Implementation Checklist

**SPEC CHANGES FIRST — no code until all spec checkboxes are ticked**, applied per-stage as each
stage below is implemented (this project's standing spec-first workflow):

- [ ] `specs/modules/payments.md` updated (Stage 1: tables + encryption note; full endpoint/rule
      detail added incrementally per stage)
- [ ] `specs/system/data-model.md` updated (Stage 1: three new tables)
- [ ] `specs/system/security.md` updated (Stage 1: tenant secret encryption, cross-ref ADR-015)
- [ ] `specs/decisions/adrs/ADR-015-tenant-secret-encryption.md` written (Stage 1)
- [ ] `specs/frontend/overview.md` updated (Stage 1: new admin page + routing tree entry)
- [ ] `specs/operations/deployment.md` updated (Stage 1: `ENCRYPTION_KEY`, sandbox setup instructions)
- [ ] `specs/modules/public-surface.md` updated (Stage 3: guest gateway endpoints)
- [ ] `specs/operations/roadmap.md` updated (mark the "genuinely blocked" item superseded)
- **Stage 1** — Alembic migration; `TenantPaymentGateway`/`GatewayTransaction`/`WalletTransaction`
  models; `crypto.py`; `gateway_configs_service.py`; `payment_gateways.py` router (config CRUD +
  `available`); admin Payment Settings page + nav entry; `topup()` writes `WalletTransaction`; tests.
- **Stage 2** — SSLCommerz gateway client; `/payments/gateway/*` endpoints for authenticated order
  checkout; checkout UI + tracking-page banner; tests.
- **Stage 3** — SSLCommerz for guest checkout (food-court owner-tenant resolution) + wallet top-up;
  frontend for both; tests.
- **Stage 4** — Native bKash gateway client, same endpoints/UI extended to the second gateway type;
  tests.
- **Stage 5** — Real "Test connection" implementation; docs polish.
- [ ] `CHANGELOG.md` updated per stage

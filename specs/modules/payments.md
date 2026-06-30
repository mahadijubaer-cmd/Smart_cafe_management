# Module: Payments

**Router:** `backend/app/routers/payments.py`  
**Schemas:** `backend/app/schemas/payment.py`  
**Service:** `backend/app/services/payment_service.py`  
**Last verified:** 2026-06-30

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

---

## Payment Method Values

| Method | Status |
|---|---|
| `wallet` | ✓ Active — uses internal wallet balance |
| `simulation` | ✓ Active — test mode, always succeeds |
| `bkash` | ❌ Enum value only — gateway not connected |
| `nagad` | ❌ Enum value only — gateway not connected |
| `card` | ❌ Enum value only — gateway not connected |

The `PaymentCreate.method` Pydantic validator enforces `wallet|simulation` only, preventing the unimplemented methods from being selected.

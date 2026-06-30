# Testing

**Last verified:** 2026-06-30

---

## Test Stack

| Tool | Version | Purpose |
|---|---|---|
| pytest | 8.x | Test runner |
| pytest-asyncio | 0.23.x | Async test support |
| httpx | 0.27.x | Async HTTP test client |
| SQLite (aiosqlite) | — | In-memory test DB |
| FakeAsyncRedis | fakeredis 2.x | Redis stub |
| factory-boy | — | Fixture factories (planned) |

> Tests use **SQLite in-memory** (not PostgreSQL) for speed. This catches logic errors but not PostgreSQL-specific SQL.

---

## Test Directory Structure

```
backend/
  tests/
    conftest.py             ← Shared fixtures: app, db, client, auth tokens
    test_auth.py            ← Auth endpoints
    test_users.py           ← User management
    test_menu.py            ← Menu CRUD
    test_orders.py          ← Order lifecycle
    test_payments.py        ← Payments and wallet
    test_inventory.py       ← Inventory and stock movements
    test_tables.py          ← Table management
    test_cleaners.py        ← Cleaner logs
    test_tenants.py         ← Tenant management
    test_analytics.py       ← Analytics endpoints
    test_food_court.py      ← Food court module
    test_ws.py              ← WebSocket connections
```

---

## Core Fixtures (`conftest.py`)

```python
@pytest.fixture
async def db_session():
    """SQLite in-memory session for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
    await engine.dispose()

@pytest.fixture
def fake_redis():
    """FakeAsyncRedis instance — in-memory Redis stub."""
    return FakeAsyncRedis()

@pytest.fixture
async def client(db_session, fake_redis):
    """HTTP test client with overridden dependencies."""
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_redis] = lambda: fake_redis
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
async def bracu_tenant(db_session):
    """Creates and returns the BRACU test tenant."""
    tenant = Tenant(
        tenant_id=uuid.UUID("..."),
        name="BRACU Cafeteria",
        slug="bracu",
        tenant_type=TenantType.academic,
        subscription_tier=SubscriptionTier.starter,
        is_active=True,
    )
    db_session.add(tenant)
    await db_session.commit()
    return tenant

@pytest.fixture
async def admin_token(bracu_tenant, db_session):
    """Creates tenant_admin user and returns their JWT."""
    # creates user, returns JWT string

@pytest.fixture
async def staff_token(bracu_tenant, db_session):
    """Creates staff user and returns their JWT."""

@pytest.fixture
async def customer_token(bracu_tenant, db_session):
    """Creates customer user and returns their JWT."""
```

---

## Key Test Patterns

### Auth headers

```python
headers = {"Authorization": f"Bearer {token}"}
response = await client.get("/api/v1/users/", headers=headers)
```

### Expected Redis OTP key format

```python
# Correct: otp:email_verification:{email}
key = f"otp:email_verification:{user_email}"
await fake_redis.set(key, "123456", ex=600)
```

> **Do NOT use** `otp:verification:{email}` — that is wrong and tests will fail.

### Expected JWT blacklist key format

```python
# Correct: blacklist:jti:{jti}
key = f"blacklist:jti:{jti_value}"
assert await fake_redis.exists(key)
```

---

## Test Cases by Module

### `test_auth.py`

| Test | Description |
|---|---|
| `test_register_success` | Valid registration returns 201 + message |
| `test_register_duplicate_email` | Duplicate email → 400 |
| `test_register_invalid_email_domain` | Domain restriction enforced |
| `test_verify_email_success` | Correct OTP + `otp_code` field → 200 |
| `test_verify_email_wrong_otp` | Wrong code → 400 |
| `test_verify_email_expired_otp` | Expired key → 400 |
| `test_login_success` | Valid credentials → Token |
| `test_login_wrong_password` | Wrong password → 401 |
| `test_login_unverified_email` | email_verified=False → 403 |
| `test_login_inactive_user` | is_active=False → 401 |
| `test_logout_blacklists_jti` | Logout sets `blacklist:jti:{jti}` in Redis |
| `test_request_otp_login` | Sends OTP; sets `otp:login:{email}` |
| `test_verify_otp_success` | Valid OTP verifies |
| `test_verify_otp_wrong_purpose` | Purpose mismatch → 400 |
| `test_rate_limit_login` | 11th request → 429 |

### `test_orders.py`

| Test | Description |
|---|---|
| `test_create_order_success` | Valid order → 201 |
| `test_create_order_with_table` | `table_id` is integer (SERIAL) |
| `test_create_order_reward_points_redeemed` | `redeem_points: true` applies discount |
| `test_update_order_status` | Staff moves pending → confirmed → preparing → ready → delivered |
| `test_cancel_order_delete` | `DELETE /orders/{id}` cancels order |
| `test_no_cancel_endpoint` | `POST /orders/{id}/cancel` → 404 |
| `test_order_websocket_event` | STATUS change publishes correct event to Redis |
| `test_customer_cannot_see_others_orders` | 403 on cross-user access |
| `test_order_placed_event_name` | Event type is `ORDER_PLACED` not `NEW_ORDER` |

### `test_inventory.py`

| Test | Description |
|---|---|
| `test_receive_po` | `POST /inventory/receive-po` creates `purchase` movement |
| `test_movement_types` | Valid: `purchase, transfer_in, transfer_out, consumption, adjustment, waste` |
| `test_invalid_movement_type` | `consume` → 422 (wrong name) |
| `test_transfer_out_creates_transfer_in` | Cross-outlet transfer creates both movements |
| `test_strict_mode_blocks_order` | `inventory_strict_mode=True` blocks order when stock insufficient |
| `test_strict_mode_default_false` | New tenant has `inventory_strict_mode=False` |
| `test_low_stock_event` | Item below threshold emits `LOW_STOCK` (not `LOW_STOCK_ALERT`) |

### `test_cleaners.py`

| Test | Description |
|---|---|
| `test_cleaner_log_table_name` | Model uses `cleaner_logs` table |
| `test_cleaner_log_pk` | PK field is `log_id` (UUID) |
| `test_cleaner_status_values` | Valid: `assigned, in_progress, done` |
| `test_clean_assigned_event` | Event type is `CLEAN_ASSIGNED` (not `CLEANER_ASSIGNED`) |
| `test_get_logs_by_status` | `GET /cleaners/logs/?status=assigned` |

### `test_payments.py`

| Test | Description |
|---|---|
| `test_wallet_topup` | Returns `{ wallet_balance: float }` |
| `test_payment_method_restriction` | `method` must be `wallet` or `simulation` |
| `test_reward_points_earned` | `floor(total_amount / 10)` points added |
| `test_history_customer_only` | Admin → 403 on `GET /payments/history` |
| `test_topup_customer_only` | Admin → 403 on `POST /payments/topup` |

### `test_analytics.py`

| Test | Description |
|---|---|
| `test_summary_period_param` | `GET /analytics/summary?period=today` |
| `test_top_items_days_param` | `GET /analytics/top-items?days=7` (not `period`) |
| `test_revenue_days_param` | `GET /analytics/revenue?days=30` (not `period`) |
| `test_analytics_floats` | Response values are float not Decimal string |
| `test_table_usage` | `GET /analytics/table-usage` returns data |
| `test_outlets_analytics_super_admin_only` | tenant_admin → 403 on /analytics/outlets |

### `test_ws.py`

| Test | Description |
|---|---|
| `test_ws_connect_valid_token` | Connection succeeds with valid JWT |
| `test_ws_reject_invalid_token` | Invalid JWT → 1008 close |
| `test_ws_message_flat_format` | Events are flat `{type, ...}` not `{event, data}` |
| `test_ws_ping_pong` | Send PING → receive PONG |

---

## Running Tests

```bash
cd backend

# All tests
pytest

# Single module
pytest tests/test_auth.py -v

# Single test
pytest tests/test_orders.py::test_cancel_order_delete -v

# With coverage
pytest --cov=app --cov-report=term-missing

# Parallel (requires pytest-xdist)
pytest -n auto
```

---

## CI Pipeline

```yaml
# .github/workflows/ci.yml (planned)
steps:
  - name: Install deps
    run: pip install -r requirements.txt

  - name: Run migrations on test DB
    run: alembic upgrade head
    env:
      DATABASE_URL: sqlite+aiosqlite:///:memory:

  - name: Run tests
    run: pytest --cov=app --cov-report=xml

  - name: Upload coverage
    uses: codecov/codecov-action@v3
```

---

## Common Test Failures and Causes

| Failure | Root cause |
|---|---|
| `otp:verification:…` key not found | Wrong OTP Redis key — use `otp:email_verification:{email}` |
| `blacklist:{jti}` not found | Wrong blacklist key — use `blacklist:jti:{jti}` |
| `POST /orders/{id}/cancel` returns 404 | Endpoint doesn't exist — use `DELETE /orders/{id}` |
| `LOW_STOCK_ALERT` event not received | Wrong event name — use `LOW_STOCK` |
| `CLEANER_ASSIGNED` event not received | Wrong event name — use `CLEAN_ASSIGNED` |
| `consume` movement type → 422 | Wrong name — use `consumption` |
| `table_id` must be int, got UUID | `table_id` is SERIAL INTEGER, not UUID |
| `X-Tenant-Slug` header rejected | Middleware reads JWT, not header — remove header |

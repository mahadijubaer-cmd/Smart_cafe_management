# Spec 10 — Testing Strategy

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. Principles

1. **Tests verify spec'd behaviour, not implementation details.** Test that `POST /orders/` with insufficient balance returns `400` — not that `wallet_balance` is checked on line 47 of `orders.py`.
2. **Every business rule in `06-business-rules.md` must have at least one test.**
3. **Every tenant isolation claim must have a test.** Cross-tenant data leakage is a critical security failure.
4. **Tests run in isolation.** Each test function gets a fresh database and fresh Redis. No test shares state with another.

---

## 2. Test Stack

| Tool | Purpose |
|---|---|
| `pytest` | Test runner |
| `pytest-asyncio` (`asyncio_mode=auto`) | Async test support |
| `httpx.AsyncClient` | ASGI test client (no real network; hits FastAPI directly) |
| SQLite in-memory (`aiosqlite`) | Isolated test database per test session |
| `FakeAsyncRedis` | In-memory Redis stub (defined in `conftest.py`) |

**Why SQLite for tests?** SQLAlchemy's async engine works with SQLite in-memory. This avoids requiring a running PostgreSQL instance in CI and makes tests fast. The trade-off: PostgreSQL-specific features (e.g., `uuid_generate_v4()`) require workarounds in test DDL.

---

## 3. Configuration

File: `backend/pytest.ini`
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

---

## 4. Test Fixtures (`tests/conftest.py`)

| Fixture | Scope | Description |
|---|---|---|
| `db_session` | function | SQLite in-memory session; creates all tables; auto-rollback after test |
| `fake_redis` | function | `FakeAsyncRedis` instance; injected via FastAPI dependency override |
| `async_client` | function | `httpx.AsyncClient` wrapping the FastAPI app with all overrides applied |
| `tenant_a` | function | Pre-seeded Tenant object (type: academic, slug: "tenant-a-test") |
| `tenant_b` | function | Pre-seeded Tenant object (type: academic, slug: "tenant-b-test") |
| `user_a` | function | Admin user belonging to `tenant_a` |
| `user_b` | function | Admin user belonging to `tenant_b` |

**Helper functions:**
```python
TEST_PASSWORD = "Test@1234"

async def get_token(client: AsyncClient, email: str, slug: str) -> str:
    """Login and return the access token string."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": TEST_PASSWORD, "tenant_slug": slug}
    )
    return resp.json()["access_token"]
```

---

## 5. Test Files

### `tests/test_tenant_isolation.py` — 7 tests

Verifies that data from Tenant A cannot be accessed by Tenant B.

| Test | Rule | Expected |
|---|---|---|
| Inventory scoped per tenant | TI-1 | User A cannot see Tenant B's inventory items |
| Menu scoped per tenant | TI-1 | User A cannot see Tenant B's menu items |
| Orders scoped per tenant | TI-1 | GET /orders/ returns empty for user with no orders in their tenant |
| Unauthenticated rejected | — | 401 without Authorization header |
| Customer blocked from inventory | Permissions matrix | 403 |
| Cross-tenant item returns 404 | TI-1 | GET /inventory/items/{b_item_id} with tenant A token → 404 |
| Cross-tenant access returns 404 | TI-2 | Token from tenant A, request for tenant B resource → 404 (JWT tenant_id filters it out) |

---

### `tests/test_inventory.py` — 10 tests

| Test | Rule | Expected |
|---|---|---|
| Consume decrements quantity | INV-1 | After order, item quantity reduced by recipe amount |
| Consume logs movement | INV-1 | A `consumption` movement record exists with quantity_before/quantity_after |
| Strict mode blocks order | INV-3 + OR-3 | `inventory_strict_mode=True` + insufficient stock → 400 |
| Lock NX prevents race | INV-2 | Concurrent consume requests don't double-decrement |
| Low-stock alert fires | INV-4 | When qty <= reorder_level, WebSocket LOW_STOCK event published |
| No alert above reorder | INV-4 | No alert when qty > reorder_level |
| Transfer central→outlet | INV-5 | Central qty decreases, outlet qty increases |
| Transfer 400 on insufficient | INV-5 | Transfer more than available → 400 |
| Adjust +delta | — | Positive adjustment increases quantity |
| Adjust -delta logs waste | — | Negative adjustment creates `waste` movement |

---

### `tests/test_otp.py` — 9 tests

| Test | Rule | Expected |
|---|---|---|
| Generate stores code in Redis | — | Key `otp:email_verification:{email}` exists after send |
| Generate resets attempt count | OTP-3 | Fresh OTP has attempts = 0 |
| Verify correct returns True | — | 200 OK |
| Verify deletes key (single-use) | OTP-1 | Key gone after successful verify |
| Verify again fails | OTP-1 | 400 "OTP expired or not found" |
| Wrong code returns False | — | 400 "Invalid code" |
| Wrong code keeps key | — | Key still exists (not single-use on failure) |
| Max attempts invalidates | OTP-2 | 5 wrong attempts → key deleted → 400 |
| Purpose namespace isolation | OTP-3 | email_verification code cannot be used for login OTP purpose |

---

### `tests/test_redis.py` — 12 tests

| Test | Expected |
|---|---|
| Cache miss: key not found | Returns None |
| Cache hit: after set | Returns stored value |
| Cache miss: different tenant | No cross-tenant cache leak |
| Invalidation clears tenant cache | Cache key gone after invalidate |
| Invalidation doesn't affect other tenant | Other tenant's cache unaffected |
| Key format: `cache:menu:{tenant_id}` | Correct key name used |
| JWT blacklist via logout | Token rejected after logout |
| Blacklist key in Redis | `blacklist:jti:{jti}` key exists in Redis after logout |
| Lock NX: first caller wins | Only one gets the lock |
| Lock key format: `lock:order:{table_id}` | Correct key name |
| Release clears lock key | Key gone after release |
| Two items lock independently | Lock on item A doesn't block item B |

---

### `tests/test_food_court_isolation.py` — 10 tests

| Test | Rule | Expected |
|---|---|---|
| Vendor admin blocked from /food-court/vendors | FC-1 | 403 |
| Vendor admin blocked from /food-court/analytics | FC-1 | 403 |
| FC admin sees all vendor active orders | FC-2 | Both vendor A and B orders in response |
| Server can deliver vendor order | FC-5 | 200, status=delivered |
| Server blocked on non-ready order | FC-5 | 400 |
| Vendor A cannot see Vendor B's orders | FC-7 | Order B not in Vendor A's order list |
| Vendor A gets 404 for Vendor B's order by ID | FC-7 | 403 or 404 |
| Vendor A menu scoped to own tenant | FC-7 | Vendor B items not in Vendor A's menu |
| FC admin cannot read vendor inventory | Permissions | 403 |
| Unified menu shows both vendors | FC-6 + FC-2 | Both vendor names and items present |

---

## 6. Running Tests

```bash
# Run all tests
docker compose exec backend pytest

# Run with verbose output
docker compose exec backend pytest -v

# Run with coverage report (HTML output in htmlcov/)
docker compose exec backend pytest --cov=app --cov-report=html

# Run one test file
docker compose exec backend pytest tests/test_inventory.py -v

# Run one specific test
docker compose exec backend pytest tests/test_otp.py::test_otp_max_attempts -v

# Run tests matching a keyword
docker compose exec backend pytest -k "isolation" -v
```

---

## 7. Writing New Tests

When implementing a new feature (per spec-first process):

1. **Write tests first** (before the implementation): define what the endpoint must do
2. Place tests in the appropriate test file (or create a new one for a new domain)
3. Use the existing fixtures — do not create new database connections or Redis instances
4. Every new business rule in `06-business-rules.md` must have a corresponding test
5. Test names must describe the behaviour: `test_customer_cannot_cancel_confirmed_order` (not `test_cancel_order_3`)
6. Every test must assert both the happy path AND at least one error path

---

## 8. Demo Credentials

These are seeded by `scripts/seed_demo.py`.

| Role | Email | Password | Slug |
|---|---|---|---|
| Platform Admin | platform@scms.io | Platform@1234 | (no slug) |
| Super Admin | brand@testythreat.com | Brand@1234 | testy-treat |
| Outlet Admin | gulshan@testythreat.com | Outlet@1234 | testy-treat-gulshan |
| Tenant Admin | admin@bracu.scms | Admin@1234 | bracu |
| Staff | staff1@bracu.scms | Staff@1234 | bracu |
| Cleaner | cleaner1@bracu.scms | Cleaner@1234 | bracu |
| Student | student1@g.bracu.ac.bd | Student@1234 | bracu |
| Food Court Admin | fcadmin@unimart.hall | FoodCourt@1234 | unimart-hall |
| Server | server1@unimart.hall | Server@1234 | unimart-hall |
| Vendor Admin A | admin@unimart-burger.com | Burger@1234 | unimart-burger |
| Vendor Admin B | admin@unimart-sushi.com | Sushi@1234 | unimart-sushi |

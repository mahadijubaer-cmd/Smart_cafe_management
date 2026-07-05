# System Architecture

**Last verified against code:** 2026-06-30

---

## Tech Stack

### Backend

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Language | Python | 3.12 | |
| Framework | FastAPI | 0.115.x | ASGI, async |
| ORM | SQLAlchemy | 2.0 async | `async_sessionmaker` |
| Database | PostgreSQL | 15 | Primary data store |
| Migrations | Alembic | 1.13.x | Forward-only in production |
| Cache / Pub-Sub | Redis | 7 | OTP, JWT blacklist, locks, WS pub/sub |
| Redis client | redis-py | 5.x | `aioredis`-compatible |
| Auth | python-jose | 3.3.x | JWT encode/decode (HS256) |
| Password hashing | passlib (pbkdf2_sha256) | 1.7.x | `CryptContext(schemes=["pbkdf2_sha256"])` |
| Rate limiting | slowapi | 0.1.x | Per-IP, Redis-backed |
| Email | fastapi-mail | 1.4.1 | SMTP; Mailtrap in dev |
| PDF generation | reportlab | 4.1.0 | Receipts + memos |
| QR codes | qrcode[pil] | 7.x | PNG generation |
| WebSocket | FastAPI native | — | Starlette WebSocket |
| Validation | Pydantic | v2 | Strict mode |

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js | 14 (App Router) |
| Language | TypeScript | 5.x |
| State | Zustand | Persisted to localStorage |
| HTTP client | Axios | JWT attached via interceptor |
| Forms | react-hook-form + zod | — |
| Notifications | react-hot-toast | — |
| Date handling | date-fns | — |
| CSV | papaparse | — |
| UI components | Custom Tailwind CSS | shadcn/ui is NOT installed |
| Drag-and-drop | @dnd-kit | ❌ Phase 16 — NOT YET INSTALLED |

---

## Repository Structure

```
Smart_cafe_management/
  specs/                        ← Source of truth (this folder)
  backend/
    app/
      core/
        config.py               ← Settings (env vars)
        database.py             ← SQLAlchemy async engine + session
        dependencies.py         ← FastAPI dependencies (auth, role checks)
        security.py             ← JWT encode/decode, password hash
        redis.py                ← Redis connection pool
        limiter.py              ← slowapi rate limiter
      middleware/
        tenant.py               ← TenantContextMiddleware
      models/
        models.py               ← Shared SQLAlchemy models
        user.py                 ← User, UserRole enum
        tenant.py               ← Tenant, TenantType, SubscriptionTier enums
        order.py                ← Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus
        menu.py                 ← MenuItem, MenuCategory, MenuItemRecipe
        table.py                ← TablesMap, TableStatus
        inventory.py            ← InventoryItem, PurchaseOrder, InventoryMovement, enums
      schemas/                  ← Pydantic request/response models (one file per domain)
      routers/                  ← FastAPI route handlers (one file per domain)
      services/                 ← Business logic (one file per domain)
      config/
        email.py                ← fastapi-mail ConnectionConfig
    alembic/                    ← Database migrations
    tests/                      ← pytest test suite
    scripts/                    ← seed_demo.py, seed_menu.py, etc.
  frontend/
    src/
      app/
        [tenant_slug]/          ← Tenant-scoped routes
          (auth)/               ← login, register
          (customer)/           ← menu, order, track, wallet, profile
          (staff)/              ← orders queue
          (cleaner)/            ← tables assignment
          (admin)/              ← dashboard, inventory, etc.
        (platform)/admin/       ← Platform admin pages
      components/               ← Shared React components
      lib/
        api.ts                  ← Axios client
        auth.ts                 ← JWT utilities
      store/
        useStore.ts             ← Zustand store
      types/
        index.ts                ← TypeScript type definitions
```

---

## Request Lifecycle

Every authenticated request to the backend passes through these layers in order:

```
Client
  │
  ▼
1. CORS Middleware          (CORSMiddleware — allows frontend origin)
  │
  ▼
2. TenantContextMiddleware  (reads Bearer JWT, populates request.state.tenant_ctx)
  │
  ▼
3. slowapi Rate Limiter     (per-IP; applied only on rate-limited routes)
  │
  ▼
4. FastAPI Router           (path matching)
  │
  ▼
5. get_current_user()       (FastAPI dependency — validates token, checks blacklist)
  │
  ▼
6. require_role(...)        (FastAPI dependency — checks role against allowed set)
  │
  ▼
7. Route Handler            (business logic, DB query, response)
  │
  ▼
8. Pydantic serialisation   (response_model validation and JSON serialisation)
```

---

## Three-Layer Tenant Isolation

### Layer 1 — Middleware (`backend/app/middleware/tenant.py`)

File: `TenantContextMiddleware`

- Reads `Authorization: Bearer <jwt>` header from every request
- Decodes JWT using `SECRET_KEY` (HS256) — **no database lookup**
- Extracts: `tenant_id`, `tenant_type`, `tenant_slug`, `outlet_id` from JWT claims
- Stores as `request.state.tenant_ctx: TenantContext | None`
- On failure (missing, expired, or invalid token): sets `tenant_ctx = None` (unauthenticated routes still work; auth-required routes return 401 via Layer 2)

There is **no `X-Tenant-Slug` header**. Tenant context comes exclusively from the JWT.

### Layer 2 — Dependency (`backend/app/core/dependencies.py`)

Function: `get_current_user()`

1. Reads `request.state.tenant_ctx` — returns 401 if None
2. Checks Redis: `EXISTS blacklist:jti:{jti}` — returns 401 if found ("Token has been revoked")
3. Loads `User` from database by `user_id` from JWT — returns 401 if not found
4. Checks `user.is_active` — returns 401 if False

No slug-vs-JWT cross-check. The JWT `tenant_id` is the authority.

### Layer 3 — Database Query

Every query on a tenant-scoped table MUST include:
```python
.where(Model.tenant_id == ctx.tenant_id)
```

Absence of this filter is a **critical security bug**. Cross-tenant data leakage via UUID guessing is impossible because every lookup is tenant-scoped at the query level.

---

## Role Terminology: Product Spec ↔ `UserRole` (RFC-008)

The platform's product spec describes admin tiers using business terms that don't map 1:1 onto
`UserRole` enum names. This table is the canonical cross-reference — consult it instead of guessing:

| Product spec term | `UserRole` value(s) | Scope |
|---|---|---|
| Franchise Admin | `super_admin` (also accepted: `tenant_admin`) | A whole `franchise_brand` tenant and all its `franchise_outlet` children (see `GET /analytics/outlets`, `POST /tenants/{id}/outlets`) |
| Tenant Admin / Shop Admin | `tenant_admin` / `outlet_admin` | A single outlet, independent restaurant, cafeteria, or food-court tenant |
| Global Admin | `platform_admin` | Cross-tenant, platform-wide (tenant CRUD, suspend/activate) |
| Consumer | `customer` (legacy: `student`) | End customer within a cafeteria tenant, or a guest (no account) on a restaurant tenant |
| Staff | `staff` / `server` | Floor operations (POS, order delivery) |
| Cleaner | `cleaner` | Cleaning task queue |

No new `UserRole` values were introduced for "Franchise Admin" — `super_admin` already carries this
meaning elsewhere in the codebase (brand-wide analytics). See RFC-008 for the decision record.

---

## Redis Key Namespace

| Key pattern | TTL | Purpose |
|---|---|---|
| `blacklist:jti:{jti}` | Remaining token lifetime | Invalidated (logged-out) JWT tokens |
| `otp:{purpose}:{email}` | 600 s | OTP code + attempt counter |
| `lock:order:{table_id}` | 30 s | Prevents double-booking a table (NX lock) |
| `lock:inv:{item_id}` | 10 s | Prevents concurrent inventory deduction (NX lock) |
| `cache:menu:{tenant_id}` | Until invalidated | Cached menu response |
| `ws:channel:{tenant_id}` | N/A (pub/sub) | WebSocket messages to all connections in a tenant |
| `ws:channel:{tenant_id}:{outlet_id}` | N/A (pub/sub) | WebSocket messages to one outlet's connections |

---

## WebSocket Architecture

File: `backend/app/routers/websocket.py` + `backend/app/services/ws_pubsub.py`

```
Publisher (order router, inventory service, etc.)
  │
  │  publish_event(tenant_id, event_dict, outlet_id=None)
  ▼
Redis pub/sub
  Channel: ws:channel:{tenant_id}
  Channel: ws:channel:{tenant_id}:{outlet_id}  (if outlet scoped)
  │
  ▼
subscribe_and_forward()            (asyncio task per WS connection)
  │
  ▼
ConnectionManager.broadcast_to_tenant()
  │
  ▼
WebSocket clients                  (browsers / frontend)
```

**Connection URL:** `ws://host/ws/{user_id}?token={jwt}`

Server validates:
1. JWT signature and expiry
2. `user_id` in path matches JWT `sub`
3. Not in Redis blacklist

After validation, connection is registered in `ConnectionManager` with `(tenant_id, outlet_id)` from JWT claims.

**Message format:** Flat JSON with a `type` field. No nested `{event, data}` wrapper.

```json
{ "type": "ORDER_PLACED", "order_id": "...", "table_id": 5, "total_amount": "240.00" }
```

---

## API Conventions

**Base URL:** `/api/v1`

**Auth header (all authenticated endpoints):**
```
Authorization: Bearer <access_token>
```

**Standard error response:**
```json
{ "detail": "<human-readable error message>" }
```

**HTTP status codes:**

| Code | Meaning |
|---|---|
| 200 | Success with body |
| 201 | Resource created |
| 204 | Success, no body (logout) |
| 400 | Business rule violation |
| 401 | Not authenticated or token revoked |
| 403 | Wrong role or tenant |
| 404 | Not found (or belongs to another tenant) |
| 409 | Conflict (duplicate or lock contention) |
| 422 | Pydantic validation failure |
| 429 | Rate limit exceeded |

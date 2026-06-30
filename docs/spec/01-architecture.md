# Spec 01 — Architecture

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. Technology Stack

### Backend

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Language | Python | 3.11+ | Primary language |
| Web Framework | FastAPI | 0.110+ | REST API and WebSocket |
| ORM | SQLAlchemy | 2.0 (async) | Models and queries |
| DB Driver | asyncpg | latest | Async PostgreSQL driver |
| Database | PostgreSQL | 15+ | Primary data store |
| Cache | Redis | 7.x | OTP, JWT blacklist, locks, response cache |
| Password Hashing | passlib (pbkdf2_sha256) | 1.7.4 | Secure password storage |
| JWT | python-jose | 3.3.0 | Token creation and verification |
| PDF | reportlab | 4.1.0 | Receipts and memos |
| QR Codes | qrcode[pil] | latest | Table and order QR images |
| Email | fastapi-mail | 1.4.1 | OTP emails |
| Migrations | Alembic | latest | Schema migrations |
| Server | Uvicorn | latest | ASGI server |
| Rate Limiting | slowapi | latest | Per-IP rate limiting |

### Frontend

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Language | TypeScript | 5.x | Primary language |
| Framework | Next.js | 14 (App Router) | SSR/CSR hybrid |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| Components | Custom (Tailwind CSS) | — | No external UI kit; components hand-crafted with Tailwind |
| State | Zustand | latest | Global auth, cart, and tenant state |
| Forms | react-hook-form + zod | latest | Form handling and validation |
| HTTP | axios | latest | API requests with JWT |
| JWT parsing | jwt-decode | latest | Read claims client-side |
| Icons | Lucide React | latest | Icon set |
| Charts | Recharts | latest | Analytics charts |
| Toasts | react-hot-toast | latest | User notifications |
| Date utils | date-fns | latest | Date formatting |
| CSV | papaparse | latest | CSV import/export |
| Drag & Drop | @dnd-kit/core | Phase 16 | Floor plan editor — NOT YET INSTALLED |

---

## 2. Multi-Tenancy Model

SCMS uses **row-level multi-tenancy**. Every table storing tenant-specific data has a `tenant_id UUID NOT NULL` column. There is no separate schema or database per tenant.

**Isolation is enforced at three layers — all three must hold simultaneously:**

### Layer 1 — Middleware (`TenantContextMiddleware`)

File: `backend/app/middleware/tenant.py`

```
Every incoming request:
  1. Read Authorization: Bearer <jwt> header
  2. Decode JWT (no signature re-check here — that happens in get_current_user)
  3. Extract tenant_id, tenant_type, tenant_slug, outlet_id from JWT claims
  4. Store TenantContext(tenant_id, tenant_type, tenant_slug, outlet_id) in request.state.tenant_ctx
  5. If no Bearer header or JWT decode fails: set tenant_ctx = None
     (protected routes that Depend on get_tenant_context() will raise 401)
```

**Note:** There is NO `X-Tenant-Slug` header mechanism. Tenant context is derived entirely from the JWT claims. Unauthenticated or public endpoints have `tenant_ctx = None` in request state.

### Layer 2 — JWT Validation (`get_current_user`)

File: `backend/app/core/dependencies.py`

```
Every authenticated endpoint:
  1. Read Bearer token from Authorization header (via OAuth2PasswordBearer)
  2. Decode JWT via AuthService.decode_token() → extract sub (user_id), jti, tenant_id
  3. Check Redis blacklist: if blacklist:jti:{jti} exists → 401 (logged-out token)
  4. Load User from DB by user_id
  5. Assert user.is_active = TRUE → 401 if deactivated
  6. Return User object
```

**Note:** There is no tenant cross-check assertion between JWT claims and a slug header in the current implementation. Tenant isolation is enforced entirely at Layer 3 (DB queries).

### Layer 3 — Database Queries

Every query on a tenant-scoped table MUST filter by tenant:

```python
# CORRECT — always required
await db.execute(
    select(MenuItem).where(
        MenuItem.tenant_id == ctx.tenant_id,  # ← this line is mandatory
        MenuItem.is_available.is_(True)
    )
)

# WRONG — missing tenant filter, will leak cross-tenant data
await db.execute(select(MenuItem).where(MenuItem.is_available.is_(True)))
```

Tests in `test_tenant_isolation.py` verify this cannot be bypassed.

---

## 3. Request Lifecycle

```
Browser / App
    │
    ▼ HTTP Request
    │  Headers: Authorization: Bearer <jwt>
    │           Content-Type: application/json
    ▼
CORS Middleware
    │ (allows preflight OPTIONS from CORS_ORIGINS)
    ▼
TenantContextMiddleware
    │ Reads X-Tenant-Slug → resolves tenant_id from DB / Redis cache
    │ Stores ctx in request.state.tenant_ctx
    ▼
slowapi Rate Limiter
    │ Per-IP limit on sensitive endpoints (OTP send, login)
    ▼
FastAPI Router
    │ Dependency injection chain:
    │   get_db()              → yields AsyncSession
    │   get_tenant_context()  → reads request.state.tenant_ctx
    │   get_current_user()    → decodes JWT, cross-checks tenant, checks blacklist
    │   require_role(...)     → checks user.role in allowed list
    ▼
Handler Function
    │ All DB queries include .where(Model.tenant_id == ctx.tenant_id)
    ▼
Response
```

---

## 4. Directory Structure

```
Smart_cafe_management/
├── docs/                            # ← YOU ARE HERE (spec source of truth)
│   ├── README.md
│   ├── SPEC_FIRST.md
│   ├── spec/                        # Domain specifications
│   ├── adr/                         # Architecture Decision Records
│   └── rfcs/                        # Feature proposals
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py            # Settings (pydantic BaseSettings)
│   │   │   ├── database.py          # Async engine + session factory
│   │   │   ├── dependencies.py      # FastAPI deps: get_db, get_current_user, ctx
│   │   │   ├── redis.py             # Redis client lifecycle
│   │   │   ├── security.py          # hash_password, verify_password, create_token
│   │   │   └── limiter.py           # slowapi singleton
│   │   ├── middleware/
│   │   │   └── tenant.py            # TenantContextMiddleware
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   ├── routers/                 # FastAPI route handlers
│   │   ├── schemas/                 # Pydantic request/response models
│   │   └── main.py                  # FastAPI app creation + router registration
│   ├── tests/
│   ├── scripts/
│   │   ├── seed_platform.py         # Initial tenant data
│   │   └── seed_demo.py             # Demo credentials (Section 23.3)
│   ├── alembic/                     # Schema migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/                     # Next.js App Router pages
│       ├── components/              # Reusable UI components
│       ├── hooks/                   # Custom React hooks
│       ├── lib/                     # API client, auth utilities
│       ├── store/                   # Zustand global state
│       └── types/                   # TypeScript interfaces
├── docker-compose.yml               # Development
├── docker-compose.prod.yml          # Production
├── .env.example                     # Template for environment variables
├── CHANGELOG.md                     # Version history
└── CONTRIBUTING.md                  # Contribution guidelines
```

---

## 5. Redis Key Namespace

Every Redis key used in the system follows a defined pattern. Do not create Redis keys outside this table without updating this spec.

| Key Pattern | TTL | Purpose |
|---|---|---|
| `otp:{purpose}:{email}` | 600s | OTP code + attempt count |
| `cache:tenant:{slug}` | 300s | Tenant lookup cache (avoids DB per request) |
| `cache:menu:{tenant_id}` | 120s | Menu items cache (invalidated on item change) |
| `blacklist:jti:{jti}` | Token remaining TTL | Logout blacklist |
| `lock:order:{table_id}` | 30s | Prevents double-booking a table |
| `lock:inv:{item_id}` | 10s | Prevents race on stock decrement |

---

## 6. Food Court Family Scope

> **ADR:** See [ADR-004](../adr/ADR-004-food-court-family-scope.md)

A `food_court` parent tenant can see data belonging to its `food_court_vendor` child tenants. This is called **family scope** and is implemented in one function:

```python
# backend/app/core/dependencies.py
async def accessible_tenant_ids(ctx: TenantContext, db: AsyncSession) -> set[UUID]:
    if ctx.tenant_type == TenantType.food_court:
        result = await db.execute(
            select(Tenant.tenant_id).where(
                Tenant.parent_tenant_id == ctx.tenant_id,
                Tenant.tenant_type == TenantType.food_court_vendor,
                Tenant.is_active.is_(True),
            )
        )
        return {ctx.tenant_id} | set(result.scalars().all())
    return {ctx.tenant_id}
```

**Scope of use:** This function is ONLY used inside `backend/app/routers/food_court.py`.  
All other routers use strict single-tenant isolation: `.where(Model.tenant_id == ctx.tenant_id)`.

---

## 7. WebSocket Architecture

File: `backend/app/routers/websocket.py`

```
Connection URL: ws://host/ws/{user_id}?token={jwt}

On connect:
  1. Decode JWT via AuthService — close WS_1008 if invalid
  2. Assert token_data.user_id == path user_id — close if mismatch
  3. Load User from DB, assert is_active — close if not
  4. Register connection in ConnectionManager (keyed by user_id + tenant_id)
  5. Start asyncio Task: subscribe_and_forward(tenant_id, manager, outlet_id)
     → subscribes to Redis channel ws:channel:{tenant_id}
     → forwards any published messages to all local WS connections for that tenant

On disconnect:
  1. Cancel the subscribe_and_forward task (triggers Redis unsubscribe + cleanup)
  2. Remove from ConnectionManager

Message format (client → server):
  { "type": "PING" }  → server responds { "type": "PONG" }

Message format (server → client):
  Flat JSON with "type" field at top level — no wrapper object:
  { "type": "EVENT_TYPE", "field1": "...", "field2": "..." }
```

**Redis Pub/Sub channels:**
- `ws:channel:{tenant_id}` — all events for a tenant
- `ws:channel:{tenant_id}:{outlet_id}` — outlet-scoped events (franchise)

Personal events (ORDER_CONFIRMED, ORDER_READY etc.) carry `"target_user_id"` in the payload; `ConnectionManager.broadcast_to_tenant()` routes them to only that user's connection.

All WebSocket event types and payloads are defined in [05-websocket.md](05-websocket.md).

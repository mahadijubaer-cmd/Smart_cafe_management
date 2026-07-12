# SCMS Specification — Master Index

**Project:** Smart Cafe Management System v3.1  
**Type:** Multi-tenant SaaS (FastAPI + PostgreSQL + Redis + Next.js 14)  
**Last updated:** 2026-07-11

> **This folder is the heart of the project.**  
> Every piece of code in this repository must match what is written here.  
> **Spec changes before code changes. Always. No exceptions.**

---

## The One Rule

```
Spec → Code → Tests
```

Before changing any behaviour: find the spec file that owns it, update the spec, then update the code, then update the tests. Never the other way around.

---

## Navigation

### System-Wide

| File | Contents |
|---|---|
| [system/overview.md](system/overview.md) | What SCMS is; tenant types; actors; feature list; subscription tiers |
| [system/architecture.md](system/architecture.md) | Tech stack; request lifecycle; 3-layer tenant isolation; Redis key map; WebSocket pub/sub |
| [system/data-model.md](system/data-model.md) | Every database table — columns, types, constraints, indexes, relationships |
| [system/security.md](system/security.md) | JWT structure; password hashing; token blacklist; CORS; rate limiting; RBAC role groups; secrets |
| [system/segments.md](system/segments.md) | ✅ [Phase 22 — Implemented 2026-07-05] Cafeteria vs restaurant segment derivation; capability matrix (RFC-007) |

### Modules (one file per domain — the authoritative source for each feature)

| File | What it covers |
|---|---|
| [modules/auth.md](modules/auth.md) | `/auth/*`, `/otp/*` endpoints · registration · login · logout · JWT · OTP · password policy · permission matrix |
| [modules/menu.md](modules/menu.md) | `/menu/*` endpoints · categories · items · caching |
| [modules/orders.md](modules/orders.md) | `/orders/*` endpoints · order status machine · business rules OR-1→OR-10 · reward points RWD-1→RWD-4 |
| [modules/tables.md](modules/tables.md) | `/tables/*` endpoints · table status · zones · floor plan (Phase 16) |
| [modules/cleaners.md](modules/cleaners.md) | `/cleaners/*` endpoints · assignment lifecycle · WebSocket events CLEAN_ASSIGNED · TABLE_CLEAN · MEAL_DONE |
| [modules/inventory.md](modules/inventory.md) | `/inventory/*` endpoints · stock tracking · POs · transfers · movement types · business rules INV-1→INV-7 |
| [modules/payments.md](modules/payments.md) | `/payments/*` endpoints · wallet · topup · payment methods · wallet rules WAL-1→WAL-3 |
| [modules/analytics.md](modules/analytics.md) | `/analytics/*` endpoints · exact response shapes · query params |
| [modules/qr-pdf.md](modules/qr-pdf.md) | `/qr/*` · `/receipts/*` · `/memo/*` endpoints · PDF generation · receipt numbering |
| [modules/websocket.md](modules/websocket.md) | WS connection URL · pub/sub architecture · all 12 event types · exact message formats · PING/PONG |
| [modules/food-court.md](modules/food-court.md) | `/food-court/*` endpoints · isolation rules FC-1→FC-7 · multi-vendor architecture |
| [modules/tenants.md](modules/tenants.md) | `/tenants/*` endpoints · tenant types · hierarchy · subscription tiers · domain rules |
| [modules/users.md](modules/users.md) | `/users/*` endpoints · user roles · activation · Phase 21 invite flow |
| [modules/public-surface.md](modules/public-surface.md) | ✅ [Phase 22 — Implemented 2026-07-05] `/public/*` endpoints · guest QR ordering · kiosk/signage · rate limiting (RFC-007) |
| [modules/platform.md](modules/platform.md) | ✅ Implemented `/platform/*` endpoints · audit log · platform-wide analytics · impersonation · subscription tier limits (RFC-009) |
| [modules/notifications.md](modules/notifications.md) | `/notifications/*` endpoints · user notification inbox · unread counts |

### Frontend

| File | Contents |
|---|---|
| [frontend/overview.md](frontend/overview.md) | Tech stack · routing tree · Zustand store · API client · TypeScript types |
| [frontend/workflows.md](frontend/workflows.md) | End-to-end user journeys WF-1 through WF-9 |

### Operations

| File | Contents |
|---|---|
| [operations/deployment.md](operations/deployment.md) | Environment variables · Docker setup · Alembic · seed scripts · production checklist |
| [operations/testing.md](operations/testing.md) | Test stack · conftest fixtures · test files · how to run · how to write new tests |
| [operations/roadmap.md](operations/roadmap.md) | Phases 14–24 · missing features · acceptance criteria per phase |

### Decisions

| File | Contents |
|---|---|
| [decisions/adrs/](decisions/adrs/) | Architecture Decision Records — why major choices were made |
| [decisions/rfcs/](decisions/rfcs/) | RFC proposals — specifications for planned features |

---

## File Ownership Map

When you change a file in the codebase, you MUST update the corresponding spec first:

| Code file / directory | Spec file to update |
|---|---|
| `backend/app/models/*.py` | `specs/system/data-model.md` |
| `backend/alembic/versions/*.py` | `specs/system/data-model.md` |
| `backend/app/middleware/tenant.py` | `specs/system/architecture.md` + `specs/system/security.md` |
| `backend/app/core/security.py` | `specs/system/security.md` |
| `backend/app/core/config.py` | `specs/operations/deployment.md` |
| `backend/app/core/dependencies.py` | `specs/system/security.md` + `specs/modules/auth.md` |
| `backend/app/routers/auth.py` | `specs/modules/auth.md` |
| `backend/app/routers/otp.py` | `specs/modules/auth.md` |
| `backend/app/routers/menu.py` | `specs/modules/menu.md` |
| `backend/app/routers/orders.py` | `specs/modules/orders.md` |
| `backend/app/routers/tables.py` | `specs/modules/tables.md` |
| `backend/app/routers/cleaners.py` | `specs/modules/cleaners.md` |
| `backend/app/routers/inventory.py` | `specs/modules/inventory.md` |
| `backend/app/routers/payments.py` | `specs/modules/payments.md` |
| `backend/app/routers/analytics.py` | `specs/modules/analytics.md` |
| `backend/app/routers/qr.py` | `specs/modules/qr-pdf.md` |
| `backend/app/routers/receipts.py` | `specs/modules/qr-pdf.md` |
| `backend/app/routers/memo.py` | `specs/modules/qr-pdf.md` |
| `backend/app/routers/websocket.py` | `specs/modules/websocket.md` |
| `backend/app/routers/food_court.py` | `specs/modules/food-court.md` |
| `backend/app/routers/tenants.py` | `specs/modules/tenants.md` |
| `backend/app/routers/platform.py` | `specs/modules/platform.md` |
| `backend/app/core/tier_limits.py` | `specs/modules/platform.md` |
| `backend/app/services/audit_service.py` | `specs/modules/platform.md` |
| `backend/app/routers/public.py` | `specs/modules/public-surface.md` |
| `backend/app/routers/notifications.py` | `specs/modules/notifications.md` |
| `backend/app/routers/invitations.py` | `specs/modules/users.md` |
| `backend/app/core/segments.py` | `specs/system/segments.md` |
| `backend/app/schemas/*.py` | The module spec file matching the schema's domain |
| `backend/app/services/*.py` | The module spec file matching the service's domain |
| `frontend/src/app/**` | `specs/frontend/overview.md` |
| `frontend/src/components/**` | `specs/frontend/overview.md` |
| `frontend/src/store/**` | `specs/frontend/overview.md` |
| `frontend/src/types/**` | `specs/frontend/overview.md` |
| `frontend/src/lib/**` | `specs/frontend/overview.md` |
| `docker-compose*.yml` | `specs/operations/deployment.md` |
| `.env.example` | `specs/operations/deployment.md` + `specs/system/security.md` |
| `backend/tests/**` | `specs/operations/testing.md` |

---

## Pre-Commit Checklist

```
[ ] Did I update the spec file BEFORE changing the code?
[ ] If this is a new feature: is there an accepted RFC in decisions/rfcs/?
[ ] If this is an architectural decision: is there an ADR in decisions/adrs/?
[ ] Did I update CHANGELOG.md?
[ ] Do my tests cover the spec'd behaviour (not just implementation internals)?
[ ] Does every test name describe the behaviour it asserts?
```

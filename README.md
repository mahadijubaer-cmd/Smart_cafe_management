# Smart Cafe Management System (SCMS)

**Multi-tenant SaaS platform** for cafeterias, restaurants, and food courts.  
Final Year Thesis — CSE400, BRAC University | Mahadi Jubaer (22301162)

---

## Documentation First

This project follows **spec-first development**. Before reading any code, read the specification.

> **`specs/` is the single, authoritative source of truth.** All spec content — module specs, ADRs, RFCs, workflows — lives under `specs/`. There is no other spec directory.

| Start Here | |
|---|---|
| [specs/README.md](specs/README.md) | Master spec index — start here |
| [specs/WORKFLOW.md](specs/WORKFLOW.md) | Spec-first workflow guide — read before making any change |

---

## Quick Navigation

| I want to know... | Read this |
|---|---|
| What the system does | [specs/system/overview.md](specs/system/overview.md) |
| How multi-tenancy and request lifecycle work | [specs/system/architecture.md](specs/system/architecture.md) |
| The database schema | [specs/system/data-model.md](specs/system/data-model.md) |
| How auth, JWT, and roles work | [specs/modules/auth.md](specs/modules/auth.md) |
| What all endpoints exist | [specs/README.md](specs/README.md) → Modules section |
| What WebSocket events exist | [specs/modules/websocket.md](specs/modules/websocket.md) |
| Business rules per domain | Each `specs/modules/*.md` file |
| Frontend routing and types | [specs/frontend/overview.md](specs/frontend/overview.md) |
| End-to-end user journeys | [specs/frontend/workflows.md](specs/frontend/workflows.md) |
| How to run the system | [specs/operations/deployment.md](specs/operations/deployment.md) |
| How to run the tests | [specs/operations/testing.md](specs/operations/testing.md) |
| What's planned next | [specs/operations/roadmap.md](specs/operations/roadmap.md) |
| Why architectural decisions were made | [specs/decisions/adrs/](specs/decisions/adrs/) |
| What features are proposed | [specs/decisions/rfcs/](specs/decisions/rfcs/) |

---

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env

# 2. Start all services (postgres, redis, backend, frontend)
docker compose up -d

# 3. Apply migrations + seed demo data
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.seed_demo

# 4. Run tests
docker compose exec backend pytest -v

# 5. Access the system
#    API docs:   http://localhost:8000/docs
#    Frontend:   http://localhost:3000
#    Health:     http://localhost:8000/api/v1/health
```

Full deployment instructions: [specs/operations/deployment.md](specs/operations/deployment.md)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 15 |
| Cache | Redis 7 (OTP, JWT blacklist, locks, response cache) |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand |
| Auth | JWT (python-jose), OTP via email, passlib pbkdf2_sha256 |
| Real-time | WebSocket (FastAPI native) |
| PDF | reportlab 4.1.0 (receipts + memos) |
| QR Codes | qrcode[pil] |
| Containers | Docker + Docker Compose |

---

## Demo Credentials

Seeded by `scripts/seed_demo.py`. Full table in [specs/operations/testing.md](specs/operations/testing.md).

| Role | Email | Password | Slug |
|---|---|---|---|
| Tenant Admin | admin@bracu.scms | Admin@1234 | bracu |
| Student | student1@g.bracu.ac.bd | Student@1234 | bracu |
| Staff | staff1@bracu.scms | Staff@1234 | bracu |
| Food Court Admin | fcadmin@unimart.hall | FoodCourt@1234 | unimart-hall |
| Platform Admin | platform@scms.io | Platform@1234 | — |

---

## Project Status

**Phases 1–13 complete.** Backend fully built (15 routers, 50+ endpoints). Frontend core complete.

See [specs/operations/roadmap.md](specs/operations/roadmap.md) for the remaining phases (14–21).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — spec-first workflow required.  
See [CHANGELOG.md](CHANGELOG.md) for version history.

# Contributing to SCMS

## Spec-First Development

This project follows a **spec-first** workflow. **`specs/` is the authoritative source of truth.**  
Code must match the spec. **Write the spec before writing the code.**

> `docs/` is legacy — all new spec work goes in `specs/`.

**Full workflow guide:** [`specs/WORKFLOW.md`](specs/WORKFLOW.md)  
**Master index:** [`specs/README.md`](specs/README.md)

---

## Quick Start

```bash
# 1. Clone + set up environment
cp .env.example .env
# Edit .env with your values (see docs/spec/09-deployment.md)

# 2. Start services
docker compose up -d

# 3. Apply migrations and seed
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.seed_demo

# 4. Run tests
docker compose exec backend pytest -v

# 5. Access
#    API docs: http://localhost:8000/docs
#    App:      http://localhost:3000
```

---

## Before Making Any Change

1. **Identify the spec file** for the area you're changing (see `specs/README.md` → File Ownership Map)
2. **Update the spec file first**
3. If it's a new feature: create an RFC in `specs/decisions/rfcs/` using `specs/decisions/rfcs/RFC-TEMPLATE.md`
4. If it's an architectural decision: create an ADR in `specs/decisions/adrs/` using `specs/decisions/adrs/ADR-TEMPLATE.md`
5. Then write the code
6. Update `CHANGELOG.md` under `[Unreleased]`

---

## Code Standards

### Backend (Python / FastAPI)
- All async functions use `async def`
- All DB queries include `.where(Model.tenant_id == ctx.tenant_id)` — no exceptions
- Pydantic schemas live in `app/schemas/`, NOT defined inline in routers (except small one-off inline schemas)
- No bare `except:` clauses — catch specific exceptions
- New endpoints get at least one happy-path test and one error-path test

### Frontend (TypeScript / Next.js)
- All pages in `src/app/[tenant_slug]/` are route-protected via their layout
- All API calls go through the axios client in `src/lib/api.ts` — no raw `fetch()`
- New components go in `src/components/{domain}/`
- Write custom Tailwind components — shadcn/ui is NOT installed in this project
- No hardcoded colors — use `bg-primary` / `text-primary` Tailwind classes

### Database
- Every schema change requires an Alembic migration
- Migrations are forward-only (no destructive down migrations in production)
- Update `specs/system/data-model.md` before writing the migration

### Tests
- Test file names match their domain: `test_inventory.py` for inventory, `test_otp.py` for OTP
- Test function names describe behaviour: `test_customer_cannot_cancel_confirmed_order`
- Use the fixtures from `conftest.py` — do not create separate database connections

---

## Documentation Index

| Document | Purpose |
|---|---|
| `specs/README.md` | Master spec index + file ownership map (authoritative) |
| `specs/WORKFLOW.md` | Workflow guide (read first) |
| `specs/system/` | Architecture, data model, security |
| `specs/modules/` | One file per domain — endpoints, schemas, business rules |
| `specs/frontend/` | Routing tree, Zustand store, TypeScript types, user journeys |
| `specs/operations/` | Deployment, testing, roadmap |
| `specs/decisions/adrs/` | Why architectural decisions were made |
| `specs/decisions/rfcs/` | Proposed and accepted feature specs |
| `CHANGELOG.md` | Version history |
| `CONTRIBUTING.md` | This file |
| `docs/` | Legacy spec files — superseded by `specs/`, kept for reference |

# Spec-First Development Workflow

## What "Spec-First" Means

In this project, **the specification is the source of truth** — not the code.

The spec describes what the system *should* do. The code is an implementation of that description.  
When the two disagree, the spec wins. Either fix the code to match the spec, or propose a spec change first.

This approach is standard in professional engineering teams (Stripe, GitHub, Shopify, Google) because it:
- Forces clear thinking before writing code
- Gives new contributors a complete mental model before touching source files
- Creates a permanent record of *why* things work the way they do
- Catches design flaws at the design stage (cheap) rather than after deployment (expensive)

---

## The Golden Rule

> **Never write or change code that isn't described in a spec document.**

If you want to add a feature, change an API, modify a business rule, or alter the database schema:  
**write the spec change first, get it reviewed, then implement it.**

---

## Workflow for Every Change

### 1. Identify What Type of Change It Is

| Change Type | Document to Write/Update |
|---|---|
| New feature or page | Create an RFC in `docs/rfcs/` |
| Architectural decision | Create an ADR in `docs/adr/` |
| API endpoint change | Update `docs/spec/04-api-reference.md` |
| Database schema change | Update `docs/spec/02-data-model.md` |
| Business rule change | Update `docs/spec/06-business-rules.md` |
| New frontend page or component | Update `docs/spec/07-frontend.md` |
| New user workflow | Update `docs/spec/08-workflows.md` |
| Auth/role/permission change | Update `docs/spec/03-auth.md` |
| WebSocket event change | Update `docs/spec/05-websocket.md` |
| Deployment/env change | Update `docs/spec/09-deployment.md` |
| New test or test strategy | Update `docs/spec/10-testing.md` |

### 2. Write the Spec First

For a **small change** (e.g., adding a query param to an existing endpoint):
- Edit the relevant spec file directly
- Mark the change with a comment: `<!-- Added: YYYY-MM-DD -->` at the end of the changed section

For a **new feature** (anything that adds a new page, endpoint group, or major behaviour):
1. Create an RFC using the template at `docs/rfcs/RFC-TEMPLATE.md`
2. Fill in all sections (motivation, design, API changes, DB changes, open questions)
3. Review it yourself: is it consistent with existing spec? Does it conflict with any ADR?
4. Mark it as `Status: Accepted`
5. Then implement

For a **major architectural change** (changes how the whole system works):
1. Create an ADR using the template at `docs/adr/ADR-TEMPLATE.md`
2. This records the decision permanently — even if it's later reversed, the ADR stays

### 3. Implement the Code

Only after the spec document is written and the design makes sense:
- Write the backend code (router, schema, model, migration)
- Write the frontend code (page, component, hook)
- Write tests that validate the specified behaviour

### 4. Update CHANGELOG

After every change, add an entry to `CHANGELOG.md` under `[Unreleased]`.

Format:
```
### Added
- Description of what was added and why

### Changed
- Description of what changed

### Fixed
- Description of what was fixed
```

---

## RFC Process

An RFC (Request for Comments) is a design document written before implementation.

**When to write an RFC:**
- New page or major UI flow
- New API endpoint group
- Change to an existing system that affects multiple files
- Any feature that needs to be explained to another developer before they understand the code

**RFC lifecycle:**

```
Draft → Proposed → Accepted → Implemented → Superseded/Withdrawn
```

- `Draft` — Being written, not ready for review
- `Proposed` — Ready for review; no implementation yet
- `Accepted` — Reviewed and approved; implementation may begin
- `Implemented` — Code exists and matches the RFC
- `Superseded` — Replaced by a newer RFC (link to replacement)
- `Withdrawn` — Decided not to implement

**RFC file naming:** `RFC-XXX-short-kebab-description.md` (e.g., `RFC-003-floor-plan-editor.md`)

---

## ADR Process

An ADR (Architecture Decision Record) records a significant architectural decision: what was chosen, what was rejected, and why. ADRs are **permanent** — even if the decision is later reversed, the ADR stays and a new one is written for the reversal.

**When to write an ADR:**
- Technology choice (why SQLAlchemy over tortoise-orm?)
- Security approach (why JWTs instead of sessions?)
- Data architecture (why row-level isolation instead of schema-per-tenant?)
- Cross-cutting pattern (why OTP in Redis instead of DB?)

**ADR statuses:** `Proposed` → `Accepted` → `Superseded` / `Deprecated`

**ADR file naming:** `ADR-XXX-short-kebab-description.md`

---

## File Ownership Map

When you change a file in the codebase, you MUST also update the corresponding spec:

| Code File / Directory | Spec File to Update |
|---|---|
| `backend/app/models/*.py` | `docs/spec/02-data-model.md` |
| `backend/app/routers/auth.py` | `docs/spec/03-auth.md` + `docs/spec/04-api-reference.md` |
| `backend/app/routers/*.py` | `docs/spec/04-api-reference.md` |
| `backend/app/schemas/*.py` | `docs/spec/12-schemas.md` + `docs/spec/04-api-reference.md` |
| `backend/app/routers/websocket.py` | `docs/spec/05-websocket.md` |
| `backend/app/middleware/tenant.py` | `docs/spec/01-architecture.md` + `docs/spec/13-security.md` |
| `backend/app/core/dependencies.py` | `docs/spec/01-architecture.md` + `docs/spec/03-auth.md` + `docs/spec/13-security.md` |
| `backend/alembic/versions/*.py` | `docs/spec/02-data-model.md` |
| `frontend/src/app/**` | `docs/spec/07-frontend.md` |
| `frontend/src/components/**` | `docs/spec/07-frontend.md` |
| `frontend/src/store/**` | `docs/spec/07-frontend.md` |
| `frontend/src/types/**` | `docs/spec/12-schemas.md` + `docs/spec/07-frontend.md` |
| `docker-compose*.yml` | `docs/spec/09-deployment.md` |
| `.env.example` | `docs/spec/09-deployment.md` + `docs/spec/13-security.md` |
| `backend/tests/**` | `docs/spec/10-testing.md` |

---

## Checklist Before Every Commit

```
[ ] Have I written or updated the spec document for this change?
[ ] If this is a new feature, is there an accepted RFC?
[ ] If this is an architectural decision, is there an ADR?
[ ] Have I updated CHANGELOG.md?
[ ] Do my tests cover the spec'd behaviour (not just implementation details)?
[ ] Does the code match the spec (no undocumented behaviours)?
```

---

## Quick Reference: Where Things Are Specced

| "I want to know..." | "Read this file" |
|---|---|
| What tenants exist and their types | `spec/00-overview.md` → Tenant Types |
| What roles exist and what they can do | `spec/03-auth.md` → Roles & Permissions Matrix |
| What an endpoint returns | `spec/04-api-reference.md` → find the endpoint |
| What fields/types/validators a schema has | `spec/12-schemas.md` → find the schema |
| What database columns exist | `spec/02-data-model.md` → find the table |
| Why a specific design was chosen | `adr/` → find the relevant ADR |
| What features are planned | `spec/11-roadmap.md` and `rfcs/` |
| How a user does something end-to-end | `spec/08-workflows.md` |
| How to run the system | `spec/09-deployment.md` |
| How to run tests | `spec/10-testing.md` |
| How auth/CORS/rate limiting works | `spec/13-security.md` |

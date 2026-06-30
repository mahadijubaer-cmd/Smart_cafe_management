# SCMS Documentation Index

This directory is the **single source of truth** for the Smart Cafe Management System.  
All code in this repository must conform to the specifications in this directory.  
**Spec changes come before code changes. Always.**

---

## How to Navigate

| Document | Purpose |
|---|---|
| [SPEC_FIRST.md](SPEC_FIRST.md) | **Start here.** The workflow every contributor must follow |
| [spec/00-overview.md](spec/00-overview.md) | System purpose, tenant model, actor definitions |
| [spec/01-architecture.md](spec/01-architecture.md) | Multi-tenancy model, request lifecycle, Redis usage |
| [spec/02-data-model.md](spec/02-data-model.md) | Full database schema — all tables, columns, types, relations |
| [spec/03-auth.md](spec/03-auth.md) | Authentication, JWT structure, OTP system, roles |
| [spec/04-api-reference.md](spec/04-api-reference.md) | Every endpoint — method, auth, request/response, errors |
| [spec/05-websocket.md](spec/05-websocket.md) | WebSocket connection, all event types, payloads |
| [spec/06-business-rules.md](spec/06-business-rules.md) | Order rules, inventory rules, food court isolation rules |
| [spec/07-frontend.md](spec/07-frontend.md) | Routing tree, state management, components, route protection |
| [spec/08-workflows.md](spec/08-workflows.md) | Step-by-step user workflows (customer, staff, admin, etc.) |
| [spec/09-deployment.md](spec/09-deployment.md) | Environment variables, Docker, deployment steps |
| [spec/10-testing.md](spec/10-testing.md) | Test strategy, fixtures, test file descriptions |
| [spec/11-roadmap.md](spec/11-roadmap.md) | Missing features, planned phases 14–21 |
| [spec/12-schemas.md](spec/12-schemas.md) | All Pydantic request/response schemas — exact field names, types, validators |
| [spec/13-security.md](spec/13-security.md) | JWT, CORS, rate limiting, RBAC, injection prevention, secrets |

## Architecture Decision Records

ADRs record **why** major architectural choices were made.

| ADR | Decision |
|---|---|
| [ADR-001](adr/ADR-001-row-level-multitenancy.md) | Row-level isolation (not schema-per-tenant) |
| [ADR-002](adr/ADR-002-jwt-tenant-claims.md) | Tenant context embedded in JWT claims |
| [ADR-003](adr/ADR-003-otp-in-redis.md) | OTP codes stored in Redis (not database) |
| [ADR-004](adr/ADR-004-food-court-family-scope.md) | Food court family scope via accessible_tenant_ids() |

## RFCs — Planned Features

RFCs specify features **before implementation begins**.

| RFC | Feature | Status |
|---|---|---|
| [RFC-001](rfcs/RFC-001-tenant-discovery.md) | Public tenant discovery + registration redesign | Proposed |
| [RFC-002](rfcs/RFC-002-admin-settings.md) | Tenant admin settings + branding customization | Proposed |
| [RFC-003](rfcs/RFC-003-floor-plan-editor.md) | Visual table/seat formation editor | Proposed |
| [RFC-004](rfcs/RFC-004-password-reset.md) | Password reset and change flow | Proposed |
| [RFC-005](rfcs/RFC-005-food-court-frontend.md) | Food court frontend pages | Proposed |

---

> **Rule:** Before opening a PR, verify that every changed behaviour is reflected in the relevant spec file.  
> If you change an API endpoint, update `spec/04-api-reference.md`.  
> If you change a request/response schema or validator, update `spec/12-schemas.md`.  
> If you add a DB column, update `spec/02-data-model.md`.  
> If you change a business rule, update `spec/06-business-rules.md`.  
> If you change auth, CORS, or rate limiting, update `spec/13-security.md`.

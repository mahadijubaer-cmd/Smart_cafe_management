# ADR-001: Row-Level Multi-Tenancy (Not Schema-Per-Tenant)

**Date:** 2026-01-15  
**Status:** Accepted  
**Deciders:** Mahadi Jubaer

---

## Context

SCMS needs to serve multiple independent organizations (tenants) from a single deployment. The system must ensure complete data isolation between tenants — Tenant A must never see Tenant B's data.

There are three main approaches to multi-tenancy in relational databases:
1. **Row-level isolation** — Single schema; every table has a `tenant_id` column; queries filter by it
2. **Schema-per-tenant** — One PostgreSQL schema per tenant; `search_path` routes queries
3. **Database-per-tenant** — Separate database instance per tenant

## Decision

Use **row-level isolation** with a `tenant_id` column on every tenant-scoped table.

Isolation is enforced at three layers:
1. Middleware: resolves tenant from `X-Tenant-Slug` header
2. JWT cross-check: asserts token tenant matches request tenant
3. Database queries: every query filters by `tenant_id`

## Rationale

**Why not schema-per-tenant?**
- Schema-per-tenant requires dynamic `search_path` switching; fragile with connection pools
- Alembic migrations become complex — must run against each schema
- Harder to write cross-tenant queries (e.g., platform admin analytics)
- PostgreSQL has a practical limit on the number of schemas (~100 in typical usage)

**Why not database-per-tenant?**
- Requires separate connection pools per tenant — expensive on a student server
- Migrations must be applied to each database separately
- Platform admin reporting across tenants requires external ETL or federation
- Overkill for a thesis project with <50 tenants

**Why row-level?**
- Simple: standard ORM queries with an additional `.where()` filter
- Alembic migrations run once and apply to all tenants simultaneously
- Cross-tenant queries (platform admin) are straightforward
- PostgreSQL Row-Level Security (RLS) can be added later as a defense-in-depth layer if needed
- Well-understood pattern used by Shopify, Basecamp, and many SaaS products

## Consequences

**Positive:**
- Simple migrations
- Easy cross-tenant reporting for platform admin
- No connection pool explosion

**Negative:**
- Developer discipline required: every query MUST include `tenant_id` filter
- A missing filter is a security bug, not a crash (harder to detect)
- Mitigation: automated tests in `test_tenant_isolation.py` catch missing filters

**Risk:** If a developer adds a new query without the `tenant_id` filter, data leaks. This is detected by tests, not at runtime.

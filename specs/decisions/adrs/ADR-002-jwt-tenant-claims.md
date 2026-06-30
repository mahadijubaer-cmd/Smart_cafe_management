# ADR-002: Tenant Context Embedded in JWT Claims

**Date:** 2026-01-20  
**Status:** Accepted  
**Deciders:** Mahadi Jubaer

---

## Context

On every authenticated request, the system needs to know: which tenant is this user from, what type of tenant is it, and what role does the user have? This information is required for both the permission check and the database query tenant filter.

Options:
1. **JWT claims** — embed `tenant_id`, `tenant_type`, `role` in the JWT
2. **DB lookup on every request** — JWT contains only `user_id`; tenant context fetched from DB each time
3. **Session store** — Server-side session with Redis storing user+tenant context

## Decision

Embed `tenant_id`, `tenant_slug`, `tenant_type`, and `role` directly in the JWT payload as claims.

```json
{
  "sub": "<user_id>",
  "tenant_id": "<tenant_id>",
  "tenant_slug": "bracu",
  "tenant_type": "academic",
  "role": "student",
  "outlet_id": null,
  "jti": "<uuid>",
  "exp": 1735689600
}
```

**Algorithm:** HS256  
**Expiry:** 60 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES = 60`)  
**Tenant context reading:** `TenantContextMiddleware` reads the Bearer JWT only — no `X-Tenant-Slug` header lookup.

## Rationale

**Why not DB lookup per request?**
- Every request would require at minimum 1 additional DB round-trip to load user+tenant
- At 4 uvicorn workers under load, this multiplies quickly
- Redis caching of the user record would reduce it, but adds complexity

**Why not sessions?**
- Sessions require a Redis lookup on every request (same as DB lookup)
- JWTs are stateless — the server does not need to maintain session state
- Sessions complicate horizontal scaling (all workers need shared Redis session store)

**Why JWT claims?**
- Zero DB/Redis lookups for tenant context on authenticated requests
- Stateless: any worker can validate any token independently
- Self-contained: the token carries all context needed for the permission check

## Consequences

**Positive:**
- Fast: no extra DB/Redis call for tenant context
- Stateless: trivially horizontal-scalable

**Negative:**
- If a user's role changes (e.g., promoted from student to staff), the old JWT still has the old role until it expires (max 60 minutes)
- Mitigation: On logout, the JWT is blacklisted using its `jti` claim. Role changes should prompt re-login.

**This is an accepted trade-off.** Role changes are rare; the 60-minute window is acceptable.

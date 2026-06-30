# ADR-004: Food Court Family Scope via accessible_tenant_ids()

**Date:** 2026-06-01  
**Status:** Accepted  
**Deciders:** Mahadi Jubaer

---

## Context

A food court is a parent tenant with multiple vendor child tenants. The food court admin (and shared server staff) needs to see data across ALL vendors simultaneously:
- Active orders from all vendors (so a server knows where to deliver)
- Unified menu from all vendors (so customers can browse all options)
- Settlement reports per vendor

However, this cross-vendor visibility must NOT exist in the standard API endpoints (`/orders/`, `/menu/items`, etc.) — vendors must remain fully isolated from each other.

The question: how do we implement cross-vendor reads without breaking the isolation guarantee?

## Options Considered

**Option A: Special query parameter**  
Add `?scope=family` to standard endpoints. Problem: this would require every endpoint to handle the food court special case, polluting the entire codebase and increasing risk of isolation bugs.

**Option B: Separate food court router**  
Create a new `/food-court/*` router with dedicated endpoints. Standard endpoints (`/orders/`, `/menu/items`, etc.) keep strict isolation. The food court router applies family scope only.

**Option C: Middleware-level scope**  
Detect food_court tenant type in middleware and automatically expand `tenant_id` to include vendor IDs. Problem: this would cause standard endpoints to also return cross-vendor data, breaking isolation for vendors who call standard endpoints.

## Decision

Use **Option B**: a separate `/food-court/*` router with a dedicated `accessible_tenant_ids()` function that returns `{food_court_id} ∪ {all vendor_ids}`.

```python
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

Every endpoint in `/food-court/` that needs family scope calls this function.  
Every endpoint in all other routers continues to use `ctx.tenant_id` only.

An additional guard, `_require_food_court()`, ensures only food_court tenant JWTs can call food court endpoints:
```python
def _require_food_court(ctx: TenantContext) -> TenantContext:
    if ctx.tenant_type != TenantType.food_court:
        raise HTTPException(403, "Food court access only")
    return ctx
```

## Rationale

**Why Option B over A/C?**

- **Containment:** Family scope logic is isolated to one file (`food_court.py`). It cannot accidentally affect other endpoints.
- **Auditability:** The family scope function has its own tests. Adding a new endpoint to the food court router requires explicitly calling `accessible_tenant_ids()` — it's not automatic.
- **Vendor isolation preserved:** Vendors calling `/orders/` still get strict isolation. The family scope never leaks into standard endpoints.

## Consequences

**Positive:**
- Standard endpoints remain unchanged — zero risk of isolation regression
- Food court behaviour is testable in isolation (`test_food_court_isolation.py`)
- Adding new food court features is easy — just add to `food_court.py` and call `accessible_tenant_ids()`

**Negative:**
- Some code duplication — food court endpoints duplicate similar logic from standard endpoints
- Developers must know to use the food court router for food court features; accidentally adding to the standard router would break family scope

**Documentation:** The `_require_food_court()` guard provides a clear error when a developer accidentally calls a food court endpoint with a vendor JWT, making the boundary explicit and debuggable.

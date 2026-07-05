# Segments (Cafeteria vs Restaurant)

**Status:** ✅ [Phase 22 — Implemented 2026-07-05] (design accepted via RFC-007)
**Last verified against code:** N/A — this file describes planned behaviour

---

## What Is a Segment?

A **segment** is a UX/product classification of a tenant, used to decide which routes, capabilities,
and consumer flows apply. There are exactly two segments: `cafeteria` and `restaurant`.

**Segment is derived, never stored.** There is no `segment` column on `tenants`. It is computed at
request/render time from the existing `tenant_type` via one function, so it can never drift out of
sync with the tenant's actual type.

```python
SEGMENT_MAP = {
    "corporate": "cafeteria",
    "academic": "cafeteria",
    "independent_restaurant": "restaurant",
    "franchise_brand": "restaurant",
    "franchise_outlet": "restaurant",
    "food_court": "restaurant",
    "food_court_vendor": "restaurant",
}

def get_segment(tenant_type: str) -> str:
    return SEGMENT_MAP[tenant_type]
```

Planned location: `backend/app/core/segments.py` (single source of truth — import this everywhere;
never re-derive the mapping inline in a router or component). Frontend mirrors it in
`frontend/src/lib/segments.ts` from the same table.

---

## Capability Matrix (Authoritative)

| Capability | Cafeteria | Restaurant |
|---|---|---|
| Consumer login/registration | ✅ | ❌ (route + API blocked — BR-SEG-1) |
| Public menu link (no auth) | ✅ read-only browsing only [Phase D, 2026-07-05] | ✅ + guest ordering |
| Guest QR ordering | ❌ | ✅ |
| Staff POS order entry | ✅ | ✅ |
| Wallet / reward points / OTP-verified accounts | ✅ | ❌ (admin 2FA OTP still applies) |
| Homemade marketplace | `academic` only | ❌ |
| Seating formation editing (tenant admin) | ✅ | ✅ |
| Kiosk / signage modes | optional | ✅ |
| Cleaner chain | ✅ | optional per-tenant flag |
| Analytics / business reports | ✅ | ✅ (+ guest-vs-POS split, `order_source`) |

---

## Business Rules

### BR-SEG-1: Restaurant Tenants Cannot Self-Register or Log In as Consumers
✅ [Phase 22 — Implemented 2026-07-05]. For any tenant where `get_segment(tenant_type) == "restaurant"`:
- Frontend: `[tenant_slug]/(customer)/*` routes and `register/page.tsx` are hidden/404'd by
  `[tenant_slug]/layout.tsx` after it resolves the tenant and derives the segment.
- Backend: `POST /auth/register` returns `400 "Consumer registration is not available for this tenant"`
  when the resolving tenant's segment is `restaurant`.
- Backend: `POST /auth/login` returns `403 "Consumer login is not available for this tenant"` when
  the authenticating user's role is `customer`/`student` and the tenant's segment is `restaurant` —
  this covers any pre-existing customer account, not just new registrations. Admin/staff roles are
  unaffected.
- This is in addition to, not a replacement for, the existing BR-REG-1 role restrictions in
  `modules/auth.md`.

### BR-SEG-2: Segment Is Never Persisted
No migration, model, or schema may add a `segment` column. Any code that needs the segment calls
`get_segment(tenant.tenant_type)` (backend) or the equivalent frontend helper. This guarantees the
segment can never disagree with `tenant_type` after a tenant-type change (tenant type itself is
immutable post-creation per `modules/tenants.md`, so this is mostly a defense against future drift
if that ever changes).

### BR-SEG-3: Cafeteria Public Menu Is Read-Only
✅ [Phase D — Implemented 2026-07-05]. Cafeteria-segment tenants may set
`tenants.public_menu_enabled=TRUE` and get a `/m/{public_slug}` page, same as restaurants — but
`POST /public/{public_slug}/orders` returns `400 "Guest ordering is not available for this venue —
please log in to order"` for any non-restaurant-segment tenant (`is_restaurant_segment()` gate in
`routers/public.py::create_public_order`). Cafeteria diners already have accounts (BR-SEG-1 doesn't
apply to them) and order through the normal authenticated app; the public link is for people
browsing the menu before they have an account, or from off-campus. The frontend hides the
add-to-cart/checkout UI entirely for these tenants (`isRestaurantSegment(info.tenant_type)` on
`app/m/[public_slug]/page.tsx`), but the backend gate is the actual enforcement boundary.

---

## Relationship to Other Specs

- Guest ordering (restaurant segment only): `modules/public-surface.md`
- Order schema changes (`order_source`, `guest_token`, etc.): `system/data-model.md`, `modules/orders.md`
- Table QR payload changes: `modules/qr-pdf.md`
- Wallet/reward no-op for guest orders: `modules/payments.md`
- Frontend routing: `frontend/overview.md`
- Full design rationale: `decisions/rfcs/RFC-007-segment-split-guest-ordering.md`

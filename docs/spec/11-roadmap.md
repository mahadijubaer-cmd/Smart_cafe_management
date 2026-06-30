# Spec 11 — Roadmap & Planned Work

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. Completed Phases (1–13)

All 13 original phases are complete as of 2026-06-30.

| Phase | Deliverable | Status |
|---|---|---|
| 1–8 | Core backend (models, routers, auth, menu, orders, tables, inventory, payments, OTP, QR, PDF, WebSocket, analytics) | ✅ Done |
| 9 | Frontend routing tree, Zustand store, API client, inventory pages, platform admin | ✅ Done |
| 10 | OTP input component, order QR code, receipt button, register/login flows with 2FA | ✅ Done |
| 11 | Test suite — tenant isolation, inventory, OTP, Redis (38 tests total) | ✅ Done |
| 12 | Production Docker Compose, .env.example, seed_demo.py | ✅ Done |
| 13 | Food court router (10 endpoints), food court isolation tests (10 tests), seed food court tenants | ✅ Done |

---

## 2. Identified Gaps

### 2.1 Missing Backend Endpoints

| Endpoint | Phase | RFC |
|---|---|---|
| `POST /auth/forgot-password` | 19 | RFC-004 |
| `POST /auth/reset-password` | 19 | RFC-004 |
| `POST /auth/change-password` | 19 | RFC-004 |
| `POST /auth/refresh` | 19 | RFC-004 |
| `PATCH /auth/me` | 19 | RFC-004 |
| `GET /tenants/public` | 14 | RFC-001 |
| `GET /tenants/public/{slug}` | 14 | RFC-001 |
| `PATCH /tenants/me/settings` | 15 | RFC-002 |
| `POST /tenants/me/logo` | 15 | RFC-002 |
| `PATCH /tables/layout` | 16 | RFC-003 |
| `PUT /tables/{table_id}` | 16 | RFC-003 |
| `DELETE /tables/{table_id}` | 16 | RFC-003 |
| `GET /notifications` | 21 | — |
| `PATCH /notifications/{id}/read` | 21 | — |
| `POST /users/invite` | 21 | — |
| `POST /users/accept-invite` | 21 | — |

### 2.2 Missing Frontend Pages

| Page | Path | Phase |
|---|---|---|
| Tenant discovery | `/discover` | 14 |
| Password reset | `/[slug]/(auth)/forgot-password` | 19 |
| Admin tables + floor plan | `/[slug]/(admin)/tables` | 16 |
| Admin analytics | `/[slug]/(admin)/analytics` | 17 |
| Admin menu management | `/[slug]/(admin)/menu` | 18 |
| Admin settings | `/[slug]/(admin)/settings` | 15 |
| Admin memo | `/[slug]/(admin)/memo` | 15 |
| Staff menu view | `/[slug]/(staff)/menu` | 15 |
| Food court dashboard | `/[slug]/(food-court)/dashboard` | 20 |
| Food court unified menu | `/[slug]/(food-court)/menu` | 20 |
| Food court delivery queue | `/[slug]/(food-court)/deliver` | 20 |
| Food court analytics | `/[slug]/(food-court)/analytics` | 20 |
| Platform subscriptions | `/(platform)/admin/subscriptions` | 21 |
| Platform analytics | `/(platform)/admin/analytics` | 21 |

### 2.3 UX Issues in Existing Pages

| Issue | File | Phase |
|---|---|---|
| Root `/` hardcodes redirect to `/bracu/login` | `src/app/page.tsx` | 14 |
| Register page has no org name/logo context | `src/app/[tenant_slug]/(auth)/register/page.tsx` | 14 |
| Register role dropdown allows staff/cleaner | Same | 14 |
| Profile page is view-only (no edit/password change) | `src/app/[tenant_slug]/(customer)/profile/page.tsx` | 19 |
| No tenant brand color applied to UI | `src/app/[tenant_slug]/layout.tsx` | 15 |
| Admin dashboard does not adapt to tenant type | `src/app/[tenant_slug]/(admin)/dashboard/page.tsx` | 17 |

---

## 3. Phase Workplan (14–21)

### Phase 14 — Tenant Discovery + Registration Redesign
**RFC:** [RFC-001](../rfcs/RFC-001-tenant-discovery.md)  
**Priority:** P0  

Backend:
- `GET /tenants/public` — public list (no auth)
- `GET /tenants/public/{slug}` — single public profile
- Block staff/cleaner from self-registration in `POST /auth/register`

Frontend:
- `/discover/page.tsx` — search + filter tenant cards
- Redesign `/[slug]/(auth)/register/page.tsx` — profile type selector, adaptive form, tenant banner
- Fix `/page.tsx` — show discovery landing instead of hardcoded redirect

New components: `TenantCard`, `ProfileTypeSelector`, `TenantWelcomeBanner`

---

### Phase 15 — Admin Settings + Tenant Customization
**RFC:** [RFC-002](../rfcs/RFC-002-admin-settings.md)  
**Priority:** P0  

Backend:
- `PATCH /tenants/me/settings`
- `POST /tenants/me/logo`

Frontend:
- `/[slug]/(admin)/settings/page.tsx` — 4 tabs: Profile, Branding, Access Control, Operations
- `/[slug]/(admin)/memo/page.tsx`
- `/[slug]/(staff)/menu/page.tsx`
- Inject `brand_color` as CSS var in `layout.tsx`

New components: `BrandColorPicker`, `LogoUploader`, `DomainRestrictionInput`, `OperationsToggle`

---

### Phase 16 — Admin Tables + Floor Plan Editor
**RFC:** [RFC-003](../rfcs/RFC-003-floor-plan-editor.md)  
**Priority:** P1  

Backend:
- `PUT /tables/{table_id}`
- `PATCH /tables/layout`
- `DELETE /tables/{table_id}`

Frontend:
- `/[slug]/(admin)/tables/page.tsx` — two modes: live status view + layout editor
- `FloorPlanEditor` — 12×8 drag-and-drop canvas using @dnd-kit
- `TableDetailPanel` — slide-over with table info + cleaner assignment

---

### Phase 17 — Admin Analytics Dashboard
**Priority:** P1  

Frontend:
- `/[slug]/(admin)/analytics/page.tsx`
- Period selector: today / week / month
- `HourlyHeatmap`, `TopItemsChart` components
- Adapt admin dashboard widgets per tenant_type

---

### Phase 18 — Admin Menu Management
**Priority:** P1  

Frontend:
- `/[slug]/(admin)/menu/page.tsx`
- `MenuItemForm` — add/edit with image upload
- `CategoryManager` — inline CRUD for categories

---

### Phase 19 — Password Reset + Profile Edit
**RFC:** [RFC-004](../rfcs/RFC-004-password-reset.md)  
**Priority:** P1  

Backend:
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `POST /auth/refresh`
- `PATCH /auth/me`

Frontend:
- `/[slug]/(auth)/forgot-password/page.tsx` — 3-step reset
- Edit profile functionality on `/[slug]/(customer)/profile/page.tsx`

---

### Phase 20 — Food Court Frontend
**RFC:** [RFC-005](../rfcs/RFC-005-food-court-frontend.md)  
**Priority:** P2  

Frontend:
- `/[slug]/(food-court)/layout.tsx` — guard for food_court tenant type
- `/[slug]/(food-court)/dashboard/page.tsx`
- `/[slug]/(food-court)/menu/page.tsx`
- `/[slug]/(food-court)/deliver/page.tsx`
- `/[slug]/(food-court)/analytics/page.tsx`

---

### Phase 21 — Notifications + Staff Invitation + Platform Admin
**Priority:** P2  

Backend:
- `GET /notifications`, `PATCH /notifications/{id}/read`
- `POST /users/invite`, `POST /users/accept-invite`

Frontend:
- Notification bell in navbar
- `/[slug]/notifications/page.tsx`
- `/[slug]/(admin)/users/invite/page.tsx`
- `/(platform)/admin/subscriptions/page.tsx`
- `/(platform)/admin/analytics/page.tsx`

New DB migration:
- `staff_invitations` table (see `docs/spec/02-data-model.md` → Section 4)

---

## 4. Priority Matrix

| Feature | User Impact | Effort | Priority |
|---|:---:|:---:|:---:|
| Tenant discovery + registration redesign | Very High | Medium | P0 |
| Admin settings + branding | High | Medium | P0 |
| Password reset flow | High | Low | P0 |
| Floor plan editor | High | High | P1 |
| Admin analytics dashboard | High | Medium | P1 |
| Admin menu management | High | Medium | P1 |
| Staff menu toggle page | Medium | Low | P1 |
| Profile edit + password change | Medium | Low | P1 |
| Food court frontend | High | High | P2 |
| Staff invitation system | Medium | High | P2 |
| Notification inbox | Medium | Medium | P2 |
| Platform analytics + subscriptions | Low | Medium | P3 |

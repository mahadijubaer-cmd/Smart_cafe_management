# Changelog

All notable changes to the SCMS project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Phase 15 — Admin Settings + Tenant Customization (2026-06-30)

#### Backend
- **`GET /api/v1/tenants/me`** — Returns the full tenant record for the calling admin's own organisation (`tenant_admin`, `outlet_admin`, `food_court_admin`).
- **`PATCH /api/v1/tenants/me/settings`** — Self-service settings update: name, logo_url, brand_color, address, city, phone, contact_email, allowed_email_domain, homemade_enabled, inventory_strict_mode. Invalidates Redis public cache on save.
- **`POST /api/v1/tenants/me/logo`** — Multipart logo upload (PNG/JPEG/WebP, max 2 MB). Saves to `/media/logos/{tenant_id}.{ext}` and updates `logo_url`.
- **New schema** — `TenantSettingsUpdate` in `schemas/tenant.py`.
- **`main.py`** — Creates `logos/` dir alongside `qr_codes/` at startup.

#### Frontend — Brand Color System
- **`globals.css`** — Added `--color-primary: #1A4D2E` to `:root` as the default CSS variable.
- **`tailwind.config.js`** — `primary` color changed from hardcoded `#1A4D2E` to `var(--color-primary)`. All `bg-primary`, `text-primary`, `border-primary` Tailwind classes now pick up the tenant's brand color at runtime.
- **`[tenant_slug]/layout.tsx`** — Sets `--color-primary` on `document.documentElement` from Zustand `brandColor` on every slug navigation. Restores default on unmount.

#### Frontend — Admin UI
- **`(admin)/settings/page.tsx`** — NEW: 4-tab settings page (Organisation, Branding, Access Control, Operations).
- **`(admin)/memo/page.tsx`** — NEW: Memo generator UI with all `MemoRequest` fields; downloads PDF from `POST /memo/generate`.
- **`(admin)/layout.tsx`** — Added Settings and Memo nav items; replaced hardcoded `#1A4D2E` with `bg-primary`/`text-primary`.

#### Frontend — Staff UI
- **`(staff)/menu/page.tsx`** — NEW: Staff item availability toggle page. Lists all items split into Available/Unavailable sections; one-tap toggle calls `PATCH /menu/items/{id}/toggle`.
- **`(staff)/layout.tsx`** — Added Menu nav link.

#### New Components
- `components/admin/BrandColorPicker.tsx` — Preset swatches + hex input + live preview.
- `components/admin/LogoUploader.tsx` — Drag-to-upload with preview; calls `POST /tenants/me/logo`.
- `components/admin/DomainRestrictionInput.tsx` — Enable/disable toggle + `@domain` text input.
- `components/admin/OperationsToggle.tsx` — Labelled boolean switch with consequence warning.

#### Tests
- `backend/tests/test_tenant_settings.py` — 10 test cases: GET /me, PATCH settings (name, color, ops flags, slug immutability), role guard, logo invalid type, logo too large.

---

### Phase 14 — Tenant Discovery & Registration Redesign (2026-06-30)

#### Backend
- **`GET /api/v1/tenants/public`** — New public endpoint (no auth). Returns all active tenants with name, slug, type, logo, city, brand color. Supports `?q=` search by name/city. Redis-cached 5 min.
- **`GET /api/v1/tenants/public/{slug}`** — New public endpoint. Returns `TenantPublicDetailResponse` including `allowed_email_domain` (needed for registration domain validation).
- **BR-REG-1** — `POST /auth/register` now blocks staff, cleaner, outlet_admin, tenant_admin, platform_admin, food_court_admin from self-registration. Returns `400 "This role requires an admin invitation."`.
- **New schemas** — `TenantPublicResponse`, `TenantPublicDetailResponse`, `TenantPublicListResponse` added to `schemas/tenant.py`.

#### Frontend
- **`/discover`** — New tenant discovery page with search bar and `TenantCard` grid.
- **Register page** — Full redesign: 3-step flow (profile type → details → OTP verification).
  - **Bug fix:** OTP send purpose was `'verification'` — corrected to `'email_verification'`.
  - **Bug fix:** OTP verify body sent `code` field — corrected to `otp_code`.
  - **Bug fix:** `tenant_slug` was missing from OTP send/verify requests.
  - **Bug fix:** Role dropdown offered staff/cleaner (BR-REG-1 violation) — replaced with `ProfileTypeSelector`.
- **Root `/` page** — Now shows landing page with links to discover and previously-visited tenant, instead of hardcoded bracu redirect.
- **New components** — `TenantWelcomeBanner`, `ProfileTypeSelector`, `TenantCard`.
- **New hook** — `useTenantInfo(slug)` — fetches and caches public tenant detail.

#### Tests
- `backend/tests/test_tenants_public.py` — 8 test cases covering public list, search, detail, inactive exclusion, no-auth access, missing slug.
- `backend/tests/test_auth.py` — 8 new test cases: 6 parametrized BR-REG-1 blocked roles + student/customer allowed.

---

### Documentation (2026-06-30 — Spec cross-verification and completion)
- Fully cross-verified all spec files against actual codebase (models, routers, middleware, schemas, frontend)
- Applied 70+ corrections across 10 spec files (wrong event names, wrong Redis keys, wrong auth flows, wrong WS URL, wrong enum counts, wrong field names/types/lengths)
- **`04-api-reference.md`** — Complete rewrite: every endpoint accurately specced with exact request schemas, response schemas, correct status codes, and current backend behaviour (not aspirational)
- **`06-business-rules.md`** — Fixed INV-1/5/6 movement type names; fixed OTP-3 purpose string; added reward points rules (RWD-1 through RWD-4); added stock movement types reference table
- **`08-workflows.md`** — Fixed WF-2 login flow (backend returns Token immediately; 2FA is frontend-only); fixed WF-1 OTP purpose (`email_verification`); fixed WF-4/5 event names; fixed cleaner endpoint paths
- **`10-testing.md`** — Fixed blacklist key format (`blacklist:jti:`), event names (`LOW_STOCK`, `CLEAN_ASSIGNED`), OTP key format, movement type name
- **`docs/spec/12-schemas.md`** — Created: all 11 Pydantic schema modules documented with exact field names, types, required/optional, validators, and constraints
- **`docs/spec/13-security.md`** — Created: JWT claims, token blacklist, BCRYPT password hashing, rate limiting (slowapi), CORS policy, tenant isolation layers, RBAC groups, input validation, WebSocket security, secrets management
- **`docs/README.md`** and **`docs/SPEC_FIRST.md`** — Updated navigation, file ownership map, and quick reference for new spec files 12 and 13

*Changes that are spec'd (RFC accepted) but not yet implemented.*

### Planned (Phase 14)
- Add `GET /tenants/public` and `GET /tenants/public/{slug}` endpoints (RFC-001)
- Add tenant discovery page at `/discover`
- Redesign registration page with profile type selector and tenant banner (RFC-001)

### Planned (Phase 15)
- Add `PATCH /tenants/me/settings` endpoint (RFC-002)
- Add `POST /tenants/me/logo` endpoint (RFC-002)
- Add admin settings page with branding and operations tabs (RFC-002)
- Inject brand_color as CSS custom property in tenant layout

### Planned (Phase 16)
- Add `PUT /tables/{table_id}`, `PATCH /tables/layout`, `DELETE /tables/{table_id}` (RFC-003)
- Add admin tables page with live status view and floor plan editor (RFC-003)

### Planned (Phase 17)
- Add admin analytics page with hourly heatmap, top items chart, revenue trends

### Planned (Phase 18)
- Add admin menu management page (category CRUD, item CRUD, image upload)

### Planned (Phase 19)
- Add `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password`, `POST /auth/refresh`, `PATCH /auth/me` (RFC-004)
- Add forgot-password page with 3-step OTP flow (RFC-004)
- Add profile editing and password change on profile page (RFC-004)

### Planned (Phase 20)
- Add food court frontend: dashboard, unified menu, tables, delivery queue, analytics, settlements (RFC-005)

### Planned (Phase 21)
- Add staff invitation system with `POST /users/invite` and `POST /users/accept-invite`
- Add notification inbox with `GET /notifications`
- Add platform admin subscription and analytics pages

---

## [3.1.0] — 2026-06-30

### Added (Phase 13 — Food Court)
- `backend/app/routers/food_court.py` — 10 endpoints at `/api/v1/food-court/`:
  `GET /vendors`, `GET /menu`, `GET /tables`, `POST /tables`, `PATCH /tables/{id}/status`,
  `GET /orders/active`, `PATCH /orders/{id}/deliver`, `GET /staff`, `GET /analytics`, `GET /settlements`
- `backend/app/core/dependencies.py` — `accessible_tenant_ids()` for food court family scope
- `backend/tests/test_food_court_isolation.py` — 10 isolation tests
- `backend/scripts/seed_demo.py` — extended with food court tenants and 4 demo users

### Added (Phase 12 — Deployment)
- `docker-compose.prod.yml` — production compose with postgres, redis, pgAdmin, backend (4 workers), frontend
- `.env.example` — extended with `POSTGRES_PASSWORD`, `DEBUG`, `SERVER_HOST`, `PGADMIN_EMAIL/PASSWORD`
- `backend/scripts/seed_demo.py` — 11 demo users across 7 tenants (Section 23.3 credentials)

### Added (Phase 11 — Testing)
- `backend/pytest.ini` — asyncio_mode=auto
- `backend/tests/conftest.py` — FakeAsyncRedis, SQLite in-memory fixtures, async_client, get_token helper
- `backend/tests/test_tenant_isolation.py` — 7 tests
- `backend/tests/test_inventory.py` — 10 tests
- `backend/tests/test_otp.py` — 9 tests
- `backend/tests/test_redis.py` — 12 tests
- `requirements.txt` — added aiosqlite, pytest-cov

### Added (Phase 10 — Frontend Auth & Order UX)
- `src/components/auth/OtpInput.tsx` — 6-digit OTP input with auto-advance and resend
- `src/components/order/OrderQrCode.tsx` — fetches and renders order QR
- `src/components/order/ReceiptButton.tsx` — PDF blob download
- `src/app/[tenant_slug]/(auth)/register/page.tsx` — 2-step register + OTP verify
- `src/app/[tenant_slug]/(auth)/login/page.tsx` — login with admin 2FA step
- Order tracking page with QR and receipt

### Added (Phase 9 — Frontend Architecture)
- `src/lib/api.ts` — axios client with JWT + slug headers
- `src/lib/auth.ts` — JWT utilities (getRoleFromToken, isTokenExpired)
- `src/types/index.ts` — full TypeScript type definitions
- `src/store/useStore.ts` — Zustand store with auth + cart + tenant context
- `src/app/[tenant_slug]/` — full routing tree: auth, customer, staff, cleaner, admin
- `src/app/[tenant_slug]/(admin)/inventory/` — full inventory management pages
- `src/app/(platform)/admin/tenants/page.tsx` — platform admin tenant CRUD

### Added (Phases 1–8 — Backend Core)
- FastAPI application with all 15 routers
- PostgreSQL + SQLAlchemy 2.0 async models (9 tables)
- Redis integration (OTP, JWT blacklist, locks, cache)
- Authentication: JWT, OTP, 2FA for admin roles
- Alembic migrations
- PDF generation (reportlab 4.1.0) for receipts and memos
- QR code generation (qrcode[pil])
- WebSocket real-time events (8 event types)
- Analytics endpoints (6 endpoints)
- Inventory management with strict mode and low-stock alerts

---

## [3.0.0] — 2026-03-01 (Estimated)

Initial thesis project setup. Multi-tenant architecture designed. Tech stack selected.

---

*For older history, see the original SCMS_Master_Documentation_v3.md.*

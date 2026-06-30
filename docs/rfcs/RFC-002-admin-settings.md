# RFC-002: Tenant Admin Settings & Branding Customization

**Date:** 2026-06-30  
**Author:** Mahadi Jubaer  
**Status:** Accepted  
**Related spec files:** spec/02-data-model.md, spec/04-api-reference.md, spec/07-frontend.md

---

## 1. Motivation

The `tenants` table stores 10+ customizable fields (`brand_color`, `logo_url`, `allowed_email_domain`, `homemade_enabled`, `inventory_strict_mode`, etc.) but there is no frontend UI for tenant admins to change any of them. Currently, these can only be changed by a `platform_admin` via the raw tenant CRUD endpoint.

Tenant admins need self-service control over their organization's appearance and operational settings — without needing to contact the platform operator.

---

## 2. Proposed Design

### 2.1 Overview

Add a self-service settings page at `/[slug]/(admin)/settings` with four tabs. Add a backend endpoint scoped to the calling user's own tenant (not platform admin).

### 2.2 Settings Page Tabs

**Tab 1: Organization Profile**  
Fields: name, address, city, phone, contact_email  
Logo upload widget (calls `POST /tenants/me/logo`)  

**Tab 2: Branding**  
`BrandColorPicker` — hex color input with live preview pane showing how buttons and links look in that color  
Preview pane shows a mock navbar + button + menu card in the selected color  
Save updates `brand_color`  

**Tab 3: Access Control**  
`DomainRestrictionInput` — text input for `allowed_email_domain` (validates starts with `@`)  
Toggle: "Require domain-specific email" — clears `allowed_email_domain` when disabled  
Note: changing this does NOT affect existing users  

**Tab 4: Operations**  
Toggle: "Homemade Marketplace" (only shown for `academic` tenants) — sets `homemade_enabled`  
Toggle: "Strict Inventory Mode" — sets `inventory_strict_mode`  
Each toggle has an explanation of what it does and the consequences of enabling/disabling  

### 2.3 New API Endpoints

#### `PATCH /api/v1/tenants/me/settings`
Auth: Required | Roles: `tenant_admin`, `outlet_admin`, `food_court_admin`  
Allowed update fields: `name`, `logo_url`, `brand_color`, `address`, `city`, `phone`, `contact_email`, `allowed_email_domain`, `homemade_enabled`, `inventory_strict_mode`  
NOT allowed: `tenant_type`, `subscription_tier`, `is_active`, `parent_tenant_id`, `slug`  

Body (all fields optional — PATCH semantics):
```json
{
  "brand_color": "#2B4C7E",
  "homemade_enabled": true,
  "inventory_strict_mode": false
}
```
Response `200`: Updated fields only  
Side effect: Invalidates `cache:tenant:{slug}` in Redis

#### `POST /api/v1/tenants/me/logo`
Auth: Required | Roles: Same  
Body: `multipart/form-data` with field `logo` (image file: PNG, JPEG, WebP; max 2MB)  
Server: saves to `{MEDIA_ROOT}/logos/{tenant_id}.{ext}`, updates `logo_url`  
Response `200`: `{ "logo_url": "/media/logos/{tenant_id}.png" }`

### 2.4 Database Changes

None. All fields already exist on the `tenants` table.

### 2.5 Frontend Changes

| File | Change |
|---|---|
| `src/app/[tenant_slug]/(admin)/settings/page.tsx` | NEW — tabbed settings page |
| `src/app/[tenant_slug]/(admin)/memo/page.tsx` | NEW — memo generator |
| `src/app/[tenant_slug]/(staff)/menu/page.tsx` | NEW — staff item availability toggle |
| `src/app/[tenant_slug]/layout.tsx` | Modified — inject brand_color as CSS var |
| `src/components/admin/BrandColorPicker.tsx` | NEW |
| `src/components/admin/LogoUploader.tsx` | NEW |
| `src/components/admin/DomainRestrictionInput.tsx` | NEW |
| `src/components/admin/OperationsToggle.tsx` | NEW |

### 2.6 Brand Color System

In `src/app/[tenant_slug]/layout.tsx`:
```typescript
useEffect(() => {
  if (tenant?.brand_color) {
    document.documentElement.style.setProperty('--color-primary', tenant.brand_color)
  }
}, [tenant])
```

In `tailwind.config.ts`:
```javascript
theme: { extend: { colors: { primary: 'var(--color-primary)' } } }
```

All hardcoded `#1A4D2E` Tailwind classes must be replaced with `bg-primary` / `text-primary` / `border-primary`.

---

## 3. Open Questions

- [x] Can `outlet_admin` change their outlet's name? Decision: Yes — they can update fields for their own outlet.
- [x] Should brand color changes take effect immediately? Decision: Yes — CSS var injection on every page load.
- [ ] Maximum logo file size? Proposed: 2MB.

---

## 4. Implementation Checklist

- [x] spec/04-api-reference.md updated
- [x] spec/07-frontend.md updated
- [ ] `PATCH /tenants/me/settings` implemented
- [ ] `POST /tenants/me/logo` implemented (with file size validation)
- [ ] Pydantic schema `TenantSettingsUpdate` created
- [ ] Settings page with 4 tabs built
- [ ] BrandColorPicker with live preview built
- [ ] LogoUploader with drag-and-drop built
- [ ] layout.tsx updated to inject CSS var
- [ ] All hardcoded `#1A4D2E` replaced with `bg-primary`/`text-primary`
- [ ] Tests: settings update, logo upload, brand color persistence
- [ ] CHANGELOG.md updated

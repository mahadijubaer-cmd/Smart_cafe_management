# RFC-004: Password Reset & Change Flow

**Date:** 2026-06-30  
**Author:** Mahadi Jubaer  
**Status:** Accepted  
**Related spec files:** spec/03-auth.md, spec/04-api-reference.md, spec/07-frontend.md, spec/08-workflows.md

---

## 1. Motivation

Currently there is no way for a user to recover a forgotten password. The auth router only has `/register`, `/login`, `/logout`, and `/me`. A user who forgets their password cannot log in and has no recovery path.

Additionally:
- Logged-in users cannot change their password (no endpoint or UI)
- Tokens have no refresh mechanism — if a token expires, the user must log in again
- The profile page is view-only — users cannot update their name, phone, or student ID

---

## 2. Proposed Design

### 2.1 Overview

Add three new auth endpoints for password recovery, in-session password change, and token refresh. Add a three-step forgot-password page. Update the profile page to allow editing.

### 2.2 Forgot Password Flow (3 Steps)

```
Step 1: User clicks "Forgot password?" on login page
  → Navigate to /{slug}/(auth)/forgot-password
  → Enter email
  → POST /auth/forgot-password { email, tenant_slug }
  → Server: verify user exists, send OTP (purpose: password_reset), return 200

Step 2: Enter OTP
  → OtpInput component (same as registration)
  → 60s resend cooldown

Step 3: Enter new password
  → POST /auth/reset-password { email, code, new_password, tenant_slug }
  → Server: verify OTP, hash new password, update user record
  → Response 200
  → Toast "Password updated. Please log in."
  → Redirect to /{slug}/login
```

### 2.3 Change Password (Logged In)

On the profile page, "Change Password" button opens a modal:
- Current password field
- New password field
- Confirm new password field
- Submit → `POST /auth/change-password`

### 2.4 New API Endpoints

#### `POST /api/v1/auth/forgot-password`
Auth: None  
Body: `{ email, tenant_slug }`  
Rules:
- Look up user by (email, tenant from slug)
- If user NOT found: still return 200 (do not confirm email existence — security)
- If user found and is_active=TRUE: send OTP (purpose: `password_reset`)
- Rate limit: 3 requests per 10 minutes per email  

Response `200`: `{ "message": "If that email is registered, an OTP has been sent." }`

---

#### `POST /api/v1/auth/reset-password`
Auth: None  
Body: `{ email, code, new_password, tenant_slug }`  
Rules:
- Verify OTP (purpose: `password_reset`) using same logic as `/otp/verify`
- Password must meet complexity requirements (min 8 chars, 1 uppercase, 1 digit, 1 special)
- Hash new password with pbkdf2_sha256
- Update `users.password_hash`
- Invalidate all existing tokens by NOT blacklisting (no `jti`-based invalidation for reset; just the new password makes old tokens effectively invalid if combined with `POST /auth/logout`)
- OTP deleted on success  

Response `200`: `{ "message": "Password updated. Please log in." }`  
Errors: `400` invalid OTP | `400` OTP expired | `400` password too weak

---

#### `POST /api/v1/auth/change-password`
Auth: Required (any role)  
Body: `{ current_password, new_password }`  
Rules:
- Verify `current_password` against existing hash
- `new_password` must meet complexity requirements
- `new_password` cannot be the same as `current_password`
- Update hash  

Response `200`: `{ "message": "Password changed." }`  
Errors: `400` current password incorrect | `400` new password same as old | `400` password too weak

---

#### `POST /api/v1/auth/refresh`
Auth: Required (valid, non-expired, non-blacklisted token)  
Body: (empty)  
Rules:
- Issues a new token with a fresh `exp` and a new `jti`
- Old token is blacklisted (the `jti` of the old token is added to Redis blacklist)
- The new token has the same claims except new `jti` and `exp`  

Response `200`: `{ "access_token": "...", "token_type": "bearer" }`  
Use case: Frontend calls this ~30 minutes before token expiry to extend the session without re-login

---

#### `PATCH /api/v1/auth/me`
Auth: Required (any role)  
Body: `{ full_name?, phone?, student_id? }`  
Rules:
- Cannot change `email` or `role` via this endpoint
- `student_id` only relevant for `student` / `employee` roles  

Response `200`: Updated user object

---

### 2.5 Password Complexity Requirements

All passwords must meet:
- Minimum 8 characters
- At least 1 uppercase letter (A–Z)
- At least 1 digit (0–9)
- At least 1 special character (!@#$%^&*...)

Validate on both backend (always) and frontend (for UX feedback).

### 2.6 Frontend Changes

| File | Change |
|---|---|
| `src/app/[tenant_slug]/(auth)/forgot-password/page.tsx` | NEW — 3-step flow |
| `src/app/[tenant_slug]/(auth)/login/page.tsx` | Modified — add "Forgot password?" link |
| `src/app/[tenant_slug]/(customer)/profile/page.tsx` | Modified — add edit fields + change password modal |

### 2.7 Business Rules

- **BR-AUTH-1:** Forgot password response is always 200 regardless of whether the email is registered (prevents email enumeration)
- **BR-AUTH-2:** Password reset OTP expires in 600 seconds (same as registration OTP — rule OTP-4)
- **BR-AUTH-3:** New password cannot equal current password
- **BR-AUTH-4:** Refresh token blacklists the old token (one active token per user at a time)

---

## 4. Open Questions

- [x] Should refresh invalidate the old token? Decision: Yes — prevents token accumulation and is more secure.
- [x] Should `forgot-password` reveal whether the email exists? Decision: No — always return 200 (BR-AUTH-1).
- [ ] Should there be a "sign out all devices" endpoint that blacklists all tokens? (Deferred — would require storing all active `jti` values per user)

---

## 5. Implementation Checklist

- [x] spec/03-auth.md updated (new endpoints added to planned section)
- [x] spec/04-api-reference.md updated
- [x] spec/08-workflows.md updated (WF-9 added)
- [x] spec/06-business-rules.md updated (BR-AUTH-1 through BR-AUTH-4)
- [ ] `POST /auth/forgot-password` implemented
- [ ] `POST /auth/reset-password` implemented
- [ ] `POST /auth/change-password` implemented
- [ ] `POST /auth/refresh` implemented
- [ ] `PATCH /auth/me` implemented
- [ ] Password complexity validator (shared between forgot-password and register)
- [ ] `/forgot-password/page.tsx` 3-step flow
- [ ] Profile page edit mode + change password modal
- [ ] "Forgot password?" link on login page
- [ ] Tests: forgot-password (email enumeration prevention), reset-password OTP flow, change-password validation, refresh token rotation
- [ ] CHANGELOG.md updated

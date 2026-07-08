# Module: Users

**Routers:** `backend/app/routers/users.py` (directory + activation), `backend/app/routers/invitations.py` (invite flow)  
**Schemas:** `backend/app/schemas/user.py`  
**Last verified:** 2026-07-02

---

## Overview

User management within a tenant. Admins can list users and toggle account activation. Self-registration and profile updates are handled in the Auth module (`modules/auth.md`). New staff/cleaner/server/outlet-admin accounts are provisioned exclusively via the invite flow (below) — there is no direct "create user" endpoint for admin-provisioned roles.

**Fixed 2026-07-02:** The admin "Manage Users" frontend page previously called `GET /users` and `PATCH /users/{id}/toggle`, but neither endpoint existed anywhere in the backend — the page silently failed on every load. `users.py` was added to close that gap. See `specs/decisions/rfcs/` history in `CHANGELOG.md` for the full defect writeup.

---

## Access

**Auth:** Required | **Roles:** Admin roles (`ADMIN_ROLES` — `outlet_admin`, `tenant_admin`, `food_court_admin`, `super_admin`, `platform_admin`) unless noted

---

## API Endpoints

### `GET /api/v1/users`

Lists all users belonging to the calling admin's tenant (`ctx.tenant_id`), most recently created first.

**Response `200`:** `list[UserResponse]`

```json
[
  {
    "user_id": "3fa85f64-...",
    "email": "staff1@bracu.scms",
    "full_name": "Ahmed Staff",
    "role": "staff",
    "tenant_id": "...",
    "outlet_id": null,
    "wallet_balance": "0.00",
    "reward_points": 0,
    "email_verified": true,
    "is_active": true,
    "created_at": "..."
  }
]
```

**Errors:** `403` if caller is not an admin role.

---

### `PATCH /api/v1/users/{user_id}/toggle`

Flips `user.is_active` (active → inactive, or inactive → active). A single endpoint, not separate activate/deactivate routes.

**Rules:**
- `user_id` must belong to the caller's tenant (`ctx.tenant_id`) → else `404 "User not found"` (cross-tenant existence is never revealed)
- An admin **cannot toggle their own account** → `400 "You cannot deactivate your own account"`

**Response `200`:** `UserResponse` (updated `is_active` reflected)

**Effect:** Deactivated users immediately fail `get_current_user()` on all subsequent requests. Existing JWTs are NOT individually blacklisted — deactivation takes effect within one token lifetime (up to 60 min), same trade-off as documented below.

---

## Staff Invitation Endpoints (`backend/app/routers/invitations.py`)

### `GET /api/v1/users/invite`

Lists invitations sent for the calling admin's tenant, most recently created first. Used by the "Invite Staff" admin page to show sent invitations across page loads/refreshes (previously tracked only in frontend session state and lost on refresh — fixed 2026-07-02).

**Response `200`:** `list[InvitationResponse]`
```json
[
  {
    "invite_id": "3fa85f64-...",
    "email": "newstaff@bracu.scms",
    "role": "staff",
    "expires_at": "2026-07-04T10:00:00Z",
    "accepted_at": null
  }
]
```

---

### `POST /api/v1/users/invite`

**Auth:** Required | **Roles:** Admin roles

**Request body:**
```json
{ "email": "newstaff@bracu.scms", "role": "staff" }
```

**Business logic:**
1. Reject with `402 Payment Required` if the tenant's subscription tier's `max_staff` cap
   (counting current `staff`/`server`/`cleaner` users) is already reached — see **PA-2/PA-3** in
   `modules/platform.md` (RFC-009).
2. Generate signed invitation token
3. Store in `staff_invitations` table with `expires_at = now() + 48h`
4. Send invitation email

**Response `201`:** `{ "invite_id": "...", "email": "...", "expires_at": "..." }`

---

### `POST /api/v1/users/accept-invite`

**Auth:** None (public)

**Request body:**
```json
{
  "token": "<invite_token>",
  "full_name": "New Staff Member",
  "password": "Staff@1234"
}
```

**Business logic:**
1. Validate token (exists, not expired, not already accepted)
2. Create user with invited role and tenant
3. Mark invitation as accepted

**Response `201`:** `Token`

---

## User Roles Reference

| Role | Assigned by | Self-registerable? |
|---|---|---|
| `platform_admin` | Manual (seed/admin) | No |
| `super_admin` | `platform_admin` | No |
| `outlet_admin` | `platform_admin` or `super_admin` | No |
| `tenant_admin` | `platform_admin` | No |
| `food_court_admin` | `platform_admin` | No |
| `staff` | Invite | No |
| `cleaner` | Invite | No |
| `server` | Invite | No |
| `outlet_admin` | Invite (also invitable, not just `platform_admin`) | No |
| `student` | Self-registration | Yes |
| `customer` | Self-registration | Yes |

> `_INVITABLE_ROLES` in `invitations.py`: `staff`, `cleaner`, `server`, `outlet_admin`. All other roles are assigned directly (seed/admin), not via invite.

---

## User Deactivation Behaviour

- Toggled via `PATCH /api/v1/users/{user_id}/toggle` (see above) — flips `is_active`
- `is_active = FALSE` causes `401` on all future requests (checked in `get_current_user()`)
- Existing JWTs for that user are NOT individually blacklisted
- This is an intentional trade-off: deactivation is effective within one token lifetime (up to 60 min)
- Phase 19 will add a mass-blacklist mechanism for immediate revocation

# Module: Users

**Router:** Inline in `auth.py` and planned `users.py`  
**Schemas:** `backend/app/schemas/user.py`  
**Last verified:** 2026-06-30

---

## Overview

User management within a tenant. Admins can list, activate, and deactivate users. Self-registration and profile updates are handled in the Auth module (`modules/auth.md`). Staff invitations are planned for Phase 21.

---

## Access

**Auth:** Required | **Roles:** Admin roles (all endpoints below unless noted)

---

## API Endpoints

### `GET /api/v1/users/`

Lists all users in the calling admin's tenant.

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
    "employee_id": "EMP-001",
    "wallet_balance": "0.00",
    "reward_points": 0,
    "email_verified": true,
    "is_active": true,
    "created_at": "..."
  }
]
```

---

### `PATCH /api/v1/users/{user_id}/activate`

Sets `user.is_active = True`.

**Rules:** User must belong to the admin's tenant.

**Response `200`:** `{ "is_active": true }`

---

### `PATCH /api/v1/users/{user_id}/deactivate`

Sets `user.is_active = False`.

**Rules:** User must belong to the admin's tenant.

**Response `200`:** `{ "is_active": false }`

**Effect:** Deactivated users immediately fail `get_current_user()` dependency on all subsequent requests. Existing tokens do not need to be blacklisted — the `is_active` check catches them.

---

## Planned Endpoints ❌ [Phase 21]

### `POST /api/v1/users/invite`

**Auth:** Required | **Roles:** Admin roles

**Request body:**
```json
{ "email": "newstaff@bracu.scms", "role": "staff" }
```

**Business logic:**
1. Generate signed invitation token
2. Store in `staff_invitations` table with `expires_at = now() + 48h`
3. Send invitation email

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
| `staff` | Invite (Phase 21) | No |
| `cleaner` | Invite (Phase 21) | No |
| `server` | Invite (Phase 21) | No |
| `student` | Self-registration | Yes |
| `customer` | Self-registration | Yes |

---

## User Deactivation Behaviour

- `is_active = FALSE` causes `401` on all future requests (checked in `get_current_user()`)
- Existing JWTs for that user are NOT individually blacklisted
- This is an intentional trade-off: deactivation is effective within one token lifetime (up to 60 min)
- Phase 19 will add a mass-blacklist mechanism for immediate revocation

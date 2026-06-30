# ADR-003: OTP Codes Stored in Redis (Not Database)

**Date:** 2026-01-25  
**Status:** Accepted  
**Deciders:** Mahadi Jubaer

---

## Context

SCMS uses 6-digit OTP codes for three flows:
1. Email verification at registration (purpose: `email_verification`)
2. Admin 2FA at login (purpose: `login`)
3. Password reset (purpose: `password_reset`) — planned Phase 19

An OTP code must:
- Expire after a fixed time (10 minutes)
- Be single-use (deleted on successful verification)
- Support attempt counting (max 5 attempts before invalidation)
- Be namespaced by purpose (login OTP cannot verify registration)

Options:
1. **Redis** — store as key with TTL
2. **Database** — store in an `otp_codes` table with `expires_at` column and a cleanup job

## Decision

Store OTP codes in Redis using the key pattern `otp:{purpose}:{email}` with TTL = 600 seconds.

Valid purposes:
- `email_verification` → key: `otp:email_verification:{email}`
- `login` → key: `otp:login:{email}`
- `password_reset` → key: `otp:password_reset:{email}` (Phase 19)

Value structure:
```json
{ "code": "482931", "attempts": 0 }
```

> **Critical:** The purpose string for email verification is `email_verification`, NOT `verification`. Using `otp:verification:{email}` is incorrect and will fail.

## Rationale

**Why Redis over database?**

| Requirement | Redis | Database |
|---|---|---|
| Automatic expiry | ✅ Built-in TTL | ❌ Requires cleanup job |
| Single-use deletion | ✅ `DEL key` | ✅ `DELETE WHERE id = ?` |
| Attempt counting | ✅ Update JSON value | ✅ `UPDATE SET attempts = attempts + 1` |
| Purpose namespacing | ✅ Built into key name | ✅ Column in table |
| Fast lookup | ✅ O(1) | ✅ Indexed lookup |

**The critical advantage is TTL.** Redis keys with TTL automatically expire — no cleanup job required. A DB-based approach would require a scheduled job to delete expired OTPs, adding operational complexity.

**Consistency:** Redis is already in the stack for JWT blacklisting and caching. Adding OTP storage to Redis does not add a new dependency.

## Consequences

**Positive:**
- OTPs auto-expire; no cleanup job needed
- Fast O(1) lookup by key
- No database table needed

**Negative:**
- If Redis is restarted without persistence, all active OTPs are lost
- Users in the middle of an OTP flow will need to request a new one
- Mitigation: Redis persistence (RDB snapshots) configured in production; OTPs regenerate in < 1 second

**Purpose namespacing:** `otp:email_verification:alice@bracu.ac.bd` and `otp:login:alice@bracu.ac.bd` are different keys. An OTP sent for login cannot be used for email verification. This is enforced by the key naming and by the `purpose` parameter on `/auth/verify-otp`.

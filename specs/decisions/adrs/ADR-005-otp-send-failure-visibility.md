# ADR-005: OTP Send-Failure Visibility Without Breaking Anti-Enumeration

**Date:** 2026-07-11
**Status:** Accepted
**Deciders:** Mahadi Jubaer

---

## Context

A production incident (reported by the user, no OTP email ever arrived during registration)
traced back to `.env` shipping unedited placeholder SMTP credentials
(`MAIL_USERNAME=your_email@gmail.com`, `MAIL_PASSWORD=your_app_password`). Because
`Settings.mail_enabled` only checks that both values are non-empty (not that they're valid), the
app believed SMTP was configured, attempted a real send, failed Gmail authentication, and — by
design — `POST /otp/send` swallows that failure and always returns `200` (see `modules/auth.md`,
BR: anti user-enumeration; an endpoint that returns a different status/message when the address
doesn't exist, or when delivery fails, leaks account existence to an attacker probing emails).

So the failure mode is real but was **completely invisible**: no error surfaced anywhere an
operator would see it before a user reported "I never got my code."

## Decision

1. Keep `POST /otp/send`'s external contract unchanged — always `200`, generic message, no
   distinction between "address doesn't exist" and "email failed to send." Weakening this to
   surface delivery failures to the caller would reintroduce the enumeration vulnerability ADR
   this endpoint was built to avoid; that trade is not worth it.
2. Add a **one-time SMTP connectivity + auth check at API startup**
   (`verify_mail_config()` in `backend/app/config/email.py`, invoked from `main.py`'s `lifespan`
   before the app starts serving). If `mail_enabled` is `True`, it performs a real
   `smtplib` connect + `STARTTLS`/SSL + `login()` (no message sent) and logs:
   - `INFO` on success ("SMTP check OK...")
   - `ERROR` on failure, with the exception detail, explicitly stating that OTP emails will
     silently fail to send until fixed, and that `/otp/send` will still return `200` regardless.
   - `WARNING` if `mail_enabled` is `False` at all (dev mode — OTPs are logged, not emailed).
3. This check is best-effort and **never raises** — a broken mail config must not prevent the API
   from starting, since OTP email was already fire-and-forget by design.

## Consequences

**Positive:**
- Misconfiguration (placeholder credentials, wrong port, revoked app password) is now visible in
  backend startup logs within seconds of deploy/restart, instead of only surfacing after a user
  complains.
- No change to the public API contract or its anti-enumeration guarantee.

**Negative:**
- Still requires an operator to actually look at startup logs — this is a logging improvement, not
  an alerting system. A future phase could wire this into a `/admin/health` endpoint or a metrics
  counter if silent-failure recurrence becomes a recurring problem.
- Adds ~1-5 seconds to API startup when mail is enabled (one blocking SMTP handshake, run via
  `asyncio.to_thread` so it doesn't block the event loop for other coroutines during that window).

**See also:** `operations/deployment.md` (`mail_enabled` trap section), `modules/auth.md` (OTP
send/verify business rules).

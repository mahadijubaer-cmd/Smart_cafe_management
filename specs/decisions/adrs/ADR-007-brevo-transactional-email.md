# ADR-007: Brevo Transactional Email API as Primary OTP/Invite Email Transport

**Date:** 2026-07-11
**Status:** Implemented
**Deciders:** Mahadi Jubaer

---

## Context

The SMTP-based email path (`fastapi-mail`, documented in ADR-005 and `operations/deployment.md`'s
`mail_enabled` trap) repeatedly failed in practice: `.env` shipped placeholder Gmail credentials,
and even after correction, raw SMTP (App Passwords, port/TLS settings, provider-specific quirks) is
a common source of delivery failures. The user obtained a Brevo transactional email API key and
asked for it to be wired in as the actual sender.

Brevo's HTTP API (`pip install brevo-python`, importable as `brevo`, v5.x — a Fern-generated SDK,
distinct from the older `sib_api_v3_sdk` package some older Brevo docs reference) sends email via a
single authenticated HTTPS call instead of an SMTP handshake, removing an entire class of
connectivity/auth failure modes (wrong port, STARTTLS negotiation, blocked SMTP ports on some
hosts).

## Decision

Add `BREVO_API_KEY` as a new setting (`backend/app/core/config.py`). `Settings.mail_provider`
resolves which transport `send_otp_email()`/`send_invite_email()` (`backend/app/config/email.py`)
actually use, in priority order:
1. **`brevo`** — if `BREVO_API_KEY` is set (send via `brevo.AsyncBrevo(...).transactional_emails.send_transac_email(...)`)
2. **`smtp`** — else if `MAIL_USERNAME`/`MAIL_PASSWORD` are set (existing `fastapi-mail` path, unchanged)
3. **`none`** — else, log the code instead of sending (existing dev-mode fallback, unchanged)

We did **not** delete the SMTP path. Keeping both means: (a) no regression for anyone who already
has working SMTP credentials, (b) the dev-mode log fallback (ADR-005's baseline) still works with
zero config, (c) Brevo is additive, not a forced migration. This costs one small `if/elif` branch in
`email.py`, not a real maintenance burden.

`verify_mail_config()` (the startup SMTP self-test added in ADR-005) now checks whichever provider
is actually active: for Brevo, it calls the lightweight `brevo.Brevo(...).account.get_account()`
endpoint (sync client, since this check already runs inside `asyncio.to_thread` from `main.py`'s
lifespan) to confirm the API key is valid and the account is reachable, logging the same
`ERROR`/`INFO`/`WARNING` pattern as the SMTP check.

**Sender email requirement:** Brevo requires the `sender` address on every transactional send to be
a verified sender (or verified domain) in that Brevo account's dashboard — an arbitrary
`MAIL_FROM` will be rejected by Brevo's API with a 400, unlike SMTP where the "From" header is
largely unchecked by the SMTP server itself. `MAIL_FROM`/`MAIL_FROM_NAME` are reused as the Brevo
sender identity; if Brevo's API rejects the send, the resulting error will explicitly mention an
unverified sender — check the Brevo dashboard's "Senders" section if that happens.

## Consequences

**Positive:**
- Removes SMTP-specific failure modes (port blocking, STARTTLS negotiation, App Password setup)
  for anyone using Brevo.
- No regression: SMTP and dev-log fallback paths are unchanged and still work standalone.

**Negative:**
- A third dependency (`brevo-python`) and a second real email-provider integration to maintain.
- Brevo's sender-verification requirement means the switch isn't purely a drop-in "add an API key
  and go" — the `MAIL_FROM` address must actually be verified in the Brevo account first, or sends
  will fail with a clear error (not a silent one — same visibility principle as ADR-005).
- `brevo-python` ships two incompatible generations under the same PyPI name: `1.x` (old
  `sib_api_v3_sdk`-style API) and `5.x` (a Fern-generated rewrite exposing `brevo.Brevo` /
  `brevo.AsyncBrevo` with a different call shape — what this integration is written against).
  `requirements.txt` **pins `brevo-python==5.0.1` exactly** to avoid silently resolving to the old
  1.x API on a fresh image build, which would break every import in `email.py`. `5.0.1` requires
  `pydantic-core>=2.18.2`, incompatible with the previously-pinned `pydantic==2.5.0` — repinned to
  `pydantic==2.13.4` in the same change (confirmed compatible with `pydantic-settings==2.1.0` and
  the rest of the app via `docker compose build` + a clean container recreate).
- **Operational gotcha hit while deploying this change:** `docker compose restart <service>` does
  **not** re-read `.env` — `env_file:` in `docker-compose.yml` is only applied when a container is
  *created*, not on restart of an existing one. Editing `.env` (or `requirements.txt`, requiring an
  image rebuild) requires `docker compose build <service>` (if dependencies changed) followed by
  `docker compose up -d --force-recreate <service>`, not just `restart`. Documented in
  `operations/deployment.md` so this doesn't cost another debugging cycle next time.

## Verified

Confirmed working end-to-end on 2026-07-11: startup check logged `Brevo check OK`; a live
`POST /otp/send` call returned Brevo API `201 Created`; cross-checked against Brevo's own
`GET /v3/smtp/email` log, which showed the message accepted with a real `message_id` from Brevo's
sending infrastructure (`smtp-relay.mailin.fr`).

**See also:** `operations/deployment.md` (env var table + Brevo setup notes), ADR-005 (the SMTP
self-test pattern this reuses), `modules/auth.md` (OTP send/verify business rules, unaffected by
transport choice).

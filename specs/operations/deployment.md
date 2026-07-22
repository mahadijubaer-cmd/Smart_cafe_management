# Deployment & Configuration

**Last verified:** 2026-07-11

---

## `.env` changes require a container recreate, not just a restart

`docker-compose.yml`'s `env_file: .env` is applied only when a container is **created** — the
values are baked into that container's environment at creation time. `docker compose restart
<service>` restarts the process inside the *existing* container and does **not** re-read `.env`.
After editing `.env`:
```
docker compose up -d --force-recreate <service>
```
If `requirements.txt` also changed (new/updated Python dependency), rebuild the image first:
```
docker compose build <service> && docker compose up -d --force-recreate <service>
```
A plain `docker compose restart` will silently keep running on the old environment — this cost a
debugging cycle while wiring up ADR-007 (Brevo), where `BREVO_API_KEY` kept appearing unset in logs
despite being present in `.env`, because only `restart` had been run.

---

## Environment Variables

### Backend (`backend/.env`)

All values read via `backend/app/core/config.py` using `pydantic-settings`.

| Variable | Type | Example / Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | str | `postgresql+asyncpg://scms:scms@localhost:5432/scms_db` | Async PG driver required |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | str/int/int | `redis` / `6379` / `0` | Used to build `redis_url` when `REDIS_URL` is unset |
| `REDIS_URL` | str | — | Full override, e.g. Upstash's `rediss://default:<password>@host:port` — takes priority over `REDIS_HOST`/`REDIS_PORT`/`REDIS_DB` (added 2026-07-19; those three alone can't express a password or TLS scheme, which Upstash requires) |
| `SECRET_KEY` | str | 64-char random hex | JWT signing key (HS256) |
| `ALGORITHM` | str | `HS256` | Do not change |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `60` | 1 hour token lifetime |
| `CORS_ORIGINS` | list[str] | `["http://localhost:3000"]` | Must match frontend origin |
| `MAIL_USERNAME` | str | — | SMTP username (fastapi-mail) |
| `MAIL_PASSWORD` | str | — | SMTP password |
| `MAIL_FROM` | str | — | Sender address |
| `MAIL_PORT` | int | `587` | SMTP port |
| `MAIL_SERVER` | str | — | SMTP host |
| `MAIL_STARTTLS` | bool | `true` | — |
| `MAIL_SSL_TLS` | bool | `false` | — |
| `USE_CREDENTIALS` | bool | `true` | — |
| `BREVO_API_KEY` | str | — | Brevo transactional email API key (`xkeysib-...`). See ADR-007 — takes priority over SMTP when set. |
| `ENCRYPTION_KEY` | str | — | RFC-011/ADR-015. Fernet key encrypting per-tenant payment-gateway credentials at rest. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. **Required before any tenant can save gateway credentials** — saving fails loudly (not silently) if unset. Losing/rotating this key makes existing stored credentials undecryptable; re-enter them after a rotation. |
| `B2_ENDPOINT_URL` | str | — | Backblaze B2 S3-compatible endpoint, e.g. `https://s3.us-west-004.backblazeb2.com` |
| `B2_KEY_ID` | str | — | B2 application key ID |
| `B2_APPLICATION_KEY` | str | — | B2 application key secret |
| `B2_BUCKET_NAME` | str | — | B2 bucket for tenant logos / menu item images |
| `B2_PUBLIC_URL_BASE` | str | — | Public base URL for the bucket, e.g. `https://f005.backblazeb2.com/file/scms-media` |

> `SECRET_KEY` must be set in production — never use a weak key. Generate with: `openssl rand -hex 32`

> **Brevo (ADR-007):** Setting `BREVO_API_KEY` switches `send_otp_email()`/`send_invite_email()` to
> Brevo's HTTPS API instead of SMTP — `Settings.mail_provider` resolves to `brevo` whenever this key
> is non-empty, regardless of whether `MAIL_USERNAME`/`MAIL_PASSWORD` are also set. **Brevo requires
> the `MAIL_FROM` address to be a verified sender in that Brevo account's dashboard** (Senders &
> IPs → Senders) — an unverified `MAIL_FROM` will make every send fail with a 400 from Brevo's API,
> visible in the startup `verify_mail_config()` check and in per-request logs, same as the SMTP
> failure mode in ADR-005. The installed package is `brevo-python` (PyPI name) but imports as
> `brevo` (a Fern-generated v5.x SDK — not the older `sib_api_v3_sdk` some Brevo docs still
> reference). Note: installing it bumped `pydantic` past the version pinned in
> `backend/requirements.txt` (2.5.0 → 2.13.4 resolved) as a transitive dependency; the app imports
> fine on the newer version but the pin itself hasn't been updated to match yet.

> **`mail_enabled` trap (see ADR-005):** `Settings.mail_enabled` (`backend/app/core/config.py`) is
> `bool(MAIL_USERNAME and MAIL_PASSWORD)` — it only checks that both are **non-empty strings**, not
> that they're real, working credentials. The shipped `.env.example` (and any `.env` copied from it
> without editing) ships **non-empty placeholder values**
> (`MAIL_USERNAME=your_email@gmail.com` / `MAIL_PASSWORD=your_app_password`). Leaving those in place
> makes `mail_enabled` evaluate `True`, so the app skips its "log the OTP instead of emailing it" dev
> fallback and instead attempts a real SMTP send that fails Gmail authentication — silently, because
> `POST /otp/send` always returns `200` by design (BR: anti user-enumeration) regardless of whether
> the email actually left the server. **You must replace both placeholder values with a real SMTP
> account** (a Gmail account + [App Password](https://myaccount.google.com/apppasswords), or a
> [Mailtrap](https://mailtrap.io) sandbox for local dev — see the commented-out `MAIL_SERVER`/
> `MAIL_PORT` alternative in `.env.example`) before any OTP flow (registration email verification,
> admin login 2FA, password reset) will actually deliver email. As of Phase 25, the API also runs a
> one-time SMTP connectivity+auth check at startup (`verify_mail_config()` in
> `backend/app/config/email.py`, called from `main.py`'s `lifespan`) that logs a clear `ERROR` line
> if `mail_enabled` is `True` but the credentials don't actually work — check backend startup logs
> if OTP emails aren't arriving.

> **Payment gateway sandbox credentials (RFC-011), no real merchant account needed to test:**
> SSLCommerz publishes a public sandbox merchant account usable by anyone —
> `store_id=testbox`, `store_password=qwerty` (sandbox base URL
> `https://sandbox.sslcommerz.com`). bKash publishes sandbox developer credentials in their own
> Tokenized Checkout docs (base URL `https://tokenized.sandbox.bka.sh/v1.2.0-beta`). Enter either
> in a tenant's new Payment Settings admin page with "Sandbox mode" left on — this exercises the
> real gateway API end-to-end without needing the tenant's own real business credentials. Each
> tenant's real merchant credentials (once they have one) replace the sandbox values in the same
> UI with no code change.

### Frontend (`frontend/.env.local`)

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Backend base URL for API calls |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | WebSocket base URL |
| `NEXT_PUBLIC_DEFAULT_SLUG` | `bracu` | Redirect target at root `/` |
| `NEXT_PUBLIC_TENANT_ID` | BRACU tenant UUID | Used for seeded BRACU tenant |

---

## Docker Setup

### Development (`docker-compose.yml`)

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: scms
      POSTGRES_PASSWORD: scms
      POSTGRES_DB: scms_db
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    depends_on: [db, redis]
    env_file: ./backend/.env
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    depends_on: [backend]
    env_file: ./frontend/.env.local
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
    command: npm run dev
```

### Production differences

- Remove volume mounts (no code hot-reload)
- Set `NODE_ENV=production`
- Run `npm run build && npm start` for frontend
- Remove `--reload` from uvicorn
- Add `--workers 4` to uvicorn
- Use HTTPS/WSS — update `CORS_ORIGINS` and `NEXT_PUBLIC_WS_URL`
- Use a managed DB service (AWS RDS, Supabase, etc.)

### Production compose contract (✅ fixed 2026-07-16 — first real end-to-end pass)

`docker-compose.prod.yml` had never been exercised end-to-end (daily dev runs `docker-compose.yml`
/ `next dev`). Preparing the single-VM public deployment surfaced four defects, all fixed:

1. **`NEXT_PUBLIC_*` must be build args, not runtime env.** Next.js inlines `NEXT_PUBLIC_*` (and
   this app's `next.config.js` `env:` block) into the client bundle **at `next build` time**. The
   prod compose passed them only as runtime `environment:` on the `frontend` service, while the
   image's final `runner` stage serves a bundle compiled in the `builder` stage with those vars
   unset — so every deployed client silently fell back to `http://localhost:8000/api/v1` /
   `ws://localhost:8000` regardless of `SERVER_HOST`. The Dockerfile `builder` stage now declares
   `ARG NEXT_PUBLIC_API_URL` / `ARG NEXT_PUBLIC_WS_URL` (exported as `ENV` before `npm run build`)
   and the compose file supplies them via `build.args`. **Rule: any new `NEXT_PUBLIC_*` var must be
   added to BOTH the Dockerfile builder args and the compose `build.args` — runtime `environment:`
   alone does nothing for client code in the standalone image.**
2. **`NEXT_PUBLIC_WS_URL` carries NO `/ws` suffix.** `useWebSocket.ts` appends `/ws/{user_id}`
   itself; the dev compose correctly sets `ws://localhost:8001`. The prod compose had
   `ws://${SERVER_HOST}:8000/ws`, which would produce `/ws/ws/{id}` → every WS connect 403s.
   Corrected to `ws://${SERVER_HOST}:8000`.
3. **`tsconfig.json` excludes `**/__tests__/**`.** The three test files reference jest globals with
   no jest types installed; `next dev` and baseline `tsc` runs tolerated it, but `next build`
   (which the prod image runs) fails the type-check outright.
4. **Hardening:** `postgres` no longer publishes `5432` to the host (backend reaches it on the
   compose network), and pgAdmin binds to loopback (`127.0.0.1:5050`) — reachable on a VM only via
   SSH tunnel (`ssh -L 5050:localhost:5050`). Neither may be re-exposed publicly.

`.env.example` corrections (same date): removed `PLATFORM_NAME` and `MEDIA_DIR` — pydantic
`Settings` **rejects unknown keys**, so a `.env` copied from the example crashed the backend at
startup (the real key is `MEDIA_ROOT`); added the missing `BREVO_API_KEY` (the active mail
provider per ADR-007) and `FRONTEND_URL` (baked into table-QR payloads; the code default is a
placeholder domain that must be overridden in production).

### TLS / reverse proxy (added 2026-07-19 — free single-VM hosting)

`docker-compose.prod.yml` gained a `caddy` service (image `caddy:2-alpine`) as the sole public
entrypoint, so the plan is to host on a single free-tier VM (e.g. Oracle Cloud Always Free) behind
a free DNS hostname (e.g. DuckDNS) with automatic Let's Encrypt TLS — no managed load balancer or
CDN in front.

- `backend` (`8000`) and `frontend` (`3000`) no longer publish host ports — only `caddy` binds
  `80`/`443`. This follows the same hardening pattern already used for `postgres` (network-only)
  and `pgadmin` (loopback-only).
- Root `Caddyfile` proxies `/api/*` and `/ws/*` to `backend:8000` and everything else to
  `frontend:3000`, using `{$SERVER_HOST}` (from `.env`, via `env_file` on the `caddy` service) as
  the site address — Caddy requests/renews the cert for that hostname automatically on first
  request, no certbot cron needed.
- Because Caddy now terminates TLS, the frontend's build-time `NEXT_PUBLIC_API_URL` /
  `NEXT_PUBLIC_WS_URL` args changed from `http://${SERVER_HOST}:8000/...` /
  `ws://${SERVER_HOST}:8000` to `https://${SERVER_HOST}/api/v1` / `wss://${SERVER_HOST}` — no
  port, since 443 is the only public port. `SERVER_HOST` in `.env` must be the real public
  hostname (e.g. `scms-bracu.duckdns.org`) for both Caddy's TLS cert and these build args to
  resolve correctly; the `localhost` default only works for a same-machine smoke test.
- Not yet done: Brevo account creation/sender verification (needed for OTP/invite email to
  actually deliver — the code path has been ready since ADR-007), and off-VM Postgres/media
  backups. Both are operator setup steps, not code changes.

### Object storage for logos / menu images (added 2026-07-19 — card-free hosting revision)

The single-VM plan above assumed local disk under `MEDIA_ROOT` persists forever, which it does
on a VM's own disk. That assumption breaks on host platforms with an ephemeral filesystem (e.g.
Render's free web service, which wipes local disk on every restart/redeploy/sleep-wake) — the
free-hosting plan pivoted to those after discovering the VM route needs a credit card that isn't
available.

- New `backend/app/services/storage_service.py`: `save_public_file(subdir, filename, contents,
  content_type)` uploads to Backblaze B2 (S3-compatible, via `boto3`) when `Settings.b2_enabled`
  is true, else falls back to writing under `MEDIA_ROOT` and returning a `/media/...` path
  served by the existing `StaticFiles` mount — same fallback shape as `mail_provider`
  (Brevo → SMTP → none) in `app/core/config.py`. Local dev/CI need zero setup; only
  `.env`/Render's dashboard needs the five `B2_*` vars set in production.
- Used by exactly two upload routes: `POST /tenants/me/logo` (`routers/tenants.py`) and
  `POST /menu/items/{item_id}/image` (`routers/menu.py`). Both previously wrote directly to
  `MEDIA_ROOT` with `Path.write_bytes()`.
- **QR codes were deliberately left untouched.** `services/qr_service.py`'s order-QR flow
  writes the PNG to disk and reads it back to email as an attachment within the same request
  (`routers/orders.py`); table QR codes and guest-tracking QR codes are generated fully
  in-memory and never touch disk at all. None of the three paths re-read a file in a later
  request, so an ephemeral filesystem never actually loses anything they depend on.
- New dependency: `boto3==1.34.144` in `backend/requirements.txt`.

---

### Migration chain was never runnable end-to-end from empty (fixed 2026-07-19)

`alembic upgrade head` had never actually been exercised against a genuinely empty database
before provisioning Neon for the card-free hosting plan — dev has always been built via
`Base.metadata.create_all()`, and the one prior alembic verification (see "Alembic was never
actually runnable" above) only tested incremental migrations 0006/0007 against an
already-`create_all()`-built dev DB. Running the full chain from empty on Neon surfaced six
real, previously-latent bugs across four migration files, all now fixed:

1. **Enum double-CREATE TYPE (`0001`, `0003`, `0004`).** Pattern: a migration explicitly
   calls `enum.create(bind)`, then reuses the same (or a separately-constructed) enum object
   as a column type inside `op.create_table(...)`. SQLAlchemy's postgres dialect
   auto-re-issues `CREATE TYPE` on `before_create` for any embedded enum column unless
   `create_type=False` is set on that exact object — so the type gets created twice and the
   second attempt fails with `DuplicateObject: type "x" already exists`. Fixed in `0001`
   (7 enums) and `0003` (2 enums, plus reusing the same object as the column type instead of
   a separate `sa.Enum(name=...)` reference — a bare reference like that doesn't reliably
   inherit `create_type=False` from the explicitly-created object, since it's a different
   Python instance). `0004`'s three enums already had `create_type=False` set but on generic
   `sa.Enum(...)` rather than `postgresql.ENUM(...)` — the postgres-dialect class is required
   for the flag to be honored through dialect adaptation; generic `sa.Enum` silently drops it
   in this SQLAlchemy version (2.0.23). `0009`'s two enums were never affected — each is only
   ever created once (no explicit `.create()` call preceding the embedded column use), so
   there's no double-creation to trigger.
2. **`op.bulk_insert()` needs a table construct, not a bare string (`0002`).** Passing
   `'categories'` (a str) as the first argument fails with `AttributeError: 'str' object has
   no attribute 'insert'`. Fixed by building lightweight `sa.table(name, sa.column(...), ...)`
   constructs for `categories`, `tables_map`, and `users` and passing those instead — the
   standard alembic idiom for seed-data migrations. Column types on these ad-hoc tables are
   advisory only (affect literal binding, not DDL); the real column types already exist from
   migration `0001`.
3. **`passlib==1.7.4` + `bcrypt>=4.1` is broken (`0002`).** `CryptContext(schemes=["bcrypt"])`
   fails on `.hash()` with `ValueError: password cannot be longer than 72 bytes` — actually a
   symptom of passlib's internal `detect_wrap_bug` self-test choking on newer bcrypt (which
   removed the `__about__.__version__` attribute passlib reads). Fixed by switching this
   migration's seed users to `pbkdf2_sha256`, matching `app/services/auth_service.py`'s
   actual scheme — the app was never actually broken (it never used bcrypt), but this
   migration's seeded password hashes would have been unverifiable by the real login flow
   even if the migration had "succeeded," since the algorithms wouldn't match.
4. **Missing `uuid-ossp` extension (`0004`).** `uuid_generate_v4()` is used as a
   `server_default` starting in `0004` (and again in `0005`/`0008`/`0009`) but no migration
   ever runs `CREATE EXTENSION "uuid-ossp"` — it must have only ever worked because it was
   enabled by hand on the original dev database, outside the migration chain. Fixed by adding
   `op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')` at the top of `0004`'s
   `upgrade()`, the first migration that needs it.

Verified by running the full chain against a real, empty Neon database: all 9 revisions apply
cleanly, `alembic_version` lands on `0009`, 28 tables created, seed data present (5 categories,
6 staff/cleaner users, BRACU tenant).

### Neon pooled endpoint requires `statement_cache_size=0` (fixed 2026-07-19)

Deploying to Render surfaced a production-only bug: `/api/v1/health` returned `200`, but any
route touching the database (e.g. `GET /tenants/public`) returned a bare `500` — `DEBUG=false`
in production hides the real traceback from the client, so this took process-of-elimination to
diagnose rather than reading a stack trace.

**Root cause:** asyncpg caches prepared statements client-side by default. Neon's pooled
(`-pooler`) endpoint fronts Postgres with PgBouncer in transaction-pooling mode, which can swap
the real backend Postgres process between queries on what SQLAlchemy considers one logical
connection — once Render's long-running process built up a real connection pool across multiple
requests, a prepared statement cached against one backend became invalid on the next. **Not
reproducible locally** even via a script that reused the same `AsyncSessionLocal` factory 5
times in a loop against the same pooled Neon URL — it only actually manifested under Render's
real deployment and connection-pool lifecycle.

**Fix:** `Settings.database_connect_args` (`backend/app/core/config.py`) now always includes
`statement_cache_size: 0`, disabling asyncpg's prepared-statement cache unconditionally. Safe
against a direct (non-pooled) connection too — the only cost is re-preparing statements on every
query, negligible at this app's traffic. Live-verified fixed by polling the real Render endpoint
after redeploy until it returned `200` with correct data.

**Also learned deploying to Render:**
- Render injects its own `$PORT` env var and expects the process to bind to it — the
  Dockerfile's hardcoded `--port 8000` won't bind to Render's assigned port, and the deploy
  fails with "no open ports detected." Start Command must be overridden to
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Root Directory must be `backend` — `Dockerfile` only exists at `backend/Dockerfile`, not the
  repo root; leaving Root Directory unset fails the build with
  `failed to read dockerfile: open Dockerfile: no such file or directory`.
- The rate limiter (`slowapi`, `backend/app/core/limiter.py`) uses in-memory storage
  unconditionally — `Limiter(key_func=get_remote_address)` has no `storage_uri`. This project's
  own "Redis storage backend recommended for multi-worker" note below was never actually
  implemented; ruled out as a red herring while debugging the 500 above, not yet fixed.

### `tables_map` PK sequence left behind by seed migration (found & fixed live, 2026-07-21)

Live production bug: creating a table (`POST /tables/`) 500'd for **every** restaurant-segment
tenant, immediately on their very first "Add Table" — found while testing an unrelated frontend
feature (single-table QR download) against a freshly self-registered test tenant. The browser
reported it as a CORS failure (`No 'Access-Control-Allow-Origin' header`), which was a red
herring: FastAPI's CORS middleware only attaches CORS headers to responses it actually handles,
so an unhandled `500` reaches the browser with no CORS header at all and gets misreported as a
CORS block instead of a server error.

**Root cause:** `0002_seed_data.py`'s `upgrade()` bulk-inserts 30 rows into `tables_map` with
explicit `table_id` values (`1`–`30`, a 6×5 demo grid for BRACU) via `op.bulk_insert()`, which
bypasses `tables_map_table_id_seq` entirely — the sequence is never advanced to match. Every
real `INSERT` through the app relies on `nextval()` for `table_id` and had nothing to do with
the seed data's explicit IDs, so the sequence stayed at its initial value (`3`, from whatever
number of `nextval()` calls happened during earlier local testing before the seed migration ran
against Neon) while 30 real rows already occupied IDs 1–30. Confirmed directly: querying
`SELECT last_value FROM tables_map_table_id_seq` (`3`) against `SELECT MAX(table_id) FROM
tables_map` (`30`) on the live Neon database, then reproducing the exact failure with a raw
`INSERT ... RETURNING table_id` — `UniqueViolationError: duplicate key value ... table_id=3`.
`categories` and `inventory_categories` were checked too and were **not** affected (their seed
paths don't assign explicit PKs, so their sequences stayed in sync).

**Fixed two ways:**
1. **Live, immediately:** `SELECT setval('tables_map_table_id_seq', (SELECT MAX(table_id) FROM
   tables_map))` against the production Neon database — safe and idempotent, only moves the
   sequence pointer, touches no rows. Verified fixed by creating a real table through the
   deployed frontend immediately after.
2. **In the migration source**, so a fresh database (disaster recovery, a new contributor, CI)
   doesn't hit this on its very first real `INSERT`: `0002_seed_data.py` now runs the same
   `setval(...)` call right after the `tables_map` `bulk_insert()`.

**How to apply:** any future seed/fixture migration that `bulk_insert()`s explicit integer PKs
into a `SERIAL`/`IDENTITY` column must re-sync that column's sequence in the same migration —
this is a generic Postgres gotcha (`bulk_insert`/raw `INSERT` with explicit PKs never touches
the sequence), not specific to `tables_map`. Grep for `sa.column('.*_id'` bulk-insert constructs
if this class of bug is ever suspected elsewhere.

---

## Database Migration Workflow (Alembic)

```
backend/
  alembic/
    versions/          ← migration files
    env.py             ← async config using asyncpg
    script.py.mako     ← template
  alembic.ini          ← points to DATABASE_URL
```

### Commands

```bash
# Create a new migration
cd backend
alembic revision --autogenerate -m "add_invite_table"

# Apply all pending migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1

# View current revision
alembic current

# View history
alembic history
```

### Rules

1. **Always create a migration before changing the DB schema** — alembic revision before any model change
2. **Review autogenerated migrations** — autogenerate can miss things (e.g., enum changes, index changes)
3. **Never edit applied migrations** — create a new revision instead
4. **Migrations run in CI** before tests — `alembic upgrade head` in CI setup step

---

## Seed Scripts

### Platform Admin Seed

```bash
cd backend
python -m app.scripts.seed_admin
```

Creates the `platform_admin` user if not exists. Reads email/password from env:
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

### BRACU Tenant Seed

```bash
python -m app.scripts.seed_bracu
```

Creates the BRACU tenant with:
- `slug = "bracu"`
- `tenant_type = academic`
- `allowed_email_domain = @g.bracu.ac.bd`

This is the default tenant. UUID is seeded and should match `NEXT_PUBLIC_TENANT_ID`.

### Full Dev Seed

```bash
python -m app.scripts.seed_dev
```

Seeds: BRACU tenant + sample users (admin, staff, student, cleaner) + sample menu items + sample inventory items.

---

## Startup Sequence (Dev)

```bash
# 1. Start infrastructure
docker compose up db redis -d

# 2. Install backend deps
cd backend
pip install -r requirements.txt

# 3. Run migrations
alembic upgrade head

# 4. Seed data
python -m app.scripts.seed_dev

# 5. Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 6. Install frontend deps (separate terminal)
cd frontend
npm install

# 7. Start frontend
npm run dev
```

---

## Rate Limiting

**Library:** slowapi (wraps starlette)

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 10/minute per IP |
| `POST /auth/register` | 5/minute per IP |
| `POST /auth/request-otp` | 3 per 10 minutes per IP |

Rate limit storage backend: in-memory (dev) / Redis (prod recommended for multi-worker).

---

## CORS Configuration

```python
# backend/app/main.py
origins = settings.CORS_ORIGINS  # e.g. ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Logging

- Backend: Python `logging` module; `INFO` level by default
- Structured log format: `[timestamp] [level] [module]: message`
- No log rotation configured in dev — configure logrotate or cloud logging in prod

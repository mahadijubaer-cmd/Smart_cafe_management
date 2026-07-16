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
| `REDIS_URL` | str | `redis://localhost:6379/0` | Used for cache + pub/sub |
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

# Spec 09 — Deployment & Environment

**Last updated:** 2026-06-30  
**Status:** Authoritative

---

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in all required values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | `postgresql+asyncpg://user:pass@host:5432/dbname` |
| `POSTGRES_USER` | Yes | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `POSTGRES_DB` | Yes | — | Database name |
| `REDIS_URL` | Yes | — | `redis://host:6379/0` |
| `SECRET_KEY` | Yes | — | JWT signing key — min 32 chars; generate: `openssl rand -hex 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `1440` | Token lifetime (default: 24 hours) |
| `CORS_ORIGINS` | Yes | — | JSON array: `["http://localhost:3000"]` |
| `SMTP_HOST` | Yes | — | SMTP server hostname |
| `SMTP_PORT` | Yes | — | SMTP port (typically 587 for TLS) |
| `SMTP_USERNAME` | Yes | — | SMTP auth username |
| `SMTP_PASSWORD` | Yes | — | SMTP auth password |
| `SMTP_FROM_EMAIL` | Yes | — | Sender address, e.g. `no-reply@scms.io` |
| `MEDIA_ROOT` | No | `/app/media` | Directory for uploads and QR code PNGs |
| `SERVER_HOST` | No | `http://localhost:8000` | Public base URL — used in QR code links |
| `DEBUG` | No | `false` | FastAPI debug mode — NEVER `true` in production |
| `ENVIRONMENT` | No | `development` | `development` or `production` |
| `PGADMIN_EMAIL` | Prod only | — | pgAdmin login email |
| `PGADMIN_PASSWORD` | Prod only | — | pgAdmin login password |
| `NEXT_PUBLIC_API_URL` | Yes (frontend) | `http://localhost:8000` | Backend URL accessible from browser |
| `NEXT_PUBLIC_WS_URL` | Yes (frontend) | `ws://localhost:8000` | WebSocket URL accessible from browser |

> **Security:** Never commit `.env` to version control. It is listed in `.gitignore`.  
> For SMTP in development, use [Mailtrap](https://mailtrap.io) — free sandbox that catches all emails without actually sending them.

---

## 2. Development Setup

```bash
# 1. Clone and enter project
cd Smart_cafe_management

# 2. Copy and edit environment file
cp .env.example .env

# 3. Start all services (postgres, redis, backend, frontend)
docker compose up -d

# 4. Run database migrations
docker compose exec backend alembic upgrade head

# 5. Seed platform tenant
docker compose exec backend python -m scripts.seed_platform

# 6. Seed demo credentials (Section 23.3 users)
docker compose exec backend python -m scripts.seed_demo

# 7. Access
#    API interactive docs:  http://localhost:8000/docs
#    Frontend:              http://localhost:3000
#    API health:            http://localhost:8000/api/v1/health
```

---

## 3. Development Docker Compose (`docker-compose.yml`)

Services:

| Service | Port | Notes |
|---|---|---|
| `postgres` | 5432 | Volume: `scms_postgres_data` |
| `redis` | 6379 | Volume: `scms_redis_data` |
| `backend` | 8000 | `uvicorn app.main:app --reload`; source mounted |
| `frontend` | 3000 | `npm run dev`; source mounted |

Hot reload is enabled for both backend (via `--reload`) and frontend (via Next.js dev server file watching).

---

## 4. Production Docker Compose (`docker-compose.prod.yml`)

Services:

| Service | Host Port | Notes |
|---|---|---|
| `postgres` | internal only | Healthcheck: `pg_isready`; volume: `scms_postgres_data` |
| `redis` | internal only | Healthcheck: `redis-cli ping`; volume: `scms_redis_data` |
| `pgadmin` | 5050 | dpage/pgadmin4; volume: `scms_pgadmin_data` |
| `backend` | 8000 | `uvicorn app.main:app --workers 4`; NO `--reload`; `DEBUG=false` |
| `frontend` | 3000 | `NODE_ENV=production`; no source mount |

Named volumes: `scms_postgres_data`, `scms_redis_data`, `scms_media`, `scms_pgadmin_data`

**Key differences from dev:**
- No `--reload` flag on backend (production-safe)
- `--workers 4` for concurrent request handling
- `DEBUG=false`, `ENVIRONMENT=production`
- No source volume mounts (image is baked at build time)
- pgAdmin exposed for database administration

---

## 5. Production Deployment Steps

```bash
# 1. Build images
docker compose -f docker-compose.prod.yml build

# 2. Start services
docker compose -f docker-compose.prod.yml up -d

# 3. First deploy only: run migrations + seed
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
docker compose -f docker-compose.prod.yml exec backend python -m scripts.seed_platform
docker compose -f docker-compose.prod.yml exec backend python -m scripts.seed_demo

# 4. Access pgAdmin at http://your-server:5050
#    Add server: host=postgres, port=5432, user=$POSTGRES_USER, pass=$POSTGRES_PASSWORD

# 5. Verify
curl http://your-server:8000/api/v1/health
```

---

## 6. Running Migrations

```bash
# Apply all pending migrations
docker compose exec backend alembic upgrade head

# Create a new migration after model changes
docker compose exec backend alembic revision --autogenerate -m "describe_the_change"

# View migration history
docker compose exec backend alembic history

# Downgrade one step (use with care)
docker compose exec backend alembic downgrade -1
```

> **Rule:** Never edit the database schema directly. Always use Alembic migrations.  
> Always update `docs/spec/02-data-model.md` before writing the migration.

---

## 7. Seed Scripts

### `scripts/seed_platform.py`
Creates the initial `platform` tenant and base configuration.  
Should be run once on first deployment.

### `scripts/seed_demo.py`
Creates the 11 demo users from Section 23.3 of the master documentation, across 7 tenants.  
Idempotent — safe to re-run.

**Demo tenants created:**
| Tenant | Slug | Type |
|---|---|---|
| BRACU Cafeteria | `bracu` | academic |
| Testy Treat (brand) | `testy-treat` | franchise_brand |
| Testy Treat Gulshan | `testy-treat-gulshan` | franchise_outlet |
| Unimart Food Hall | `unimart-hall` | food_court |
| Burger Joint | `unimart-burger` | food_court_vendor |
| Sushi Bar | `unimart-sushi` | food_court_vendor |

**Demo credentials** — see `docs/spec/10-testing.md` → Section 4 (Demo Credentials).

---

## 8. Static Files

Uploaded images and generated QR codes are stored in `MEDIA_ROOT` (default `/app/media/`).  
The FastAPI app mounts this directory at `/media` as a static file server.  
In production, a Nginx reverse proxy (not currently configured) should serve `/media` directly for performance.

Directory structure under `MEDIA_ROOT`:
```
/app/media/
├── qr_codes/          # Generated table and order QR PNGs
└── logos/             # Uploaded tenant logos (Phase 15)
```

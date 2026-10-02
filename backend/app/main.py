import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
import logging

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.limiter import limiter
from app.core.redis import get_redis, close_redis
from app.config.email import verify_mail_config
from app.middleware.tenant import TenantContextMiddleware
from app.routers import auth, menu, orders, tables, cleaners, payments, analytics, websocket
from app.routers import tenants, otp, inventory, qr, memo, receipts, food_court
from app.routers import notifications, invitations, users, public, platform
from app.routers import devices, device_api, signage, kiosk_config
from app.routers import payment_gateways

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────
    logger.info("Starting SCMS API v3.1.0 ...")

    # Ensure media directories exist at startup
    media_root = Path(settings.MEDIA_ROOT)
    (media_root / "qr_codes").mkdir(parents=True, exist_ok=True)
    (media_root / "logos").mkdir(parents=True, exist_ok=True)
    logger.info("Media directory ready: %s", media_root)

    logger.info("Initialising database tables...")
    async with engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database ready.")

    # One-time data correction, self-applying on every boot since this environment has no
    # reliable way to run a one-off shell/migration command against it: BRACU was seeded
    # (migration 0003) with allowed_email_domain='@g.bracu.ac.bd', restricting self-registration
    # to that domain. Product decision (2026-09-22): open BRACU registration to any email.
    # Idempotent — only writes when the value still needs clearing, safe to leave in.
    from sqlalchemy import select
    from app.models.tenant import Tenant
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Tenant).where(Tenant.slug == "bracu"))
        bracu = result.scalar_one_or_none()
        if bracu is not None and bracu.allowed_email_domain is not None:
            bracu.allowed_email_domain = None
            await session.commit()
            logger.info("Cleared BRACU tenant's allowed_email_domain restriction.")

        # Same self-applying pattern: the migration-0002-seeded staff/cleaner accounts
        # (staff1@bracu.ac.bd etc, password "password123") don't actually authenticate in
        # production (found 2026-09-22 — login returns "Invalid credentials" against real
        # prod data despite matching the migration source), and admin/staff/cleaner roles
        # can't self-register (BR-REG-1). Ensure one known-working account per role exists,
        # scoped to BRACU only. Passwords come from env vars, never hardcoded here — an empty
        # value means "don't create that account". Staff/cleaner accounts are created
        # only if missing; the designated demo admin is reconciled with its env password.
        if bracu is not None:
            from app.models.models import User
            from app.models.user import UserRole
            from app.services.auth_service import AuthService

            _auth = AuthService()
            _demo_accounts = [
                ("mahadi.jubaer@g.bracu.ac.bd", "BRACU Tenant Admin", UserRole.tenant_admin, settings.BRACU_DEMO_ADMIN_PASSWORD),
                ("staff1@bracu.scms", "BRACU Staff", UserRole.staff, settings.BRACU_DEMO_STAFF_PASSWORD),
                ("cleaner1@bracu.scms", "BRACU Cleaner", UserRole.cleaner, settings.BRACU_DEMO_CLEANER_PASSWORD),
            ]
            for email, full_name, role, password in _demo_accounts:
                if not password:
                    continue
                existing = await session.execute(
                    select(User).where(User.email == email, User.tenant_id == bracu.tenant_id)
                )
                existing_user = existing.scalar_one_or_none()
                if existing_user is not None and role == UserRole.tenant_admin:
                    existing_user.role = UserRole.tenant_admin
                    existing_user.is_active = True
                    existing_user.email_verified = True
                    if not _auth.verify_password(password, existing_user.password_hash):
                        existing_user.password_hash = _auth.hash_password(password)
                    logger.info("Ensured BRACU demo admin account: %s", email)
                if existing_user is None:
                    if role == UserRole.tenant_admin:
                        legacy = await session.execute(
                            select(User).where(
                                User.email == "admin@bracu.scms",
                                User.tenant_id == bracu.tenant_id,
                                User.role == UserRole.tenant_admin,
                            )
                        )
                        legacy_admin = legacy.scalar_one_or_none()
                        if legacy_admin is not None:
                            legacy_admin.email = email
                            legacy_admin.password_hash = _auth.hash_password(password)
                            legacy_admin.is_active = True
                            legacy_admin.email_verified = True
                            logger.info("Updated BRACU demo admin email: %s", email)
                            continue
                    session.add(User(
                        tenant_id=bracu.tenant_id,
                        full_name=full_name,
                        email=email,
                        password_hash=_auth.hash_password(password),
                        role=role,
                        is_active=True,
                        email_verified=True,
                    ))
                    logger.info("Created demo %s account: %s", role.value, email)
            await session.commit()

    logger.info("Connecting to Redis...")
    await get_redis()
    logger.info("Redis ready.")

    logger.info("Checking SMTP configuration...")
    await asyncio.to_thread(verify_mail_config)

    yield

    # ── shutdown ─────────────────────────────────────────────
    logger.info("Shutting down — closing Redis connection...")
    await close_redis()
    logger.info("Redis closed.")


app = FastAPI(
    title="Smart Cafe Management System API",
    description="SCMS Backend API — BRAC University CSE400",
    version="3.1.0",
    lifespan=lifespan,
)

# ── Rate limiter ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Middleware ────────────────────────────────────────────────────────────────
# CORS first so preflight OPTIONS requests are answered before JWT decoding.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantContextMiddleware)


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
app.include_router(tenants.router, prefix="/api/v1")
app.include_router(otp.router, prefix="/api/v1")
app.include_router(menu.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(tables.router, prefix="/api/v1")
app.include_router(cleaners.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(qr.router, prefix="/api/v1")
app.include_router(memo.router, prefix="/api/v1")
app.include_router(receipts.router, prefix="/api/v1")
app.include_router(food_court.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(invitations.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(public.router, prefix="/api/v1")
app.include_router(platform.router, prefix="/api/v1")
app.include_router(devices.router, prefix="/api/v1")
app.include_router(device_api.router, prefix="/api/v1")
app.include_router(signage.router, prefix="/api/v1")
app.include_router(kiosk_config.router, prefix="/api/v1")
app.include_router(payment_gateways.router, prefix="/api/v1")
app.include_router(websocket.router)

# ── Static file serving ───────────────────────────────────────────────────────
_media_path = Path(settings.MEDIA_ROOT)
_media_path.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_media_path)), name="media")


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "service": "SCMS API", "version": "3.1.0"}


@app.get("/")
async def root():
    return {
        "message": "Smart Cafe Management System API",
        "docs": "/docs",
        "health": "/api/v1/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

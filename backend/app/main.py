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
from app.core.database import engine, Base
from app.core.limiter import limiter
from app.core.redis import get_redis, close_redis
from app.middleware.tenant import TenantContextMiddleware
from app.routers import auth, menu, orders, tables, cleaners, payments, analytics, websocket
from app.routers import tenants, otp, inventory, qr, memo, receipts

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────
    logger.info("Starting SCMS API v3.1.0 ...")

    # Ensure media directories exist at startup
    media_root = Path(settings.MEDIA_ROOT)
    (media_root / "qr_codes").mkdir(parents=True, exist_ok=True)
    logger.info("Media directory ready: %s", media_root)

    logger.info("Initialising database tables...")
    async with engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database ready.")

    logger.info("Connecting to Redis...")
    await get_redis()
    logger.info("Redis ready.")

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

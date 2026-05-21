from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.routers import auth, menu, orders, tables, cleaners, payments, analytics, websocket
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Smart Cafe Management System API",
    description="SCMS Backend API - BRAC University CSE400",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create all tables on startup
@app.on_event("startup")
async def startup():
    """Initialize database tables on application startup"""
    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created successfully!")


# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(menu.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(tables.router, prefix="/api/v1")
app.include_router(cleaners.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(websocket.router)


@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "SCMS API"
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Smart Cafe Management System API",
        "docs": "/docs",
        "health": "/api/v1/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True
    )

from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import Any, Dict, List
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/dbname"

    # Security
    SECRET_KEY: str = "your-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Redis
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    # Full connection string override (e.g. Upstash's rediss://default:<password>@host:port) —
    # takes priority over HOST/PORT/DB below when set, since those three alone can't express
    # a password or TLS scheme. Local dev/CI leave this blank and use HOST/PORT/DB.
    REDIS_URL: str = ""

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Environment
    ENVIRONMENT: str = "development"

    # Media / static files
    MEDIA_ROOT: str = "/app/media"
    FRONTEND_URL: str = "https://scms.bracu.ac.bd"
    # RFC-011 Stage 2 — the backend's own externally-reachable base URL, used only to build
    # payment-gateway callback/IPN URLs (called by the gateway's servers, not the browser).
    # Distinct from FRONTEND_URL. Must be a real public URL in production or gateway
    # callbacks/IPNs have nowhere real to reach.
    BACKEND_URL: str = "http://localhost:8001"

    # Email / OTP — SMTP (fastapi-mail) fallback path
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@scms.local"
    MAIL_FROM_NAME: str = "SCMS Platform"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    # Email / OTP — Brevo transactional email API (see ADR-007). Preferred over SMTP
    # when set: Brevo's API is more reliable in practice than raw SMTP credentials.
    BREVO_API_KEY: str = ""

    # Payment gateway credential encryption (RFC-011, ADR-015). Fernet key encrypting each
    # tenant's own SSLCommerz/bKash secrets at rest. Generate:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Deliberately no "quietly degrade" fallback like b2_enabled/mail_enabled below — a gateway
    # credential save fails loudly (app/core/crypto.py) if this is unset.
    ENCRYPTION_KEY: str = ""

    # Object storage — Backblaze B2 (S3-compatible), for tenant logos / menu item images.
    # Only these two upload paths need it: QR codes are generated and consumed within a
    # single request and never re-read from disk (see app/services/qr_service.py). When
    # unset, storage_service.py falls back to local disk under MEDIA_ROOT — fine for local
    # dev/CI, but required in any environment with an ephemeral filesystem (e.g. Render's
    # free tier, which wipes local disk on every restart/redeploy/sleep-wake).
    B2_ENDPOINT_URL: str = ""
    B2_KEY_ID: str = ""
    B2_APPLICATION_KEY: str = ""
    B2_BUCKET_NAME: str = ""
    # Base URL under which an uploaded object is publicly reachable, e.g.
    # https://f005.backblazeb2.com/file/scms-media — object_service.py appends /{key}.
    B2_PUBLIC_URL_BASE: str = ""

    @property
    def b2_enabled(self) -> bool:
        return bool(self.B2_BUCKET_NAME and self.B2_KEY_ID and self.B2_APPLICATION_KEY)

    @property
    def mail_enabled(self) -> bool:
        """True only when SMTP credentials are actually configured."""
        return bool(self.MAIL_USERNAME and self.MAIL_PASSWORD)

    @property
    def brevo_enabled(self) -> bool:
        return bool(self.BREVO_API_KEY)

    @property
    def mail_provider(self) -> str:
        """Which transport `send_otp_email`/`send_invite_email` actually use.

        Brevo takes priority when configured (see ADR-007); SMTP is the legacy fallback;
        otherwise emails are just logged (dev mode).
        """
        if self.brevo_enabled:
            return "brevo"
        if self.mail_enabled:
            return "smtp"
        return "none"

    @property
    def redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def sync_database_url(self) -> str:
        """psycopg2-based URL for synchronous Alembic migrations."""
        return self.DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql+psycopg2://", 1
        ).replace("postgresql://", "postgresql+psycopg2://", 1)

    @property
    def database_url_for_engine(self) -> str:
        """Return a DATABASE_URL compatible with SQLAlchemy asyncpg engine creation."""
        parts = urlsplit(self.DATABASE_URL)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))

        # asyncpg does not accept libpq-only params like sslmode/channel_binding.
        query.pop("sslmode", None)
        query.pop("channel_binding", None)

        sanitized_query = urlencode(query)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, sanitized_query, parts.fragment))

    @property
    def database_connect_args(self) -> Dict[str, Any]:
        """Return SQLAlchemy connect_args for asyncpg based on DATABASE_URL query options."""
        parts = urlsplit(self.DATABASE_URL)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))

        # statement_cache_size=0 disables asyncpg's client-side prepared-statement cache.
        # Required for any pooled/PgBouncer-fronted Postgres (e.g. Neon's -pooler endpoint):
        # transaction-mode pooling can silently swap the real backend connection between
        # queries on what SQLAlchemy considers one logical connection, so a prepared
        # statement cached against the first backend errors on the second. Safe to leave on
        # unconditionally — the cost is re-preparing statements each time, negligible for
        # this app's traffic, and it's a no-op against a direct (non-pooled) connection.
        connect_args: Dict[str, Any] = {"statement_cache_size": 0}
        sslmode = (query.get("sslmode") or "").lower()
        if sslmode in {"require", "verify-ca", "verify-full"}:
            connect_args["ssl"] = "require"

        return connect_args
    
    model_config = ConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()

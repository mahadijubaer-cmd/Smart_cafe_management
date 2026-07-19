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

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Environment
    ENVIRONMENT: str = "development"

    # Media / static files
    MEDIA_ROOT: str = "/app/media"
    FRONTEND_URL: str = "https://scms.bracu.ac.bd"

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

        connect_args: Dict[str, Any] = {}
        sslmode = (query.get("sslmode") or "").lower()
        if sslmode in {"require", "verify-ca", "verify-full"}:
            connect_args["ssl"] = "require"

        return connect_args
    
    model_config = ConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()

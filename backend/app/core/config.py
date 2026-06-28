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

    # Email / OTP (fastapi-mail)
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@scms.local"
    MAIL_FROM_NAME: str = "SCMS Platform"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    @property
    def mail_enabled(self) -> bool:
        """True only when SMTP credentials are actually configured."""
        return bool(self.MAIL_USERNAME and self.MAIL_PASSWORD)

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

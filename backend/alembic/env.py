"""Alembic migration environment.

Uses psycopg2 (synchronous) for migrations even though the app runtime
uses asyncpg.  The sync_database_url property on Settings swaps the
scheme automatically so no manual URL editing is needed.
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

from app.core.database import Base
from app.core.config import settings

# Import all models so SQLAlchemy registers them with Base.metadata
from app.models.models import (  # noqa: F401
    Tenant,
    User,
    Category,
    MenuItem,
    TablesMap,
    Order,
    OrderItem,
    Reservation,
    Payment,
    CleanerLog,
    RewardLog,
    Notification,
    OtpLog,
    QrCode,
    ReceiptLog,
    InventoryCategory,
    InventoryItem,
    MenuItemRecipe,
    InventoryMovement,
    PurchaseOrder,
    PurchaseOrderItem,
    TenantPaymentGateway,
    GatewayTransaction,
    WalletTransaction,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_url() -> str:
    """Return a psycopg2-compatible URL for synchronous Alembic usage."""
    return settings.sync_database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_sync_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _sync_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

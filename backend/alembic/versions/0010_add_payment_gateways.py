"""Payment gateway integration (RFC-011, ADR-015, Stage 1).

New tables: tenant_payment_gateways, gateway_transactions, wallet_transactions
(the last one documented in specs/system/data-model.md since before this RFC but
never actually created until now — see WAL-3/PAY-9).
New enum value: paymentmethod.sslcommerz.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

gateway_type = sa.Enum("sslcommerz", "bkash", name="gatewaytype")
gateway_purpose = sa.Enum("order_payment", "wallet_topup", name="gatewaypurpose")
gateway_transaction_status = sa.Enum(
    "initiated", "pending", "success", "failed", "cancelled", name="gatewaytransactionstatus"
)


def upgrade() -> None:
    # New enum value on the existing paymentmethod type. Standalone statement, no
    # same-transaction backfill using the new value — safe (same precedent as 0006).
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'sslcommerz'")

    gateway_type.create(op.get_bind(), checkfirst=True)
    gateway_purpose.create(op.get_bind(), checkfirst=True)
    gateway_transaction_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "tenant_payment_gateways",
        sa.Column("gateway_config_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("gateway_type", gateway_type, nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_sandbox", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("public_identifier", sa.String(150), nullable=True),
        sa.Column("credentials_encrypted", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("tenant_id", "gateway_type", name="uq_tenant_payment_gateways_tenant_type"),
    )
    op.create_index("ix_tenant_payment_gateways_tenant_id", "tenant_payment_gateways", ["tenant_id"])

    op.create_table(
        "gateway_transactions",
        sa.Column("gateway_transaction_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", gateway_purpose, nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("orders.order_id"), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.user_id"), nullable=True),
        sa.Column("guest_token", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("gateway_type", gateway_type, nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", gateway_transaction_status, nullable=False,
                  server_default=sa.text("'initiated'")),
        sa.Column("gateway_ref", sa.String(100), nullable=True),
        sa.Column("gateway_external_ref", sa.String(150), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_gateway_transactions_tenant_id", "gateway_transactions", ["tenant_id"])
    op.create_index("ix_gateway_transactions_guest_token", "gateway_transactions", ["guest_token"])

    op.create_table(
        "wallet_transactions",
        sa.Column("txn_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_wallet_transactions_tenant_id", "wallet_transactions", ["tenant_id"])
    op.create_index("ix_wallet_transactions_user_id", "wallet_transactions", ["user_id"])


def downgrade() -> None:
    op.drop_table("wallet_transactions")
    op.drop_table("gateway_transactions")
    op.drop_table("tenant_payment_gateways")
    gateway_transaction_status.drop(op.get_bind(), checkfirst=True)
    gateway_purpose.drop(op.get_bind(), checkfirst=True)
    gateway_type.drop(op.get_bind(), checkfirst=True)
    # Postgres can't drop an enum value — 'sslcommerz' remains a valid-but-unused
    # value on paymentmethod after downgrade (same as 'pending_confirmation' in 0006).

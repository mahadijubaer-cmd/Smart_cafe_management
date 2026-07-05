"""RFC-007 (Phase 22): guest QR ordering — nullable orders.user_id, order_source,
guest_token/name/phone, chk_order_identity; tenants public-surface config.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New enum value on the existing orderstatus type. Must run outside the
    # implicit migration transaction on PostgreSQL < 12 semantics — safe as a
    # standalone statement.
    op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'pending_confirmation'")

    ordersource = postgresql.ENUM(
        "customer_app", "staff_pos", "guest_qr", "kiosk", name="ordersource"
    )
    ordersource.create(op.get_bind(), checkfirst=True)

    op.alter_column("orders", "user_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column(
        "orders",
        sa.Column(
            "order_source", ordersource, nullable=False, server_default="customer_app"
        ),
    )
    op.add_column("orders", sa.Column("guest_token", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("orders", sa.Column("guest_name", sa.String(80), nullable=True))
    op.add_column("orders", sa.Column("guest_phone", sa.String(20), nullable=True))
    op.create_unique_constraint("uq_orders_guest_token", "orders", ["guest_token"])
    op.create_check_constraint(
        "chk_order_identity",
        "orders",
        "(user_id IS NOT NULL AND guest_token IS NULL) OR "
        "(user_id IS NULL AND guest_token IS NOT NULL AND order_source IN ('guest_qr', 'kiosk'))",
    )

    op.add_column(
        "tenants",
        sa.Column("public_menu_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("tenants", sa.Column("public_slug", sa.String(60), nullable=True))
    op.create_unique_constraint("uq_tenants_public_slug", "tenants", ["public_slug"])
    op.add_column(
        "tenants",
        sa.Column("guest_checkout_mode", sa.String(16), nullable=False, server_default="counter"),
    )
    op.create_check_constraint(
        "ck_tenants_guest_checkout_mode",
        "tenants",
        "guest_checkout_mode IN ('counter', 'online')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tenants_guest_checkout_mode", "tenants", type_="check")
    op.drop_column("tenants", "guest_checkout_mode")
    op.drop_constraint("uq_tenants_public_slug", "tenants", type_="unique")
    op.drop_column("tenants", "public_slug")
    op.drop_column("tenants", "public_menu_enabled")

    op.drop_constraint("chk_order_identity", "orders", type_="check")
    op.drop_constraint("uq_orders_guest_token", "orders", type_="unique")
    op.drop_column("orders", "guest_phone")
    op.drop_column("orders", "guest_name")
    op.drop_column("orders", "guest_token")
    op.drop_column("orders", "order_source")
    op.alter_column("orders", "user_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    ordersource = postgresql.ENUM(name="ordersource")
    ordersource.drop(op.get_bind(), checkfirst=True)

    # Note: PostgreSQL cannot remove a value from an enum type; 'pending_confirmation'
    # remains a valid (unused) orderstatus value after downgrade.

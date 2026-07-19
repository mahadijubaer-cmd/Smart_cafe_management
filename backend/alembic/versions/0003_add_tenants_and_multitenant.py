"""Add tenants table and multi-tenant columns to all existing tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-28

Strategy:
  1. Create new enum types (tenanttype, subscriptiontier).
  2. Create the tenants table.
  3. Seed one default BRACU tenant (fixed UUID) so we can backfill existing rows.
  4. Add tenant_id (nullable) to every existing table, backfill, then set NOT NULL.
  5. Expand userrole and paymentmethod enums with new values.
  6. Drop old global unique constraints; add new per-tenant ones.
  7. Add new columns (outlet_id, employee_id, email_verified, etc.) to users.
  8. Add outlet_id to menu_items, orders, tables_map.
  9. Add subtotal computed column to order_items (was missing from 0001).
 10. Create otp_logs, qr_codes, receipt_logs tables.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# ── fixed UUID for the default BRACU academic tenant ──────────────────────────
BRACU_TENANT_ID = "10000000-0000-0000-0000-000000000001"

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. New enum types ──────────────────────────────────────────────────────
    # create_type=False on both the explicit-create objects AND the sa.Enum(name=...)
    # references used as column types below — they're separate Python objects, and without
    # create_type=False on each, create_table's before_create event re-issues CREATE TYPE
    # for whichever one is embedded as a column, failing with "type already exists" (same
    # root cause as migration 0001's userrole/orderstatus/etc.).
    tenanttype_enum = postgresql.ENUM(
        "franchise_brand", "franchise_outlet", "corporate", "academic",
        "independent_restaurant", "food_court", "food_court_vendor",
        name="tenanttype", create_type=False,
    )
    tenanttype_enum.create(conn, checkfirst=True)

    subscriptiontier_enum = postgresql.ENUM(
        "free", "starter", "professional", "enterprise",
        name="subscriptiontier", create_type=False,
    )
    subscriptiontier_enum.create(conn, checkfirst=True)

    # ── 2. Create tenants table ────────────────────────────────────────────────
    op.create_table(
        "tenants",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("parent_tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tenant_type", tenanttype_enum, nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("logo_url", sa.String(255), nullable=True),
        sa.Column("brand_color", sa.String(7), nullable=False, server_default="#1A4D2E"),
        sa.Column("subscription_tier", subscriptiontier_enum, nullable=False,
                  server_default="starter"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("allowed_email_domain", sa.String(100), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("contact_email", sa.String(150), nullable=True),
        sa.Column("homemade_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("inventory_strict_mode", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["parent_tenant_id"], ["tenants.tenant_id"],
                                name="fk_tenants_parent", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("tenant_id"),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"])
    op.create_index("ix_tenants_type", "tenants", ["tenant_type"])

    # ── 3. Seed default BRACU tenant ──────────────────────────────────────────
    conn.execute(sa.text("""
        INSERT INTO tenants
            (tenant_id, tenant_type, name, slug, subscription_tier,
             homemade_enabled, allowed_email_domain, is_active)
        VALUES
            (:tid, 'academic', 'BRAC University Cafeteria', 'bracu',
             'professional', true, '@g.bracu.ac.bd', true)
    """), {"tid": BRACU_TENANT_ID})

    # ── 4a. Add tenant_id (nullable) to all existing tables ──────────────────
    for table in ("users", "categories", "menu_items", "tables_map",
                  "orders", "order_items", "reservations", "payments",
                  "cleaner_logs", "reward_logs", "notifications"):
        op.add_column(table, sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), nullable=True
        ))

    # ── 4b. Backfill existing rows ────────────────────────────────────────────
    for table in ("users", "categories", "menu_items", "tables_map",
                  "orders", "order_items", "reservations", "payments",
                  "cleaner_logs", "reward_logs", "notifications"):
        conn.execute(sa.text(
            f"UPDATE {table} SET tenant_id = :tid WHERE tenant_id IS NULL"
        ), {"tid": BRACU_TENANT_ID})

    # ── 4c. Set NOT NULL and add FK constraints ───────────────────────────────
    for table in ("users", "categories", "menu_items", "tables_map",
                  "orders", "order_items", "reservations", "payments",
                  "cleaner_logs", "reward_logs", "notifications"):
        op.alter_column(table, "tenant_id", nullable=False)
        op.create_foreign_key(
            f"fk_{table}_tenant_id",
            table, "tenants",
            ["tenant_id"], ["tenant_id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])

    # ── 5. Expand userrole enum ───────────────────────────────────────────────
    for value in ("customer", "outlet_admin", "tenant_admin",
                  "food_court_admin", "super_admin", "platform_admin", "server"):
        conn.execute(sa.text(
            f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{value}'"
        ))

    # ── 6. Expand paymentmethod enum ─────────────────────────────────────────
    for value in ("bkash", "nagad", "card"):
        conn.execute(sa.text(
            f"ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS '{value}'"
        ))

    # ── 7. users: drop global email unique, add per-tenant unique + new cols ──
    op.drop_index("ix_users_email", table_name="users")
    op.drop_constraint("users_email_key", "users", type_="unique")

    op.add_column("users", sa.Column(
        "outlet_id", postgresql.UUID(as_uuid=True), nullable=True
    ))
    op.create_foreign_key(
        "fk_users_outlet_id", "users", "tenants",
        ["outlet_id"], ["tenant_id"], ondelete="SET NULL"
    )
    op.create_index("ix_users_outlet_id", "users", ["outlet_id"])

    op.add_column("users", sa.Column("employee_id", sa.String(30), nullable=True))
    op.add_column("users", sa.Column(
        "email_verified", sa.Boolean(), nullable=False, server_default="false"
    ))
    op.add_column("users", sa.Column("email_verified_at", sa.TIMESTAMP(timezone=True), nullable=True))

    # Change default role from 'student' to 'customer'
    op.alter_column("users", "role", server_default="customer")

    op.create_unique_constraint("uq_user_email_tenant", "users", ["email", "tenant_id"])
    op.create_index("ix_users_email", "users", ["email"])

    # ── 8. categories: drop global name unique, add per-tenant ───────────────
    op.drop_constraint("categories_name_key", "categories", type_="unique")
    op.create_unique_constraint("uq_category_tenant_name", "categories", ["tenant_id", "name"])

    # ── 9. menu_items: add outlet_id ─────────────────────────────────────────
    op.add_column("menu_items", sa.Column(
        "outlet_id", postgresql.UUID(as_uuid=True), nullable=True
    ))
    op.create_foreign_key(
        "fk_menu_items_outlet_id", "menu_items", "tenants",
        ["outlet_id"], ["tenant_id"], ondelete="CASCADE"
    )
    op.create_index("ix_menu_items_outlet_id", "menu_items", ["outlet_id"])

    # ── 10. tables_map: drop global table_number unique, add per-tenant ───────
    op.drop_constraint("tables_map_table_number_key", "tables_map", type_="unique")
    op.add_column("tables_map", sa.Column(
        "outlet_id", postgresql.UUID(as_uuid=True), nullable=True
    ))
    op.create_foreign_key(
        "fk_tables_map_outlet_id", "tables_map", "tenants",
        ["outlet_id"], ["tenant_id"], ondelete="CASCADE"
    )
    op.create_unique_constraint(
        "uq_table_tenant_number", "tables_map", ["tenant_id", "table_number"]
    )

    # ── 11. orders: add outlet_id ─────────────────────────────────────────────
    op.add_column("orders", sa.Column(
        "outlet_id", postgresql.UUID(as_uuid=True), nullable=True
    ))
    op.create_foreign_key(
        "fk_orders_outlet_id", "orders", "tenants",
        ["outlet_id"], ["tenant_id"], ondelete="SET NULL"
    )
    op.create_index("ix_orders_outlet_id", "orders", ["outlet_id"])

    # ── 12. order_items: add subtotal computed column (missing from 0001) ─────
    # PostgreSQL generated columns can't be added via ALTER TABLE easily;
    # add as a regular column and populate it, then manage via app layer.
    # Actual computed column exists only on fresh schema via create_all.
    op.add_column("order_items", sa.Column(
        "subtotal", sa.Numeric(10, 2), nullable=True
    ))
    conn.execute(sa.text(
        "UPDATE order_items SET subtotal = quantity * unit_price WHERE subtotal IS NULL"
    ))
    op.alter_column("order_items", "subtotal", nullable=False)

    # ── 13. New tables: otp_logs, qr_codes, receipt_logs ─────────────────────
    op.create_table(
        "otp_logs",
        sa.Column("log_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("email", sa.String(150), nullable=False),
        sa.Column("purpose", sa.String(50), nullable=False),
        sa.Column("requested_at", sa.TIMESTAMP(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("verified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("log_id"),
    )
    op.create_index("ix_otp_logs_email_purpose", "otp_logs", ["email", "purpose"])

    op.create_table(
        "qr_codes",
        sa.Column("qr_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("generated_at", sa.TIMESTAMP(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("emailed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("emailed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.order_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("qr_id"),
        sa.UniqueConstraint("order_id", name="uq_qr_order"),
    )

    op.create_table(
        "receipt_logs",
        sa.Column("receipt_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("receipt_no", sa.String(50), nullable=False),
        sa.Column("generated_at", sa.TIMESTAMP(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("emailed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("emailed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.order_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("receipt_id"),
        sa.UniqueConstraint("receipt_no", name="uq_receipt_no"),
    )


def downgrade() -> None:
    # Drop new tables
    op.drop_table("receipt_logs")
    op.drop_table("qr_codes")
    op.drop_table("otp_logs")

    # Remove outlet_id / new cols from tables
    op.drop_constraint("fk_orders_outlet_id", "orders", type_="foreignkey")
    op.drop_index("ix_orders_outlet_id", table_name="orders")
    op.drop_column("orders", "outlet_id")

    op.drop_constraint("uq_table_tenant_number", "tables_map", type_="unique")
    op.drop_constraint("fk_tables_map_outlet_id", "tables_map", type_="foreignkey")
    op.drop_column("tables_map", "outlet_id")
    op.create_unique_constraint("tables_map_table_number_key", "tables_map", ["table_number"])

    op.drop_constraint("fk_menu_items_outlet_id", "menu_items", type_="foreignkey")
    op.drop_index("ix_menu_items_outlet_id", table_name="menu_items")
    op.drop_column("menu_items", "outlet_id")

    op.drop_constraint("uq_category_tenant_name", "categories", type_="unique")
    op.create_unique_constraint("categories_name_key", "categories", ["name"])

    op.drop_constraint("uq_user_email_tenant", "users", type_="unique")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "employee_id")
    op.drop_constraint("fk_users_outlet_id", "users", type_="foreignkey")
    op.drop_index("ix_users_outlet_id", table_name="users")
    op.drop_column("users", "outlet_id")
    op.create_unique_constraint("users_email_key", "users", ["email"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.drop_column("order_items", "subtotal")

    # Remove tenant_id from all tables
    for table in ("notifications", "reward_logs", "cleaner_logs",
                  "payments", "reservations", "order_items", "orders",
                  "tables_map", "menu_items", "categories", "users"):
        op.drop_constraint(f"fk_{table}_tenant_id", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_tenant_id", table_name=table)
        op.drop_column(table, "tenant_id")

    op.drop_index("ix_tenants_type", table_name="tenants")
    op.drop_index("ix_tenants_slug", table_name="tenants")
    op.drop_table("tenants")

    postgresql.ENUM(name="subscriptiontier").drop(op.get_bind())
    postgresql.ENUM(name="tenanttype").drop(op.get_bind())

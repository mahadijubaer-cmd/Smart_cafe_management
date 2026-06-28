"""Add inventory module tables and enums.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New enum types ──────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE inventory_unit AS ENUM (
                'kg', 'g', 'litre', 'ml', 'piece', 'packet', 'dozen'
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE stock_movement_type AS ENUM (
                'purchase', 'transfer_in', 'transfer_out',
                'consumption', 'adjustment', 'waste'
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE purchase_order_status AS ENUM (
                'draft', 'submitted', 'approved', 'received', 'cancelled'
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)

    # ── inventory_categories ─────────────────────────────────────────────────
    op.create_table(
        "inventory_categories",
        sa.Column("inv_category_id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.UniqueConstraint("tenant_id", "name", name="uq_inv_cat_tenant_name"),
    )
    op.create_index("idx_inv_cats_tenant", "inventory_categories", ["tenant_id"])

    # ── inventory_items ──────────────────────────────────────────────────────
    op.create_table(
        "inventory_items",
        sa.Column("item_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "outlet_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "inv_category_id",
            sa.Integer,
            sa.ForeignKey("inventory_categories.inv_category_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_central", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("sku", sa.String(50), nullable=True),
        sa.Column(
            "unit",
            sa.Enum("kg", "g", "litre", "ml", "piece", "packet", "dozen", name="inventory_unit", create_type=False),
            nullable=False,
            server_default=sa.text("'piece'"),
        ),
        sa.Column("quantity_on_hand", sa.Numeric(12, 3), nullable=False, server_default=sa.text("0")),
        sa.Column("reorder_level", sa.Numeric(12, 3), nullable=False, server_default=sa.text("0")),
        sa.Column("reorder_quantity", sa.Numeric(12, 3), nullable=False, server_default=sa.text("0")),
        sa.Column("unit_cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("supplier_name", sa.String(150), nullable=True),
        sa.Column("supplier_contact", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "outlet_id", "sku", name="uq_inv_item_tenant_outlet_sku"),
    )
    op.create_index("idx_inv_items_tenant", "inventory_items", ["tenant_id"])
    op.create_index("idx_inv_items_outlet", "inventory_items", ["outlet_id"])
    op.create_index("idx_inv_items_central", "inventory_items", ["tenant_id", "is_central"])

    # ── menu_item_recipes ────────────────────────────────────────────────────
    op.create_table(
        "menu_item_recipes",
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "menu_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("menu_items.item_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "inventory_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inventory_items.item_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("quantity_per_serving", sa.Numeric(10, 4), nullable=False),
        sa.UniqueConstraint("menu_item_id", "inventory_item_id", name="uq_recipe_menu_inv"),
        sa.CheckConstraint("quantity_per_serving > 0", name="ck_recipe_qty_positive"),
    )
    op.create_index("idx_recipes_tenant", "menu_item_recipes", ["tenant_id"])
    op.create_index("idx_recipes_menu_item", "menu_item_recipes", ["menu_item_id"])

    # ── purchase_orders (created before movements so FK can reference it) ────
    op.create_table(
        "purchase_orders",
        sa.Column("po_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "outlet_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_transfer", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column(
            "from_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id"),
            nullable=True,
        ),
        sa.Column("po_number", sa.String(50), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "submitted", "approved", "received", "cancelled", name="purchase_order_status", create_type=False),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column("supplier_name", sa.String(150), nullable=True),
        sa.Column("supplier_contact", sa.String(100), nullable=True),
        sa.Column("expected_delivery", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("idx_po_tenant", "purchase_orders", ["tenant_id"])
    op.create_index("idx_po_outlet", "purchase_orders", ["outlet_id"])

    # ── inventory_movements ──────────────────────────────────────────────────
    op.create_table(
        "inventory_movements",
        sa.Column("movement_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "inventory_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inventory_items.item_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "movement_type",
            sa.Enum("purchase", "transfer_in", "transfer_out", "consumption", "adjustment", "waste",
                    name="stock_movement_type", create_type=False),
            nullable=False,
        ),
        sa.Column("quantity_delta", sa.Numeric(12, 3), nullable=False),
        sa.Column("quantity_before", sa.Numeric(12, 3), nullable=False),
        sa.Column("quantity_after", sa.Numeric(12, 3), nullable=False),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.order_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("purchase_order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "performed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), index=True),
    )
    op.create_index("idx_inv_movements_tenant", "inventory_movements", ["tenant_id"])
    op.create_index("idx_inv_movements_item", "inventory_movements", ["inventory_item_id"])
    op.create_index("idx_inv_movements_order", "inventory_movements", ["order_id"])

    # Deferred FK: movements → purchase_orders (avoids circular table creation)
    op.create_foreign_key(
        "fk_movements_po",
        "inventory_movements",
        "purchase_orders",
        ["purchase_order_id"],
        ["po_id"],
        ondelete="SET NULL",
    )

    # ── purchase_order_items ─────────────────────────────────────────────────
    op.create_table(
        "purchase_order_items",
        sa.Column("po_item_id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "po_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("purchase_orders.po_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "inventory_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inventory_items.item_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("quantity_ordered", sa.Numeric(12, 3), nullable=False),
        sa.Column("quantity_received", sa.Numeric(12, 3), nullable=False, server_default=sa.text("0")),
        sa.Column("unit_cost", sa.Numeric(10, 2), nullable=True),
        sa.CheckConstraint("quantity_ordered > 0", name="ck_po_item_qty_positive"),
    )
    op.create_index("idx_po_items_po", "purchase_order_items", ["po_id"])


def downgrade() -> None:
    op.drop_table("purchase_order_items")
    op.drop_constraint("fk_movements_po", "inventory_movements", type_="foreignkey")
    op.drop_table("inventory_movements")
    op.drop_table("purchase_orders")
    op.drop_table("menu_item_recipes")
    op.drop_table("inventory_items")
    op.drop_table("inventory_categories")
    op.execute("DROP TYPE IF EXISTS purchase_order_status")
    op.execute("DROP TYPE IF EXISTS stock_movement_type")
    op.execute("DROP TYPE IF EXISTS inventory_unit")

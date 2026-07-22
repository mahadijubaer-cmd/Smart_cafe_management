"""Fix order_items.subtotal to be a real PostgreSQL GENERATED column.

Migration 0003 added `subtotal` as a plain NOT NULL column (backfilled once at
migration time), with a comment acknowledging it wasn't a true generated column
and "managed via app layer" -- but the OrderItem SQLAlchemy model uses
Computed("quantity * unit_price", persisted=True), which tells SQLAlchemy the
DATABASE computes this value and never includes it in INSERT statements. Result:
every single order placement against a database built through this migration
chain (rather than local dev's create_all(), which builds the current model
shape directly) hits a NOT NULL violation on order_items.subtotal --
confirmed live in production 2026-07-22 while verifying RFC-011 Stage 2 (zero
order_items rows existed in production before this fix; no order had ever been
successfully placed there).

PostgreSQL 12+ supports adding a real GENERATED column via ALTER TABLE directly
-- migration 0003's comment ("can't be added via ALTER TABLE easily") doesn't
hold on the PG15 this project actually runs.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("order_items", "subtotal")
    op.execute(
        "ALTER TABLE order_items ADD COLUMN subtotal NUMERIC(10, 2) "
        "GENERATED ALWAYS AS (quantity * unit_price) STORED"
    )


def downgrade() -> None:
    op.drop_column("order_items", "subtotal")
    op.add_column("order_items", sa.Column("subtotal", sa.Numeric(10, 2), nullable=True))
    op.execute("UPDATE order_items SET subtotal = quantity * unit_price WHERE subtotal IS NULL")
    op.alter_column("order_items", "subtotal", nullable=False)

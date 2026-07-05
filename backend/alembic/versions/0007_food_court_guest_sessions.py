"""RFC-007 (Phase D): relax orders.guest_token uniqueness so a food-court guest
cart spanning multiple vendors can be split into sibling orders (one per vendor
tenant_id) sharing a single guest_token — a "guest session".

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-05
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_orders_guest_token", "orders", type_="unique")
    op.create_index("ix_orders_guest_token", "orders", ["guest_token"])


def downgrade() -> None:
    op.drop_index("ix_orders_guest_token", table_name="orders")
    op.create_unique_constraint("uq_orders_guest_token", "orders", ["guest_token"])

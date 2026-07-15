"""Device terminals: kiosk + signage (RFC-010 / ADR-013, Phase 25).

New tables: devices, signage_playlists, signage_slides, kiosk_configs.
Column additions: orders.pickup_number (OR-12),
menu_items.allergens / dietary_tags (BR-MENU-4).

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

device_type = sa.Enum("kiosk", "signage", name="devicetype")
slide_type = sa.Enum(
    "menu_board", "promo_image", "announcement",
    "order_status_board", "trending_items", "offers",
    name="signageslidetype",
)


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("device_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("outlet_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("device_type", device_type, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("token_prefix", sa.String(16), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("settings", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("paired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_devices_tenant_id", "devices", ["tenant_id"])

    op.create_table(
        "signage_playlists",
        sa.Column("playlist_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("outlet_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_signage_playlists_tenant_id", "signage_playlists", ["tenant_id"])
    # SGN-4: one default per scope (NULL / non-NULL outlet handled separately)
    op.create_index(
        "uq_signage_playlists_default_tenant", "signage_playlists", ["tenant_id"],
        unique=True, postgresql_where=sa.text("is_default AND outlet_id IS NULL"),
    )
    op.create_index(
        "uq_signage_playlists_default_outlet", "signage_playlists", ["tenant_id", "outlet_id"],
        unique=True, postgresql_where=sa.text("is_default AND outlet_id IS NOT NULL"),
    )

    op.create_table(
        "signage_slides",
        sa.Column("slide_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("playlist_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("signage_playlists.playlist_id", ondelete="CASCADE"), nullable=False),
        sa.Column("slide_type", slide_type, nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default=sa.text("10")),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("active_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.CheckConstraint("duration_seconds >= 5", name="ck_signage_slides_min_duration"),
    )
    op.create_index("ix_signage_slides_playlist_id", "signage_slides", ["playlist_id"])

    op.create_table(
        "kiosk_configs",
        sa.Column("config_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("outlet_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_kiosk_configs_tenant_id", "kiosk_configs", ["tenant_id"])
    op.create_index(
        "uq_kiosk_configs_tenant", "kiosk_configs", ["tenant_id"],
        unique=True, postgresql_where=sa.text("outlet_id IS NULL"),
    )
    op.create_index(
        "uq_kiosk_configs_outlet", "kiosk_configs", ["tenant_id", "outlet_id"],
        unique=True, postgresql_where=sa.text("outlet_id IS NOT NULL"),
    )

    op.add_column("orders", sa.Column("pickup_number", sa.Integer(), nullable=True))
    op.add_column("menu_items", sa.Column("allergens", postgresql.JSONB(), nullable=False,
                                          server_default=sa.text("'[]'::jsonb")))
    op.add_column("menu_items", sa.Column("dietary_tags", postgresql.JSONB(), nullable=False,
                                          server_default=sa.text("'[]'::jsonb")))


def downgrade() -> None:
    op.drop_column("menu_items", "dietary_tags")
    op.drop_column("menu_items", "allergens")
    op.drop_column("orders", "pickup_number")
    op.drop_table("kiosk_configs")
    op.drop_table("signage_slides")
    op.drop_table("signage_playlists")
    op.drop_table("devices")
    slide_type.drop(op.get_bind(), checkfirst=True)
    device_type.drop(op.get_bind(), checkfirst=True)

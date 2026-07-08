"""Add platform_audit_logs table (RFC-009, Platform Admin Control Plane).

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_audit_logs",
        sa.Column("log_id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_email", sa.String(150), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("target_tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.tenant_id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_tenant_name", sa.String(150), nullable=True),
        sa.Column("target_tenant_slug", sa.String(80), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_platform_audit_logs_target_tenant_id", "platform_audit_logs", ["target_tenant_id"])
    op.create_index("ix_platform_audit_logs_created_at", "platform_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("platform_audit_logs")

"""Device terminals: kiosk + signage (RFC-010 / ADR-013, Phase 25).

`devices` is the registry of venue hardware. A device authenticates with an
opaque token whose SHA-256 hash lives in `token_hash` (plaintext shown exactly
once at pairing — see services/device_service.py). Signage content lives in
`signage_playlists` / `signage_slides`; kiosk customization in `kiosk_configs`.

JSON columns use JSON().with_variant(JSONB) so the SQLite test database
(tests/conftest.py) keeps working while Postgres gets real JSONB.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Enum as SQLEnum,
    ForeignKey, Index, Integer, JSON, String, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

JSONVariant = JSON().with_variant(JSONB(), "postgresql")


class DeviceType(str, enum.Enum):
    kiosk = "kiosk"
    signage = "signage"


class SignageSlideType(str, enum.Enum):
    menu_board = "menu_board"
    promo_image = "promo_image"
    announcement = "announcement"
    order_status_board = "order_status_board"
    trending_items = "trending_items"
    offers = "offers"


class Device(Base):
    __tablename__ = "devices"

    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    device_type: Mapped[DeviceType] = mapped_column(
        SQLEnum(DeviceType, name="devicetype"), nullable=False
    )
    # NULL = registered but unpaired (DEV-1). sha256 hex digest, never the plaintext.
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    token_prefix: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    settings: Mapped[dict] = mapped_column(JSONVariant, nullable=False, default=dict)
    paired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )


class SignagePlaylist(Base):
    __tablename__ = "signage_playlists"
    __table_args__ = (
        # SGN-4: at most one default playlist per scope. Split into two partial
        # unique indexes (NULL vs non-NULL outlet) so it works identically on
        # Postgres and the SQLite test DB without COALESCE casts.
        Index(
            "uq_signage_playlists_default_tenant",
            "tenant_id",
            unique=True,
            postgresql_where=text("is_default AND outlet_id IS NULL"),
            sqlite_where=text("is_default AND outlet_id IS NULL"),
        ),
        Index(
            "uq_signage_playlists_default_outlet",
            "tenant_id",
            "outlet_id",
            unique=True,
            postgresql_where=text("is_default AND outlet_id IS NOT NULL"),
            sqlite_where=text("is_default AND outlet_id IS NOT NULL"),
        ),
    )

    playlist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )

    slides = relationship(
        "SignageSlide",
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="SignageSlide.position",
    )


class SignageSlide(Base):
    __tablename__ = "signage_slides"
    __table_args__ = (
        CheckConstraint("duration_seconds >= 5", name="ck_signage_slides_min_duration"),  # SGN-1
    )

    slide_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    playlist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signage_playlists.playlist_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slide_type: Mapped[SignageSlideType] = mapped_column(
        SQLEnum(SignageSlideType, name="signageslidetype"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default=text("10"))
    config: Mapped[dict] = mapped_column(JSONVariant, nullable=False, default=dict)
    active_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    playlist = relationship("SignagePlaylist", back_populates="slides")


class KioskConfig(Base):
    __tablename__ = "kiosk_configs"
    __table_args__ = (
        # One config row per scope; outlet row overrides the tenant-wide row.
        Index(
            "uq_kiosk_configs_tenant",
            "tenant_id",
            unique=True,
            postgresql_where=text("outlet_id IS NULL"),
            sqlite_where=text("outlet_id IS NULL"),
        ),
        Index(
            "uq_kiosk_configs_outlet",
            "tenant_id",
            "outlet_id",
            unique=True,
            postgresql_where=text("outlet_id IS NOT NULL"),
            sqlite_where=text("outlet_id IS NOT NULL"),
        ),
    )

    config_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=True,
    )
    config: Mapped[dict] = mapped_column(JSONVariant, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=datetime.utcnow,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )

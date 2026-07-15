"""Schemas for device terminals: registry, pairing, kiosk config, signage content
(RFC-010 / ADR-013, Phase 25)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.order import OrderItemCreate

# BR-MENU-4: closed vocabularies (EU FIC 1169/2011 canonical allergen codes)
FIC_ALLERGENS = frozenset({
    "gluten", "crustaceans", "eggs", "fish", "peanuts", "soybeans", "milk",
    "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs",
})
DIETARY_TAGS = frozenset({"vegetarian", "vegan", "halal", "spicy"})


# ── Device registry (admin) ──────────────────────────────────────────────────

class DeviceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    device_type: str = Field(..., pattern="^(kiosk|signage)$")
    outlet_id: UUID | None = None
    settings: dict = Field(default_factory=dict)


class DevicePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    outlet_id: UUID | None = None
    settings: dict | None = None
    is_active: bool | None = None


class DeviceResponse(BaseModel):
    device_id: UUID
    tenant_id: UUID
    outlet_id: UUID | None = None
    name: str
    device_type: str
    is_active: bool
    paired: bool = False
    token_prefix: str | None = None
    settings: dict = {}
    paired_at: datetime | None = None
    last_seen_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PairingCodeResponse(BaseModel):
    code: str
    expires_in: int  # seconds


# ── Pairing / device profile (device-facing) ─────────────────────────────────

class DevicePairRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern="^[0-9]{6}$")


class DeviceProfileResponse(BaseModel):
    device_id: UUID
    device_type: str
    tenant_id: UUID
    tenant_slug: str
    tenant_name: str
    brand_color: str
    outlet_id: UUID | None = None
    settings: dict = {}
    kiosk_config: dict | None = None  # resolved config, kiosk devices only


class DevicePairResponse(DeviceProfileResponse):
    device_token: str  # plaintext — returned exactly once (DEV-1)


# ── Kiosk ordering (device-facing) ───────────────────────────────────────────

class KioskOrderCreate(BaseModel):
    """No table_number (KSK-3) and no guest_phone — pickup_number is the linkage."""
    items: list[OrderItemCreate] = Field(..., min_length=1)
    guest_name: str | None = Field(None, max_length=80)
    special_notes: str | None = None


# ── Kiosk config (admin) ─────────────────────────────────────────────────────

KIOSK_CONFIG_DEFAULTS: dict = {
    "welcome_text_en": "Welcome — order here",
    "welcome_text_bn": "স্বাগতম — এখানে অর্ডার করুন",
    "attract_image_urls": [],
    "featured_item_ids": [],
    "accent_color": None,  # null -> tenant brand_color
    "idle_timeout_seconds": 60,
    "allow_guest_name": True,
    "show_dietary_tags": True,
}


class KioskConfigUpdate(BaseModel):
    welcome_text_en: str | None = Field(None, max_length=120)
    welcome_text_bn: str | None = Field(None, max_length=120)
    attract_image_urls: list[str] | None = None
    featured_item_ids: list[UUID] | None = None
    accent_color: str | None = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    idle_timeout_seconds: int | None = Field(None, ge=30, le=600)
    allow_guest_name: bool | None = None
    show_dietary_tags: bool | None = None
    outlet_id: UUID | None = None  # scope selector; null = tenant-wide row


class KioskConfigResponse(BaseModel):
    config: dict
    outlet_id: UUID | None = None
    updated_at: datetime | None = None


# ── Signage playlists / slides (admin + device) ──────────────────────────────

SLIDE_TYPES = frozenset({
    "menu_board", "promo_image", "announcement",
    "order_status_board", "trending_items", "offers",
})


class SlideCreate(BaseModel):
    slide_type: str
    config: dict = Field(default_factory=dict)
    duration_seconds: int = Field(10, ge=5, le=120)  # SGN-1
    position: int | None = None  # None -> append at end
    active_from: datetime | None = None
    active_until: datetime | None = None
    is_active: bool = True

    @field_validator("slide_type")
    @classmethod
    def _valid_type(cls, v: str) -> str:
        if v not in SLIDE_TYPES:
            raise ValueError(f"slide_type must be one of {sorted(SLIDE_TYPES)}")
        return v


class SlidePatch(BaseModel):
    config: dict | None = None
    duration_seconds: int | None = Field(None, ge=5, le=120)
    position: int | None = None
    active_from: datetime | None = None
    active_until: datetime | None = None
    is_active: bool | None = None


class SlideResponse(BaseModel):
    slide_id: UUID
    playlist_id: UUID
    slide_type: str
    position: int
    duration_seconds: int
    config: dict = {}
    active_from: datetime | None = None
    active_until: datetime | None = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class PlaylistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    outlet_id: UUID | None = None
    is_default: bool = False


class PlaylistPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    is_default: bool | None = None
    is_active: bool | None = None


class PlaylistResponse(BaseModel):
    playlist_id: UUID
    tenant_id: UUID
    outlet_id: UUID | None = None
    name: str
    is_default: bool
    is_active: bool
    updated_at: datetime
    slides: list[SlideResponse] = []

    model_config = ConfigDict(from_attributes=True)


class SlideReorderRequest(BaseModel):
    slide_ids: list[UUID] = Field(..., min_length=1)


# ── Signage data feeds (device-facing) ───────────────────────────────────────

class OrderBoardEntry(BaseModel):
    order_id: UUID
    pickup_number: int
    status: str


class OrderBoardResponse(BaseModel):
    orders: list[OrderBoardEntry]


class TrendingItemEntry(BaseModel):
    item_id: UUID
    name: str
    image_url: str | None = None
    price: str
    quantity_sold: int
    rank: int


class TrendingItemsResponse(BaseModel):
    items: list[TrendingItemEntry]

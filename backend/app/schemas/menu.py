from pydantic import BaseModel, Field, ConfigDict, field_validator
from uuid import UUID
from datetime import datetime
from decimal import Decimal

# BR-MENU-4 (RFC-010): closed vocabularies. Allergens follow the EU FIC
# 1169/2011 canonical 14; dietary tags are the small local set.
FIC_ALLERGENS = frozenset({
    "gluten", "crustaceans", "eggs", "fish", "peanuts", "soybeans", "milk",
    "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs",
})
DIETARY_TAGS = frozenset({"vegetarian", "vegan", "halal", "spicy"})


def _validate_allergens(values: list[str] | None) -> list[str] | None:
    if values is None:
        return values
    unknown = set(values) - FIC_ALLERGENS
    if unknown:
        raise ValueError(f"Unknown allergen codes: {sorted(unknown)} — allowed: {sorted(FIC_ALLERGENS)}")
    return sorted(set(values))


def _validate_dietary(values: list[str] | None) -> list[str] | None:
    if values is None:
        return values
    unknown = set(values) - DIETARY_TAGS
    if unknown:
        raise ValueError(f"Unknown dietary tags: {sorted(unknown)} — allowed: {sorted(DIETARY_TAGS)}")
    return sorted(set(values))


class CategoryResponse(BaseModel):
    category_id: int
    name: str
    icon_url: str | None = None
    display_order: int

    model_config = ConfigDict(from_attributes=True)


class MenuItemCreate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    image_url: str | None = None
    is_available: bool = True
    is_homemade: bool = False
    prep_time_mins: int = 10
    allergens: list[str] = Field(default_factory=list)
    dietary_tags: list[str] = Field(default_factory=list)

    _chk_allergens = field_validator("allergens")(_validate_allergens)
    _chk_dietary = field_validator("dietary_tags")(_validate_dietary)


class MenuItemUpdate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    image_url: str | None = None
    is_available: bool
    is_homemade: bool
    prep_time_mins: int = 10
    allergens: list[str] = Field(default_factory=list)
    dietary_tags: list[str] = Field(default_factory=list)

    _chk_allergens = field_validator("allergens")(_validate_allergens)
    _chk_dietary = field_validator("dietary_tags")(_validate_dietary)


class MenuItemPatch(BaseModel):
    """Partial update — all fields optional."""
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    image_url: str | None = None
    is_available: bool | None = None
    is_homemade: bool | None = None
    prep_time_mins: int | None = None
    allergens: list[str] | None = None
    dietary_tags: list[str] | None = None

    _chk_allergens = field_validator("allergens")(_validate_allergens)
    _chk_dietary = field_validator("dietary_tags")(_validate_dietary)


class MenuItemResponse(BaseModel):
    item_id: UUID
    category_id: int
    name: str
    description: str | None = None
    price: Decimal
    image_url: str | None = None
    is_available: bool
    is_homemade: bool
    prep_time_mins: int
    allergens: list[str] = []
    dietary_tags: list[str] = []
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

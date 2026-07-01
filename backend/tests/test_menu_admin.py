"""Phase 18 tests — Admin menu management endpoints.

Coverage:
  POST /menu/categories                   — create category
  DELETE /menu/categories/{id}            — blocked when items exist
  PUT /menu/categories/{id}               — rename category
  POST /menu/items/{id}/image             — image upload (valid + invalid type)
  PATCH /menu/items/{item_id}/availability — toggle availability (existing endpoint)
"""
from __future__ import annotations

import io
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu import Category, MenuItem
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import SLUG_ALPHA, get_token


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def alpha_category(db_session: AsyncSession, tenants: dict[str, Tenant]) -> Category:
    cat = Category(
        tenant_id=tenants["alpha"].tenant_id,
        name="Main Dishes",
        display_order=0,
    )
    db_session.add(cat)
    await db_session.commit()
    await db_session.refresh(cat)
    return cat


@pytest_asyncio.fixture
async def alpha_item(
    db_session: AsyncSession,
    tenants: dict[str, Tenant],
    alpha_category: Category,
) -> MenuItem:
    item = MenuItem(
        item_id=uuid.uuid4(),
        tenant_id=tenants["alpha"].tenant_id,
        category_id=alpha_category.category_id,
        name="Chicken Biryani",
        price="120.00",
        is_available=True,
        is_homemade=False,
        prep_time_mins=20,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_category(
    async_client: AsyncClient,
    users: dict[str, User],
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/menu/categories?name=Beverages&display_order=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Beverages"
    assert data["display_order"] == 1
    assert "category_id" in data


@pytest.mark.asyncio
async def test_delete_category_with_items_blocked(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_category: Category,
    alpha_item: MenuItem,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.delete(
        f"/api/v1/menu/categories/{alpha_category.category_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "items" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_category_renames(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_category: Category,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.put(
        f"/api/v1/menu/categories/{alpha_category.category_id}?name=Starters&display_order=0",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Starters"


@pytest.mark.asyncio
async def test_image_upload_valid(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_item: MenuItem,
    tmp_path,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    # Minimal 1x1 white PNG bytes (valid PNG header + IHDR + IDAT + IEND)
    minimal_png = (
        b"\x89PNG\r\n\x1a\n"  # PNG signature
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    resp = await async_client.post(
        f"/api/v1/menu/items/{alpha_item.item_id}/image",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": ("test.png", io.BytesIO(minimal_png), "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "image_url" in data
    assert str(alpha_item.item_id) in data["image_url"]
    assert data["image_url"].endswith(".png")


@pytest.mark.asyncio
async def test_image_upload_invalid_type(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_item: MenuItem,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        f"/api/v1/menu/items/{alpha_item.item_id}/image",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": ("doc.pdf", io.BytesIO(b"%PDF content"), "application/pdf")},
    )
    assert resp.status_code == 400
    assert "PNG" in resp.json()["detail"] or "JPEG" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_toggle_availability(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_item: MenuItem,
) -> None:
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    # Toggle off
    resp = await async_client.patch(
        f"/api/v1/menu/items/{alpha_item.item_id}/toggle",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_available": False},
    )
    assert resp.status_code == 200
    assert resp.json()["is_available"] is False
    # Toggle back on
    resp2 = await async_client.patch(
        f"/api/v1/menu/items/{alpha_item.item_id}/toggle",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_available": True},
    )
    assert resp2.status_code == 200
    assert resp2.json()["is_available"] is True

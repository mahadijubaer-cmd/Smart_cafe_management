"""Phase 16 tests — Admin table management endpoints.

Coverage:
  PUT /tables/{id}     — full metadata update (TR-2 position bounds)
  PATCH /tables/layout — batch position update (TR-3 duplicate check, cross-tenant guard)
  DELETE /tables/{id}  — delete guard against active orders (TR-1)
  POST /tables/        — create table (existing router, added in Phase 16)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import TablesMap
from app.models.order import Order, OrderStatus
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import SLUG_ALPHA, SLUG_BETA, get_token


# ─────────────────────────────────────────────────────────────────────────────
# Helper fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def alpha_table(db_session: AsyncSession, tenants: dict[str, Tenant]) -> TablesMap:
    """One table owned by the alpha tenant."""
    table = TablesMap(
        tenant_id=tenants["alpha"].tenant_id,
        table_number="T-01",
        zone="indoor",
        capacity=4,
        position_x=0,
        position_y=0,
    )
    db_session.add(table)
    await db_session.commit()
    await db_session.refresh(table)
    return table


@pytest_asyncio.fixture
async def beta_table(db_session: AsyncSession, tenants: dict[str, Tenant]) -> TablesMap:
    """One table owned by the beta tenant."""
    table = TablesMap(
        tenant_id=tenants["beta"].tenant_id,
        table_number="B-01",
        zone="patio",
        capacity=2,
        position_x=1,
        position_y=1,
    )
    db_session.add(table)
    await db_session.commit()
    await db_session.refresh(table)
    return table


@pytest_asyncio.fixture
async def table_with_active_order(
    db_session: AsyncSession,
    tenants: dict[str, Tenant],
    users: dict[str, User],
) -> TablesMap:
    """Alpha table that has a pending order attached."""
    table = TablesMap(
        tenant_id=tenants["alpha"].tenant_id,
        table_number="T-99",
        zone="indoor",
        capacity=4,
        position_x=5,
        position_y=5,
    )
    db_session.add(table)
    await db_session.flush()

    order = Order(
        tenant_id=tenants["alpha"].tenant_id,
        user_id=users["alpha_customer"].user_id,
        table_id=table.table_id,
        status=OrderStatus.pending,
        total_amount=100.0,
        time_slot=datetime.now(timezone.utc),
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(table)
    return table


# ─────────────────────────────────────────────────────────────────────────────
# POST /tables/ — create
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_table(
    async_client: AsyncClient,
    users: dict[str, User],
):
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.post(
        "/api/v1/tables/",
        json={"table_number": "T-NEW", "zone": "outdoor", "capacity": 6},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["table_number"] == "T-NEW"
    assert data["zone"] == "outdoor"
    assert data["capacity"] == 6


# ─────────────────────────────────────────────────────────────────────────────
# PUT /tables/{id} — full metadata update
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_put_table_updates_metadata(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_table: TablesMap,
):
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.put(
        f"/api/v1/tables/{alpha_table.table_id}",
        json={
            "table_number": "T-02",
            "zone": "terrace",
            "capacity": 8,
            "position_x": 3,
            "position_y": 2,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["table_number"] == "T-02"
    assert data["zone"] == "terrace"
    assert data["capacity"] == 8
    assert data["position_x"] == 3
    assert data["position_y"] == 2


@pytest.mark.asyncio
async def test_put_table_wrong_tenant(
    async_client: AsyncClient,
    users: dict[str, User],
    beta_table: TablesMap,
):
    """Alpha admin cannot update beta's table — must get 404."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.put(
        f"/api/v1/tables/{beta_table.table_id}",
        json={
            "table_number": "HACKED",
            "zone": "indoor",
            "capacity": 4,
            "position_x": 0,
            "position_y": 0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_table_position_out_of_bounds(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_table: TablesMap,
):
    """position_x > 11 must be rejected by schema validation (422)."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.put(
        f"/api/v1/tables/{alpha_table.table_id}",
        json={
            "table_number": "T-01",
            "zone": "indoor",
            "capacity": 4,
            "position_x": 15,  # out of bounds
            "position_y": 0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /tables/{id}
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_table_no_active_orders(
    async_client: AsyncClient,
    users: dict[str, User],
    alpha_table: TablesMap,
):
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.delete(
        f"/api/v1/tables/{alpha_table.table_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_table_with_active_order(
    async_client: AsyncClient,
    users: dict[str, User],
    table_with_active_order: TablesMap,
):
    """TR-1: table with a pending order cannot be deleted."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.delete(
        f"/api/v1/tables/{table_with_active_order.table_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "active orders" in resp.json()["detail"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /tables/layout — batch update
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_layout_batch_update(
    async_client: AsyncClient,
    users: dict[str, User],
    db_session: AsyncSession,
    tenants: dict[str, Tenant],
):
    """PATCH /tables/layout updates all positions in one call."""
    # Create 2 tables for alpha
    t1 = TablesMap(
        tenant_id=tenants["alpha"].tenant_id,
        table_number="A1",
        zone="indoor",
        capacity=2,
        position_x=0,
        position_y=0,
    )
    t2 = TablesMap(
        tenant_id=tenants["alpha"].tenant_id,
        table_number="A2",
        zone="indoor",
        capacity=2,
        position_x=1,
        position_y=0,
    )
    db_session.add_all([t1, t2])
    await db_session.commit()
    await db_session.refresh(t1)
    await db_session.refresh(t2)

    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        "/api/v1/tables/layout",
        json={
            "tables": [
                {"table_id": t1.table_id, "position_x": 3, "position_y": 2, "zone": "outdoor", "capacity": 4},
                {"table_id": t2.table_id, "position_x": 5, "position_y": 4, "zone": "outdoor", "capacity": 4},
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    positions = {item["table_id"]: (item["position_x"], item["position_y"]) for item in data}
    assert positions[t1.table_id] == (3, 2)
    assert positions[t2.table_id] == (5, 4)


@pytest.mark.asyncio
async def test_layout_batch_duplicate_position(
    async_client: AsyncClient,
    users: dict[str, User],
    db_session: AsyncSession,
    tenants: dict[str, Tenant],
):
    """TR-3: two tables at same (x,y) in batch → 400."""
    t1 = TablesMap(
        tenant_id=tenants["alpha"].tenant_id,
        table_number="D1",
        zone="indoor",
        capacity=2,
        position_x=0,
        position_y=0,
    )
    t2 = TablesMap(
        tenant_id=tenants["alpha"].tenant_id,
        table_number="D2",
        zone="indoor",
        capacity=2,
        position_x=1,
        position_y=1,
    )
    db_session.add_all([t1, t2])
    await db_session.commit()
    await db_session.refresh(t1)
    await db_session.refresh(t2)

    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        "/api/v1/tables/layout",
        json={
            "tables": [
                {"table_id": t1.table_id, "position_x": 2, "position_y": 2, "zone": "indoor", "capacity": 2},
                {"table_id": t2.table_id, "position_x": 2, "position_y": 2, "zone": "indoor", "capacity": 2},
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "duplicate" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_layout_cross_tenant_rejected(
    async_client: AsyncClient,
    users: dict[str, User],
    beta_table: TablesMap,
):
    """Batch containing another tenant's table_id → 403."""
    token = await get_token(async_client, "admin@alpha.com", SLUG_ALPHA)
    resp = await async_client.patch(
        "/api/v1/tables/layout",
        json={
            "tables": [
                {
                    "table_id": beta_table.table_id,
                    "position_x": 0,
                    "position_y": 0,
                    "zone": "indoor",
                    "capacity": 4,
                }
            ]
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403

"""Inventory service tests.

Tests are at the service layer (direct function calls, no HTTP) for speed.
Each test gets a fresh SQLite in-memory DB via the db_session fixture.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import (
    InventoryItem,
    InventoryMovement,
    InventoryUnit,
    MenuItemRecipe,
    StockMovementType,
)
from app.models.menu import Category, MenuItem
from app.models.order import Order, OrderItem, OrderStatus
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole
from app.core.security import hash_password
from app.services import inventory_service


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _make_tenant(db: AsyncSession) -> Tenant:
    t = Tenant(
        tenant_id=uuid.uuid4(),
        tenant_type=TenantType.academic,
        name="Test Cafe",
        slug=f"test-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(t)
    await db.flush()
    return t


async def _make_user(db: AsyncSession, tenant_id: uuid.UUID) -> User:
    u = User(
        user_id=uuid.uuid4(), tenant_id=tenant_id,
        full_name="Test Admin", email=f"admin-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Password123!"),
        role=UserRole.tenant_admin, is_active=True,
    )
    db.add(u)
    await db.flush()
    return u


async def _make_inv_item(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    qty: float = 100.0,
    reorder: float = 10.0,
    is_central: bool = False,
    outlet_id: uuid.UUID | None = None,
) -> InventoryItem:
    item = InventoryItem(
        item_id=uuid.uuid4(),
        tenant_id=tenant_id,
        outlet_id=outlet_id,
        is_central=is_central,
        name=f"Item-{uuid.uuid4().hex[:4]}",
        unit=InventoryUnit.kg,
        quantity_on_hand=Decimal(str(qty)),
        reorder_level=Decimal(str(reorder)),
        reorder_quantity=Decimal("20"),
        unit_cost=Decimal("5.00"),
    )
    db.add(item)
    await db.flush()
    return item


async def _make_menu_item(db: AsyncSession, tenant_id: uuid.UUID) -> MenuItem:
    cat = Category(tenant_id=tenant_id, name=f"Cat-{uuid.uuid4().hex[:4]}", display_order=1)
    db.add(cat)
    await db.flush()
    mi = MenuItem(
        item_id=uuid.uuid4(),
        tenant_id=tenant_id,
        category_id=cat.category_id,
        name=f"Dish-{uuid.uuid4().hex[:4]}",
        price=Decimal("100.00"),
        is_available=True,
    )
    db.add(mi)
    await db.flush()
    return mi


async def _make_order_with_item(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    menu_item_id: uuid.UUID,
    quantity: int,
) -> Order:
    from datetime import datetime, timezone
    order = Order(
        order_id=uuid.uuid4(),
        tenant_id=tenant_id,
        user_id=user_id,
        time_slot=datetime.now(timezone.utc),
        status=OrderStatus.pending,
        total_amount=Decimal("100.00"),
    )
    db.add(order)
    await db.flush()

    oi = OrderItem(
        order_item_id=uuid.uuid4(),
        tenant_id=tenant_id,
        order_id=order.order_id,
        item_id=menu_item_id,
        quantity=quantity,
        unit_price=Decimal("100.00"),
    )
    db.add(oi)
    await db.flush()
    return order


# ─────────────────────────────────────────────────────────────────────────────
# Stock consumption
# ─────────────────────────────────────────────────────────────────────────────

async def test_consume_decrements_quantity(db_session: AsyncSession, fake_redis):
    tenant = await _make_tenant(db_session)
    user = await _make_user(db_session, tenant.tenant_id)
    menu_item = await _make_menu_item(db_session, tenant.tenant_id)
    inv_item = await _make_inv_item(db_session, tenant.tenant_id, qty=50.0)

    recipe = MenuItemRecipe(
        recipe_id=uuid.uuid4(),
        tenant_id=tenant.tenant_id,
        menu_item_id=menu_item.item_id,
        inventory_item_id=inv_item.item_id,
        quantity_per_serving=Decimal("2.0"),
    )
    db_session.add(recipe)
    await db_session.commit()

    order = await _make_order_with_item(db_session, tenant.tenant_id, user.user_id, menu_item.item_id, quantity=3)
    await db_session.commit()

    await inventory_service.consume_inventory_for_order(db_session, order, tenant.tenant_id)

    result = await db_session.execute(select(InventoryItem).where(InventoryItem.item_id == inv_item.item_id))
    updated = result.scalar_one()
    # Consumed: 2 kg/serving × 3 servings = 6 kg; started at 50
    assert float(updated.quantity_on_hand) == pytest.approx(44.0)


async def test_consume_logs_movement(db_session: AsyncSession, fake_redis):
    tenant = await _make_tenant(db_session)
    user = await _make_user(db_session, tenant.tenant_id)
    menu_item = await _make_menu_item(db_session, tenant.tenant_id)
    inv_item = await _make_inv_item(db_session, tenant.tenant_id, qty=30.0)

    db_session.add(MenuItemRecipe(
        recipe_id=uuid.uuid4(), tenant_id=tenant.tenant_id,
        menu_item_id=menu_item.item_id, inventory_item_id=inv_item.item_id,
        quantity_per_serving=Decimal("1.0"),
    ))
    await db_session.commit()

    order = await _make_order_with_item(db_session, tenant.tenant_id, user.user_id, menu_item.item_id, quantity=2)
    await db_session.commit()

    await inventory_service.consume_inventory_for_order(db_session, order, tenant.tenant_id)

    result = await db_session.execute(
        select(InventoryMovement)
        .where(InventoryMovement.inventory_item_id == inv_item.item_id)
    )
    movements = result.scalars().all()
    assert len(movements) == 1
    assert movements[0].movement_type == StockMovementType.consumption
    assert float(movements[0].quantity_delta) == pytest.approx(-2.0)
    assert float(movements[0].quantity_before) == pytest.approx(30.0)
    assert float(movements[0].quantity_after) == pytest.approx(28.0)


async def test_strict_mode_rejects_oversell(db_session: AsyncSession, fake_redis):
    """In strict mode, ordering more than available stock raises HTTP 400."""
    from fastapi import HTTPException
    tenant = await _make_tenant(db_session)
    user = await _make_user(db_session, tenant.tenant_id)
    menu_item = await _make_menu_item(db_session, tenant.tenant_id)
    inv_item = await _make_inv_item(db_session, tenant.tenant_id, qty=1.0)  # only 1 kg

    db_session.add(MenuItemRecipe(
        recipe_id=uuid.uuid4(), tenant_id=tenant.tenant_id,
        menu_item_id=menu_item.item_id, inventory_item_id=inv_item.item_id,
        quantity_per_serving=Decimal("5.0"),  # needs 5 kg per serving
    ))
    await db_session.commit()

    order = await _make_order_with_item(db_session, tenant.tenant_id, user.user_id, menu_item.item_id, quantity=1)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        await inventory_service.consume_inventory_for_order(
            db_session, order, tenant.tenant_id, strict_mode=True
        )
    assert exc_info.value.status_code == 400
    assert "Insufficient" in exc_info.value.detail


# ─────────────────────────────────────────────────────────────────────────────
# Distributed lock
# ─────────────────────────────────────────────────────────────────────────────

async def test_distributed_lock_prevents_double_acquire(db_session: AsyncSession, fake_redis):
    """Acquiring a lock on the same item twice must fail on the second attempt."""
    item_id = uuid.uuid4()
    first = await inventory_service._acquire_lock(item_id)
    second = await inventory_service._acquire_lock(item_id)
    assert first is True
    assert second is False
    await inventory_service._release_lock(item_id)


async def test_lock_release_allows_reacquire(db_session: AsyncSession, fake_redis):
    item_id = uuid.uuid4()
    await inventory_service._acquire_lock(item_id)
    await inventory_service._release_lock(item_id)
    re_acquired = await inventory_service._acquire_lock(item_id)
    assert re_acquired is True
    await inventory_service._release_lock(item_id)


# ─────────────────────────────────────────────────────────────────────────────
# Low-stock alert
# ─────────────────────────────────────────────────────────────────────────────

async def test_low_stock_alert_published_when_below_reorder(db_session: AsyncSession, fake_redis):
    """check_and_alert_low_stock calls publish when quantity_on_hand <= reorder_level."""
    published_events: list[dict] = []

    async def _mock_publish(tenant_id, event, outlet_id=None):
        published_events.append(event)

    from unittest.mock import patch
    import app.services.inventory_service as inv_mod

    tenant = await _make_tenant(db_session)
    item = await _make_inv_item(db_session, tenant.tenant_id, qty=5.0, reorder=10.0)
    await db_session.commit()

    with patch.object(inv_mod, "publish_event", side_effect=_mock_publish):
        await inventory_service.check_and_alert_low_stock(item, tenant.tenant_id)

    assert len(published_events) == 1
    assert published_events[0]["type"] == "LOW_STOCK"
    assert published_events[0]["item_name"] == item.name


async def test_no_alert_when_above_reorder(db_session: AsyncSession, fake_redis):
    from unittest.mock import patch
    import app.services.inventory_service as inv_mod

    tenant = await _make_tenant(db_session)
    item = await _make_inv_item(db_session, tenant.tenant_id, qty=50.0, reorder=10.0)
    await db_session.commit()

    calls: list = []
    with patch.object(inv_mod, "publish_event", side_effect=lambda *a, **kw: calls.append(a)):
        await inventory_service.check_and_alert_low_stock(item, tenant.tenant_id)

    assert calls == []


# ─────────────────────────────────────────────────────────────────────────────
# Stock transfer (central → outlet)
# ─────────────────────────────────────────────────────────────────────────────

async def test_transfer_moves_stock_to_outlet(db_session: AsyncSession, fake_redis):
    """transfer_to_outlet decrements central stock and increments outlet stock."""
    brand = await _make_tenant(db_session)
    outlet = await _make_tenant(db_session)
    user = await _make_user(db_session, brand.tenant_id)

    central_item = await _make_inv_item(
        db_session, brand.tenant_id, qty=100.0, is_central=True
    )
    outlet_item = await _make_inv_item(
        db_session, brand.tenant_id, qty=20.0, outlet_id=outlet.tenant_id
    )
    await db_session.commit()

    qty = Decimal("30")
    updated_central, updated_outlet = await inventory_service.transfer_to_outlet(
        db_session, central_item, outlet_item, qty,
        tenant_id=brand.tenant_id,
        performed_by=user.user_id,
        notes="Test transfer",
    )

    assert float(updated_central.quantity_on_hand) == pytest.approx(70.0)
    assert float(updated_outlet.quantity_on_hand) == pytest.approx(50.0)


async def test_transfer_fails_when_central_insufficient(db_session: AsyncSession, fake_redis):
    from fastapi import HTTPException
    brand = await _make_tenant(db_session)
    outlet = await _make_tenant(db_session)
    user = await _make_user(db_session, brand.tenant_id)

    central_item = await _make_inv_item(db_session, brand.tenant_id, qty=5.0, is_central=True)
    outlet_item = await _make_inv_item(db_session, brand.tenant_id, qty=0.0, outlet_id=outlet.tenant_id)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        await inventory_service.transfer_to_outlet(
            db_session, central_item, outlet_item, Decimal("100"),
            tenant_id=brand.tenant_id,
            performed_by=user.user_id,
            notes=None,
        )
    assert exc_info.value.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# Manual stock adjustment
# ─────────────────────────────────────────────────────────────────────────────

async def test_adjust_stock_positive_delta(db_session: AsyncSession, fake_redis):
    tenant = await _make_tenant(db_session)
    user = await _make_user(db_session, tenant.tenant_id)
    item = await _make_inv_item(db_session, tenant.tenant_id, qty=10.0)
    await db_session.commit()

    updated = await inventory_service.adjust_stock(
        db_session, item, Decimal("15"), tenant.tenant_id, user.user_id, notes="Restock"
    )
    assert float(updated.quantity_on_hand) == pytest.approx(25.0)


async def test_adjust_stock_negative_logs_waste(db_session: AsyncSession, fake_redis):
    tenant = await _make_tenant(db_session)
    user = await _make_user(db_session, tenant.tenant_id)
    item = await _make_inv_item(db_session, tenant.tenant_id, qty=20.0)
    await db_session.commit()

    await inventory_service.adjust_stock(
        db_session, item, Decimal("-5"), tenant.tenant_id, user.user_id, notes="Spillage"
    )

    result = await db_session.execute(
        select(InventoryMovement)
        .where(InventoryMovement.inventory_item_id == item.item_id)
    )
    movement = result.scalar_one()
    assert movement.movement_type == StockMovementType.waste
    assert float(movement.quantity_delta) == pytest.approx(-5.0)

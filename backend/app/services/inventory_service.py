"""Inventory service — stock management, distributed locks, and low-stock alerts.

Redis key layout:
  lock:inventory:{item_id}        → distributed lock (SETNX), TTL 10s
  pubsub:low_stock                → Redis channel for low-stock events (Phase 6 subscriber)
"""
import logging
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.redis import get_redis
from app.services.ws_pubsub import publish_event
from app.models.inventory import (
    InventoryCategory,
    InventoryItem,
    InventoryMovement,
    MenuItemRecipe,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    StockMovementType,
)
from app.models.order import Order, OrderItem

logger = logging.getLogger(__name__)

LOCK_TTL = 10  # seconds — distributed lock for stock mutations


# ─────────────────────────────────────────────
# DISTRIBUTED LOCK HELPERS
# ─────────────────────────────────────────────

async def _acquire_lock(item_id: UUID) -> bool:
    redis = await get_redis()
    key = f"lock:inventory:{item_id}"
    acquired = await redis.set(key, "1", nx=True, ex=LOCK_TTL)
    return bool(acquired)


async def _release_lock(item_id: UUID) -> None:
    redis = await get_redis()
    await redis.delete(f"lock:inventory:{item_id}")


# ─────────────────────────────────────────────
# LOW-STOCK ALERT
# ─────────────────────────────────────────────

async def check_and_alert_low_stock(item: InventoryItem, tenant_id: UUID) -> None:
    """Publish a LOW_STOCK event via Redis pub/sub if item is at or below reorder level."""
    qty = float(item.quantity_on_hand)
    reorder = float(item.reorder_level)
    if qty <= reorder:
        logger.warning(
            "LOW_STOCK alert: %s (qty=%.3f, reorder=%.3f) for tenant %s",
            item.name, qty, reorder, tenant_id,
        )
        await publish_event(tenant_id, {
            "type": "LOW_STOCK",
            "item_id": str(item.item_id),
            "item_name": item.name,
            "quantity_on_hand": qty,
            "reorder_level": reorder,
            "unit": item.unit.value if hasattr(item.unit, "value") else str(item.unit),
        })


# ─────────────────────────────────────────────
# CONSUME INVENTORY FOR ORDER
# ─────────────────────────────────────────────

async def consume_inventory_for_order(
    db: AsyncSession,
    order: Order,
    tenant_id: UUID,
    strict_mode: bool = False,
) -> None:
    """Deduct stock for every ordered menu item using its recipe.

    Each inventory item is locked individually during the deduction to prevent
    race conditions on concurrent orders.  If strict_mode is True, an order is
    rejected when any ingredient would go negative; in lenient mode the
    deduction proceeds and a deficit is logged.
    """
    # Load order items with menu item ids
    result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order.order_id)
    )
    order_items = result.scalars().all()

    for oi in order_items:
        # Find recipes for this menu item
        result = await db.execute(
            select(MenuItemRecipe).where(
                MenuItemRecipe.menu_item_id == oi.item_id,
                MenuItemRecipe.tenant_id == tenant_id,
            )
        )
        recipes = result.scalars().all()

        for recipe in recipes:
            needed = Decimal(str(recipe.quantity_per_serving)) * Decimal(str(oi.quantity))

            # Acquire distributed lock for this inventory item
            locked = await _acquire_lock(recipe.inventory_item_id)
            if not locked:
                logger.warning(
                    "Could not acquire inventory lock for item %s — skipping deduction",
                    recipe.inventory_item_id,
                )
                continue

            try:
                result = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.item_id == recipe.inventory_item_id,
                        InventoryItem.tenant_id == tenant_id,
                    )
                )
                inv_item = result.scalar_one_or_none()
                if inv_item is None:
                    continue

                qty_before = Decimal(str(inv_item.quantity_on_hand))
                qty_after = qty_before - needed

                if strict_mode and qty_after < 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient stock for '{inv_item.name}': "
                               f"need {needed}, have {qty_before}",
                    )

                inv_item.quantity_on_hand = qty_after

                db.add(InventoryMovement(
                    tenant_id=tenant_id,
                    inventory_item_id=inv_item.item_id,
                    movement_type=StockMovementType.consumption,
                    quantity_delta=-needed,
                    quantity_before=qty_before,
                    quantity_after=qty_after,
                    order_id=order.order_id,
                    performed_by=order.user_id,
                    notes=f"Auto-deducted for order {str(order.order_id)[:8]}",
                ))

                await check_and_alert_low_stock(inv_item, tenant_id)

            finally:
                await _release_lock(recipe.inventory_item_id)

    await db.commit()


# ─────────────────────────────────────────────
# MANUAL STOCK ADJUSTMENT
# ─────────────────────────────────────────────

async def adjust_stock(
    db: AsyncSession,
    item: InventoryItem,
    quantity_delta: Decimal,
    tenant_id: UUID,
    performed_by: UUID,
    notes: str | None,
) -> InventoryItem:
    locked = await _acquire_lock(item.item_id)
    if not locked:
        raise HTTPException(status_code=409, detail="Item is being updated; please retry")

    try:
        qty_before = Decimal(str(item.quantity_on_hand))
        qty_after = qty_before + quantity_delta
        item.quantity_on_hand = qty_after

        movement_type = (
            StockMovementType.adjustment if quantity_delta >= 0 else StockMovementType.waste
        )
        db.add(InventoryMovement(
            tenant_id=tenant_id,
            inventory_item_id=item.item_id,
            movement_type=movement_type,
            quantity_delta=quantity_delta,
            quantity_before=qty_before,
            quantity_after=qty_after,
            performed_by=performed_by,
            notes=notes,
        ))
        await db.commit()
        await db.refresh(item)
        await check_and_alert_low_stock(item, tenant_id)
    finally:
        await _release_lock(item.item_id)

    return item


# ─────────────────────────────────────────────
# TRANSFER FROM CENTRAL TO OUTLET
# ─────────────────────────────────────────────

async def transfer_to_outlet(
    db: AsyncSession,
    central_item: InventoryItem,
    outlet_item: InventoryItem,
    quantity: Decimal,
    tenant_id: UUID,
    performed_by: UUID,
    notes: str | None,
) -> tuple[InventoryItem, InventoryItem]:
    """Move stock from a central inventory item to an outlet inventory item."""
    locked_central = await _acquire_lock(central_item.item_id)
    locked_outlet = await _acquire_lock(outlet_item.item_id)

    if not (locked_central and locked_outlet):
        if locked_central:
            await _release_lock(central_item.item_id)
        if locked_outlet:
            await _release_lock(outlet_item.item_id)
        raise HTTPException(status_code=409, detail="Inventory lock contention; please retry")

    try:
        central_before = Decimal(str(central_item.quantity_on_hand))
        if central_before < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Central stock insufficient: need {quantity}, have {central_before}",
            )

        outlet_before = Decimal(str(outlet_item.quantity_on_hand))
        central_item.quantity_on_hand = central_before - quantity
        outlet_item.quantity_on_hand = outlet_before + quantity

        db.add(InventoryMovement(
            tenant_id=tenant_id,
            inventory_item_id=central_item.item_id,
            movement_type=StockMovementType.transfer_out,
            quantity_delta=-quantity,
            quantity_before=central_before,
            quantity_after=central_item.quantity_on_hand,
            performed_by=performed_by,
            notes=notes,
        ))
        db.add(InventoryMovement(
            tenant_id=tenant_id,
            inventory_item_id=outlet_item.item_id,
            movement_type=StockMovementType.transfer_in,
            quantity_delta=quantity,
            quantity_before=outlet_before,
            quantity_after=outlet_item.quantity_on_hand,
            performed_by=performed_by,
            notes=notes,
        ))

        await db.commit()
        await db.refresh(central_item)
        await db.refresh(outlet_item)
        await check_and_alert_low_stock(central_item, tenant_id)
    finally:
        await _release_lock(central_item.item_id)
        await _release_lock(outlet_item.item_id)

    return central_item, outlet_item


# ─────────────────────────────────────────────
# RECEIVE PURCHASE ORDER
# ─────────────────────────────────────────────

async def receive_purchase_order(
    db: AsyncSession,
    po: PurchaseOrder,
    received_quantities: dict[str, Decimal],
    tenant_id: UUID,
    performed_by: UUID,
    notes: str | None,
) -> PurchaseOrder:
    """Mark a PO as received and update inventory quantities."""
    if po.status not in (PurchaseOrderStatus.approved, PurchaseOrderStatus.submitted):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot receive a PO in '{po.status.value}' status",
        )

    result = await db.execute(
        select(PurchaseOrderItem)
        .options(selectinload(PurchaseOrderItem.inventory_item))
        .where(PurchaseOrderItem.po_id == po.po_id)
    )
    po_items = result.scalars().all()

    for po_item in po_items:
        qty_received = received_quantities.get(str(po_item.po_item_id), Decimal("0"))
        if qty_received <= 0:
            continue

        inv_item = po_item.inventory_item
        locked = await _acquire_lock(inv_item.item_id)
        if not locked:
            raise HTTPException(status_code=409, detail=f"Lock failed for item {inv_item.name}")

        try:
            qty_before = Decimal(str(inv_item.quantity_on_hand))
            qty_after = qty_before + qty_received
            inv_item.quantity_on_hand = qty_after
            po_item.quantity_received = qty_received

            db.add(InventoryMovement(
                tenant_id=tenant_id,
                inventory_item_id=inv_item.item_id,
                movement_type=StockMovementType.purchase,
                quantity_delta=qty_received,
                quantity_before=qty_before,
                quantity_after=qty_after,
                purchase_order_id=po.po_id,
                performed_by=performed_by,
                notes=notes or f"Received via PO {po.po_number}",
            ))
        finally:
            await _release_lock(inv_item.item_id)

    from datetime import datetime, timezone
    po.status = PurchaseOrderStatus.received
    po.received_at = datetime.now(timezone.utc)
    po.approved_by = performed_by

    await db.commit()
    await db.refresh(po)
    return po


# ─────────────────────────────────────────────
# STOCK SUMMARY REPORT
# ─────────────────────────────────────────────

async def get_stock_report(
    db: AsyncSession,
    tenant_id: UUID,
    outlet_id: UUID | None = None,
    is_central: bool | None = None,
) -> dict:
    query = select(InventoryItem).where(InventoryItem.tenant_id == tenant_id)
    if outlet_id is not None:
        query = query.where(InventoryItem.outlet_id == outlet_id)
    if is_central is not None:
        query = query.where(InventoryItem.is_central == is_central)

    result = await db.execute(query)
    items = result.scalars().all()

    total_value = Decimal("0")
    low_stock_count = 0
    summary_items = []

    for item in items:
        qty = Decimal(str(item.quantity_on_hand))
        reorder = Decimal(str(item.reorder_level))
        unit_cost = Decimal(str(item.unit_cost)) if item.unit_cost else None
        item_value = qty * unit_cost if unit_cost is not None else None
        is_low = qty <= reorder

        if is_low:
            low_stock_count += 1
        if item_value is not None:
            total_value += item_value

        summary_items.append({
            "item_id": item.item_id,
            "name": item.name,
            "sku": item.sku,
            "unit": item.unit,
            "quantity_on_hand": qty,
            "reorder_level": reorder,
            "is_low_stock": is_low,
            "unit_cost": unit_cost,
            "total_value": item_value,
        })

    return {
        "tenant_id": tenant_id,
        "total_items": len(items),
        "low_stock_count": low_stock_count,
        "total_inventory_value": total_value,
        "items": summary_items,
    }

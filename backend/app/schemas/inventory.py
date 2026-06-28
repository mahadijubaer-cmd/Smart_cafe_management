from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.inventory import InventoryUnit, PurchaseOrderStatus, StockMovementType


# ─────────────────────────────────────────────
# INVENTORY CATEGORY
# ─────────────────────────────────────────────

class InventoryCategoryCreate(BaseModel):
    name: str = Field(..., max_length=80)
    description: str | None = None


class InventoryCategoryResponse(BaseModel):
    inv_category_id: int
    tenant_id: UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# INVENTORY ITEM
# ─────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    inv_category_id: int | None = None
    outlet_id: UUID | None = None
    is_central: bool = False
    name: str = Field(..., max_length=150)
    sku: str | None = Field(None, max_length=50)
    unit: InventoryUnit = InventoryUnit.piece
    quantity_on_hand: Decimal = Decimal("0")
    reorder_level: Decimal = Decimal("0")
    reorder_quantity: Decimal = Decimal("0")
    unit_cost: Decimal | None = None
    supplier_name: str | None = None
    supplier_contact: str | None = None
    notes: str | None = None


class InventoryItemUpdate(BaseModel):
    inv_category_id: int | None = None
    name: str | None = Field(None, max_length=150)
    sku: str | None = None
    unit: InventoryUnit | None = None
    reorder_level: Decimal | None = None
    reorder_quantity: Decimal | None = None
    unit_cost: Decimal | None = None
    supplier_name: str | None = None
    supplier_contact: str | None = None
    notes: str | None = None


class InventoryItemResponse(BaseModel):
    item_id: UUID
    tenant_id: UUID
    outlet_id: UUID | None
    inv_category_id: int | None
    is_central: bool
    name: str
    sku: str | None
    unit: InventoryUnit
    quantity_on_hand: Decimal
    reorder_level: Decimal
    reorder_quantity: Decimal
    unit_cost: Decimal | None
    supplier_name: str | None
    supplier_contact: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StockAdjustRequest(BaseModel):
    quantity_delta: Decimal = Field(..., description="Positive to add stock, negative to remove")
    notes: str | None = None


# ─────────────────────────────────────────────
# MENU ITEM RECIPE
# ─────────────────────────────────────────────

class RecipeLineCreate(BaseModel):
    inventory_item_id: UUID
    quantity_per_serving: Decimal = Field(..., gt=0)


class RecipeLineResponse(BaseModel):
    recipe_id: UUID
    tenant_id: UUID
    menu_item_id: UUID
    inventory_item_id: UUID
    quantity_per_serving: Decimal

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# INVENTORY MOVEMENT
# ─────────────────────────────────────────────

class InventoryMovementResponse(BaseModel):
    movement_id: UUID
    tenant_id: UUID
    inventory_item_id: UUID
    movement_type: StockMovementType
    quantity_delta: Decimal
    quantity_before: Decimal
    quantity_after: Decimal
    order_id: UUID | None
    purchase_order_id: UUID | None
    performed_by: UUID | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# PURCHASE ORDER
# ─────────────────────────────────────────────

class PurchaseOrderLineCreate(BaseModel):
    inventory_item_id: UUID
    quantity_ordered: Decimal = Field(..., gt=0)
    unit_cost: Decimal | None = None


class PurchaseOrderCreate(BaseModel):
    outlet_id: UUID | None = None
    is_transfer: bool = False
    from_tenant_id: UUID | None = None
    po_number: str = Field(..., max_length=50)
    supplier_name: str | None = None
    supplier_contact: str | None = None
    expected_delivery: datetime | None = None
    notes: str | None = None
    line_items: list[PurchaseOrderLineCreate]


class PurchaseOrderLineResponse(BaseModel):
    po_item_id: UUID
    po_id: UUID
    inventory_item_id: UUID
    quantity_ordered: Decimal
    quantity_received: Decimal
    unit_cost: Decimal | None

    model_config = {"from_attributes": True}


class PurchaseOrderResponse(BaseModel):
    po_id: UUID
    tenant_id: UUID
    outlet_id: UUID | None
    is_transfer: bool
    from_tenant_id: UUID | None
    po_number: str
    status: PurchaseOrderStatus
    supplier_name: str | None
    supplier_contact: str | None
    expected_delivery: datetime | None
    received_at: datetime | None
    notes: str | None
    created_by: UUID | None
    approved_by: UUID | None
    created_at: datetime
    updated_at: datetime
    line_items: list[PurchaseOrderLineResponse]

    model_config = {"from_attributes": True}


class ReceivePORequest(BaseModel):
    received_quantities: dict[str, Decimal] = Field(
        ..., description="Map of po_item_id (str) → quantity actually received"
    )
    notes: str | None = None


# ─────────────────────────────────────────────
# REPORTS
# ─────────────────────────────────────────────

class StockSummaryItem(BaseModel):
    item_id: UUID
    name: str
    sku: str | None
    unit: InventoryUnit
    quantity_on_hand: Decimal
    reorder_level: Decimal
    is_low_stock: bool
    unit_cost: Decimal | None
    total_value: Decimal | None


class StockSummaryResponse(BaseModel):
    tenant_id: UUID
    total_items: int
    low_stock_count: int
    total_inventory_value: Decimal
    items: list[StockSummaryItem]


class TransferRequest(BaseModel):
    inventory_item_id: UUID
    outlet_id: UUID
    quantity: Decimal = Field(..., gt=0)
    notes: str | None = None

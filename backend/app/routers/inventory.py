"""Inventory router — stock management endpoints.

All routes are scoped to the caller's tenant via TenantContext.
Role abbreviations used in this file:
  INV_ADMINS  = outlet_admin, tenant_admin, super_admin
  APPROVERS   = tenant_admin, super_admin
"""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import TenantContext, get_current_user, get_tenant_context, require_role
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
from app.models.user import User, UserRole
from app.schemas.inventory import (
    InventoryCategoryCreate,
    InventoryCategoryResponse,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryMovementResponse,
    PurchaseOrderCreate,
    PurchaseOrderResponse,
    ReceivePORequest,
    RecipeLineCreate,
    RecipeLineResponse,
    StockAdjustRequest,
    StockSummaryResponse,
    TransferRequest,
)
from app.models.tenant import Tenant
from app.services import inventory_service, pdf_service

router = APIRouter(prefix="/inventory", tags=["inventory"])

# Role sets for this module
_INV_ADMINS = (UserRole.outlet_admin, UserRole.tenant_admin, UserRole.super_admin)
_APPROVERS = (UserRole.tenant_admin, UserRole.super_admin)


# ─────────────────────────────────────────────
# INVENTORY CATEGORIES
# ─────────────────────────────────────────────

@router.get("/categories", response_model=list[InventoryCategoryResponse])
async def list_categories(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    result = await db.execute(
        select(InventoryCategory)
        .where(InventoryCategory.tenant_id == ctx.tenant_id)
        .order_by(InventoryCategory.name)
    )
    return result.scalars().all()


@router.post("/categories", response_model=InventoryCategoryResponse, status_code=201)
async def create_category(
    data: InventoryCategoryCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    cat = InventoryCategory(tenant_id=ctx.tenant_id, **data.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


# ─────────────────────────────────────────────
# INVENTORY ITEMS
# NOTE: /items/low-stock MUST precede /items/{item_id} to avoid ambiguity.
# ─────────────────────────────────────────────

@router.get("/items/low-stock", response_model=list[InventoryItemResponse])
async def list_low_stock(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    """Items whose quantity_on_hand is at or below reorder_level."""
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.tenant_id == ctx.tenant_id,
            InventoryItem.quantity_on_hand <= InventoryItem.reorder_level,
        )
    )
    return result.scalars().all()


@router.get("/items", response_model=list[InventoryItemResponse])
async def list_inventory_items(
    outlet_id: UUID = Query(None),
    is_central: bool = Query(None),
    inv_category_id: int = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    query = select(InventoryItem).where(InventoryItem.tenant_id == ctx.tenant_id)
    if outlet_id is not None:
        query = query.where(InventoryItem.outlet_id == outlet_id)
    if is_central is not None:
        query = query.where(InventoryItem.is_central == is_central)
    if inv_category_id is not None:
        query = query.where(InventoryItem.inv_category_id == inv_category_id)
    result = await db.execute(query.order_by(InventoryItem.name))
    return result.scalars().all()


async def _validate_inv_category_id(db: AsyncSession, tenant_id: UUID, inv_category_id: int) -> None:
    """Ensure inv_category_id belongs to the caller's own tenant.

    Without this, the FK (`ON DELETE SET NULL`) doesn't reject a category_id that exists but
    belongs to a *different* tenant, silently creating a cross-tenant category link.
    """
    exists = await db.scalar(
        select(InventoryCategory.inv_category_id).where(
            InventoryCategory.inv_category_id == inv_category_id,
            InventoryCategory.tenant_id == tenant_id,
        )
    )
    if exists is None:
        raise HTTPException(
            status_code=400, detail="inv_category_id does not exist for this tenant"
        )


@router.post("/items", response_model=InventoryItemResponse, status_code=201)
async def create_inventory_item(
    data: InventoryItemCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    if data.inv_category_id is not None:
        await _validate_inv_category_id(db, ctx.tenant_id, data.inv_category_id)
    item = InventoryItem(tenant_id=ctx.tenant_id, **data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/items/{item_id}", response_model=InventoryItemResponse)
async def get_inventory_item(
    item_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.item_id == item_id,
            InventoryItem.tenant_id == ctx.tenant_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return item


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
async def update_inventory_item(
    item_id: UUID,
    data: InventoryItemUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.item_id == item_id,
            InventoryItem.tenant_id == ctx.tenant_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if data.inv_category_id is not None:
        await _validate_inv_category_id(db, ctx.tenant_id, data.inv_category_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/items/{item_id}/adjust", response_model=InventoryItemResponse)
async def adjust_stock(
    item_id: UUID,
    data: StockAdjustRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.outlet_admin, UserRole.tenant_admin)),
):
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.item_id == item_id,
            InventoryItem.tenant_id == ctx.tenant_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return await inventory_service.adjust_stock(
        db=db,
        item=item,
        quantity_delta=data.quantity_delta,
        tenant_id=ctx.tenant_id,
        performed_by=current_user.user_id,
        notes=data.notes,
    )


# ─────────────────────────────────────────────
# MENU ITEM RECIPES
# ─────────────────────────────────────────────

@router.get("/items/{item_id}/recipes", response_model=list[RecipeLineResponse])
async def get_recipes_for_menu_item(
    item_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    """List all inventory requirements for a given menu item UUID."""
    result = await db.execute(
        select(MenuItemRecipe).where(
            MenuItemRecipe.menu_item_id == item_id,
            MenuItemRecipe.tenant_id == ctx.tenant_id,
        )
    )
    return result.scalars().all()


@router.post("/items/{item_id}/recipes", response_model=RecipeLineResponse, status_code=201)
async def add_recipe_line(
    item_id: UUID,
    data: RecipeLineCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    recipe = MenuItemRecipe(
        tenant_id=ctx.tenant_id,
        menu_item_id=item_id,
        inventory_item_id=data.inventory_item_id,
        quantity_per_serving=data.quantity_per_serving,
    )
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)
    return recipe


@router.delete("/items/{item_id}/recipes/{recipe_id}", status_code=204)
async def delete_recipe_line(
    item_id: UUID,
    recipe_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    result = await db.execute(
        select(MenuItemRecipe).where(
            MenuItemRecipe.recipe_id == recipe_id,
            MenuItemRecipe.menu_item_id == item_id,
            MenuItemRecipe.tenant_id == ctx.tenant_id,
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe line not found")
    await db.delete(recipe)
    await db.commit()


# ─────────────────────────────────────────────
# STOCK MOVEMENTS (audit log)
# ─────────────────────────────────────────────

@router.get("/movements", response_model=list[InventoryMovementResponse])
async def list_movements(
    item_id: UUID = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    query = (
        select(InventoryMovement)
        .where(InventoryMovement.tenant_id == ctx.tenant_id)
        .order_by(InventoryMovement.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if item_id is not None:
        query = query.where(InventoryMovement.inventory_item_id == item_id)
    result = await db.execute(query)
    return result.scalars().all()


# ─────────────────────────────────────────────
# CENTRAL INVENTORY (franchise brand only)
# ─────────────────────────────────────────────

@router.get("/central", response_model=list[InventoryItemResponse])
async def list_central_inventory(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.super_admin)),
):
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.tenant_id == ctx.tenant_id,
            InventoryItem.is_central.is_(True),
        )
    )
    return result.scalars().all()


@router.post("/central/items", response_model=InventoryItemResponse, status_code=201)
async def create_central_item(
    data: InventoryItemCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.super_admin)),
):
    payload = data.model_dump()
    payload["is_central"] = True
    payload["outlet_id"] = None
    item = InventoryItem(tenant_id=ctx.tenant_id, **payload)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


# ─────────────────────────────────────────────
# STOCK TRANSFER (central → outlet)
# ─────────────────────────────────────────────

@router.post("/transfer", response_model=dict)
async def transfer_stock(
    data: TransferRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin, UserRole.outlet_admin)),
):
    # Resolve source (central) item
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.item_id == data.inventory_item_id,
            InventoryItem.tenant_id == ctx.tenant_id,
            InventoryItem.is_central.is_(True),
        )
    )
    central_item = result.scalar_one_or_none()
    if not central_item:
        raise HTTPException(status_code=404, detail="Central inventory item not found")

    # Find or raise outlet item with same SKU/name
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.tenant_id == ctx.tenant_id,
            InventoryItem.outlet_id == data.outlet_id,
            InventoryItem.name == central_item.name,
        )
    )
    outlet_item = result.scalar_one_or_none()
    if not outlet_item:
        # Auto-create outlet counterpart
        outlet_item = InventoryItem(
            tenant_id=ctx.tenant_id,
            outlet_id=data.outlet_id,
            inv_category_id=central_item.inv_category_id,
            is_central=False,
            name=central_item.name,
            sku=central_item.sku,
            unit=central_item.unit,
            quantity_on_hand=Decimal("0"),
            reorder_level=central_item.reorder_level,
            reorder_quantity=central_item.reorder_quantity,
            unit_cost=central_item.unit_cost,
        )
        db.add(outlet_item)
        await db.flush()

    central_item, outlet_item = await inventory_service.transfer_to_outlet(
        db=db,
        central_item=central_item,
        outlet_item=outlet_item,
        quantity=data.quantity,
        tenant_id=ctx.tenant_id,
        performed_by=current_user.user_id,
        notes=data.notes,
    )
    return {
        "message": "Transfer complete",
        "central_qty_after": float(central_item.quantity_on_hand),
        "outlet_qty_after": float(outlet_item.quantity_on_hand),
    }


# ─────────────────────────────────────────────
# PURCHASE ORDERS
# ─────────────────────────────────────────────

@router.get("/purchase-orders", response_model=list[PurchaseOrderResponse])
async def list_purchase_orders(
    status: str = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    query = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.line_items))
        .where(PurchaseOrder.tenant_id == ctx.tenant_id)
        .order_by(PurchaseOrder.created_at.desc())
    )
    if status:
        try:
            query = query.where(PurchaseOrder.status == PurchaseOrderStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/purchase-orders", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(
    data: PurchaseOrderCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*_INV_ADMINS)),
):
    po = PurchaseOrder(
        tenant_id=ctx.tenant_id,
        outlet_id=data.outlet_id,
        is_transfer=data.is_transfer,
        from_tenant_id=data.from_tenant_id,
        po_number=data.po_number,
        supplier_name=data.supplier_name,
        supplier_contact=data.supplier_contact,
        expected_delivery=data.expected_delivery,
        notes=data.notes,
        created_by=current_user.user_id,
        status=PurchaseOrderStatus.draft,
    )
    db.add(po)
    await db.flush()

    for line in data.line_items:
        db.add(PurchaseOrderItem(
            po_id=po.po_id,
            inventory_item_id=line.inventory_item_id,
            quantity_ordered=line.quantity_ordered,
            unit_cost=line.unit_cost,
        ))

    await db.commit()
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.line_items))
        .where(PurchaseOrder.po_id == po.po_id)
    )
    return result.scalar_one()


@router.patch("/purchase-orders/{po_id}/submit", response_model=PurchaseOrderResponse)
async def submit_purchase_order(
    po_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.line_items))
        .where(PurchaseOrder.po_id == po_id, PurchaseOrder.tenant_id == ctx.tenant_id)
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != PurchaseOrderStatus.draft:
        raise HTTPException(
            status_code=400,
            detail=f"Only draft POs can be submitted; current status is '{po.status.value}'",
        )
    po.status = PurchaseOrderStatus.submitted
    await db.commit()
    await db.refresh(po)
    return po


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    po_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.line_items))
        .where(PurchaseOrder.po_id == po_id, PurchaseOrder.tenant_id == ctx.tenant_id)
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po


@router.patch("/purchase-orders/{po_id}/approve", response_model=PurchaseOrderResponse)
async def approve_purchase_order(
    po_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*_APPROVERS)),
):
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.line_items))
        .where(PurchaseOrder.po_id == po_id, PurchaseOrder.tenant_id == ctx.tenant_id)
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != PurchaseOrderStatus.submitted:
        raise HTTPException(
            status_code=400,
            detail=f"Only submitted POs can be approved; current status is '{po.status.value}'",
        )
    po.status = PurchaseOrderStatus.approved
    po.approved_by = current_user.user_id
    await db.commit()
    await db.refresh(po)
    return po


@router.patch("/purchase-orders/{po_id}/receive", response_model=PurchaseOrderResponse)
async def receive_purchase_order(
    po_id: UUID,
    data: ReceivePORequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.outlet_admin, UserRole.tenant_admin)),
):
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.line_items))
        .where(PurchaseOrder.po_id == po_id, PurchaseOrder.tenant_id == ctx.tenant_id)
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    received = {k: Decimal(str(v)) for k, v in data.received_quantities.items()}
    return await inventory_service.receive_purchase_order(
        db=db,
        po=po,
        received_quantities=received,
        tenant_id=ctx.tenant_id,
        performed_by=current_user.user_id,
        notes=data.notes,
    )


# ─────────────────────────────────────────────
# REPORTS
# ─────────────────────────────────────────────

@router.get("/reports/summary")
async def stock_summary_report(
    outlet_id: UUID = Query(None),
    is_central: bool = Query(None),
    format: str = Query("json", description="'json' or 'pdf'"),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    """Stock summary — returns JSON by default, PDF when ?format=pdf."""
    import io
    from fastapi.responses import StreamingResponse

    report = await inventory_service.get_stock_report(
        db=db,
        tenant_id=ctx.tenant_id,
        outlet_id=outlet_id,
        is_central=is_central,
    )

    if format.lower() == "pdf":
        t_result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
        tenant = t_result.scalar_one_or_none()
        tenant_name = tenant.name if tenant else "Tenant"
        pdf_bytes = pdf_service.generate_stock_summary_pdf(tenant_name, report)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="stock_summary.pdf"'},
        )

    return StockSummaryResponse(**report)


@router.get("/reports/consumption")
async def consumption_report(
    item_id: UUID = Query(None),
    limit: int = Query(100, le=500),
    format: str = Query("json", description="'json' or 'pdf'"),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*_INV_ADMINS)),
):
    """Consumption movements — returns JSON by default, PDF when ?format=pdf."""
    import io
    from fastapi.responses import StreamingResponse

    query = (
        select(InventoryMovement)
        .where(
            InventoryMovement.tenant_id == ctx.tenant_id,
            InventoryMovement.movement_type == StockMovementType.consumption,
        )
        .order_by(InventoryMovement.created_at.desc())
        .limit(limit)
    )
    if item_id:
        query = query.where(InventoryMovement.inventory_item_id == item_id)
    result = await db.execute(query)
    movements = result.scalars().all()
    movement_dicts = [InventoryMovementResponse.model_validate(m).model_dump(mode="json") for m in movements]

    if format.lower() == "pdf":
        t_result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
        tenant = t_result.scalar_one_or_none()
        tenant_name = tenant.name if tenant else "Tenant"
        pdf_bytes = pdf_service.generate_consumption_pdf(tenant_name, movement_dicts)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="consumption_report.pdf"'},
        )

    return movement_dicts

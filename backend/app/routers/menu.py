"""Menu router with franchise-aware scoping.

Franchise rules (Phase 8):
  super_admin (franchise_brand):
    - Creates brand-level items  (outlet_id = NULL, tenant_id = brand_uuid)
    - Updates / deletes brand-level items only
    - Sees brand-level items

  outlet_admin (franchise_outlet):
    - Creates outlet-specific overrides  (outlet_id = ctx.outlet_id)
    - Updates / deletes outlet-specific items only (not brand items)
    - Sees brand items (parent) + outlet overrides

  tenant_admin / food_court_admin / platform_admin:
    - Full control within their tenant_id (no outlet scoping)
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    ADMIN_ROLES,
    CUSTOMER_ROLES,
    WORK_ROLES,
    TenantContext,
    get_tenant_context,
    require_role,
)
from app.models.menu import Category, MenuItem
from app.models.models import Order, OrderItem
from app.models.tenant import Tenant, TenantType
from app.models.user import User, UserRole
from app.schemas.menu import CategoryResponse, MenuItemCreate, MenuItemResponse, MenuItemUpdate
from app.services import menu_service

router = APIRouter(prefix="/menu", tags=["menu"])

ACTIVE_ORDER_STATUSES = ("pending", "confirmed", "preparing", "ready")


# ─────────────────────────────────────────────
# Franchise scope helpers
# ─────────────────────────────────────────────

async def _brand_tenant_id(ctx: TenantContext, db: AsyncSession) -> UUID:
    """For franchise_outlet callers, return the parent brand's tenant_id.
    For all others, return ctx.tenant_id unchanged.
    """
    if ctx.tenant_type == TenantType.franchise_outlet:
        result = await db.execute(select(Tenant).where(Tenant.tenant_id == ctx.tenant_id))
        outlet = result.scalar_one_or_none()
        if outlet and outlet.parent_tenant_id:
            return outlet.parent_tenant_id
    return ctx.tenant_id


async def _menu_items_query(ctx: TenantContext, db: AsyncSession):
    """Return a SELECT clause scoped correctly for the caller's tenant type.

    franchise_outlet: brand-level items (outlet_id NULL, tenant_id = brand)
                    + outlet overrides  (tenant_id = ctx.tenant_id)
    others:          all items where tenant_id = ctx.tenant_id
    """
    if ctx.tenant_type == TenantType.franchise_outlet:
        brand_id = await _brand_tenant_id(ctx, db)
        return select(MenuItem).where(
            or_(
                (MenuItem.tenant_id == brand_id) & (MenuItem.outlet_id.is_(None)),
                MenuItem.tenant_id == ctx.tenant_id,
            )
        )
    return select(MenuItem).where(MenuItem.tenant_id == ctx.tenant_id)


async def _get_homemade_category_id(db: AsyncSession, tenant_id: UUID) -> int:
    result = await db.execute(
        select(Category).where(
            Category.name.ilike("Homemade"),
            Category.is_active.is_(True),
            Category.tenant_id == tenant_id,
        )
    )
    cat = result.scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=400, detail="Homemade category not found for this tenant")
    return cat.category_id


# ─────────────────────────────────────────────
# CATEGORIES
# ─────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
async def get_categories(
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    # For franchise_outlet, categories live on the brand tenant
    effective_tid = await _brand_tenant_id(ctx, db)
    result = await db.execute(
        select(Category)
        .where(Category.tenant_id == effective_tid, Category.is_active.is_(True))
        .order_by(Category.display_order)
    )
    return result.scalars().all()


@router.post("/categories", response_model=CategoryResponse, status_code=201)
async def create_category(
    name: str,
    display_order: int = 0,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*ADMIN_ROLES)),
):
    cat = Category(tenant_id=ctx.tenant_id, name=name, display_order=display_order)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    await menu_service.invalidate_menu_cache(ctx.tenant_id)
    return cat


# ─────────────────────────────────────────────
# MENU ITEMS
# ─────────────────────────────────────────────

@router.get("/items", response_model=list[MenuItemResponse])
async def get_menu_items(
    category_id: int = Query(None),
    is_available: bool = Query(None),
    is_homemade: bool = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    # ── Cache read ────────────────────────────────────────────────────────────
    cached = await menu_service.get_menu_cached(
        ctx.tenant_id, category_id, is_available, is_homemade
    )
    if cached is not None:
        return cached

    # ── Cache miss — query DB ─────────────────────────────────────────────────
    query = await _menu_items_query(ctx, db)
    if category_id is not None:
        query = query.where(MenuItem.category_id == category_id)
    if is_available is not None:
        query = query.where(MenuItem.is_available == is_available)
    if is_homemade is not None:
        query = query.where(MenuItem.is_homemade == is_homemade)

    result = await db.execute(query)
    items = result.scalars().all()

    await menu_service.set_menu_cache(
        ctx.tenant_id,
        category_id,
        is_available,
        is_homemade,
        [MenuItemResponse.model_validate(i).model_dump(mode="json") for i in items],
    )
    return items


@router.get("/items/{item_id}", response_model=MenuItemResponse)
async def get_menu_item(
    item_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    query = (await _menu_items_query(ctx, db)).where(MenuItem.item_id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/items", response_model=MenuItemResponse, status_code=201)
async def create_menu_item(
    item_data: MenuItemCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*CUSTOMER_ROLES, *ADMIN_ROLES)),
):
    payload = item_data.model_dump()
    payload["tenant_id"] = ctx.tenant_id

    if current_user.role in CUSTOMER_ROLES:
        # Homemade listing — always goes to customer's own tenant
        payload["category_id"] = await _get_homemade_category_id(db, ctx.tenant_id)
        payload["is_homemade"] = True
        payload["listed_by"] = current_user.user_id
        payload.pop("outlet_id", None)

    elif current_user.role == UserRole.super_admin:
        # Franchise brand admin creates brand-level items
        payload["outlet_id"] = None

    elif current_user.role == UserRole.outlet_admin:
        # Franchise outlet admin creates outlet-specific overrides
        if ctx.outlet_id is None:
            raise HTTPException(
                status_code=400,
                detail="outlet_admin must have an outlet_id to create outlet items",
            )
        payload["outlet_id"] = ctx.outlet_id

    else:
        # tenant_admin / food_court_admin / platform_admin — no outlet scoping
        if payload.get("is_homemade"):
            homemade_id = await _get_homemade_category_id(db, ctx.tenant_id)
            if payload.get("category_id") != homemade_id:
                raise HTTPException(
                    status_code=400, detail="Homemade items must use the Homemade category"
                )

    new_item = MenuItem(**payload)
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    await menu_service.invalidate_menu_cache(ctx.tenant_id)
    return new_item


@router.put("/items/{item_id}", response_model=MenuItemResponse)
async def update_menu_item(
    item_id: UUID,
    item_data: MenuItemUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
):
    query = (await _menu_items_query(ctx, db)).where(MenuItem.item_id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Franchise guard: outlet_admin may only update their outlet's items
    if current_user.role == UserRole.outlet_admin:
        if item.outlet_id != ctx.outlet_id:
            raise HTTPException(
                status_code=403,
                detail="outlet_admin can only update outlet-specific items",
            )
    # super_admin may only update brand-level items via this endpoint
    elif current_user.role == UserRole.super_admin:
        if item.outlet_id is not None:
            raise HTTPException(
                status_code=403,
                detail="super_admin can only update brand-level items (outlet_id = NULL)",
            )

    for key, value in item_data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    await menu_service.invalidate_menu_cache(ctx.tenant_id)
    return item


@router.patch("/items/{item_id}/toggle", response_model=MenuItemResponse)
async def toggle_item_availability(
    item_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*WORK_ROLES)),
):
    # All work roles (including outlet_admin) can toggle any visible item
    query = (await _menu_items_query(ctx, db)).where(MenuItem.item_id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_available = not item.is_available
    await db.commit()
    await db.refresh(item)
    await menu_service.invalidate_menu_cache(ctx.tenant_id)
    return item


@router.delete("/items/{item_id}", status_code=204)
async def delete_menu_item(
    item_id: UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
):
    query = (await _menu_items_query(ctx, db)).where(MenuItem.item_id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Franchise guard
    if current_user.role == UserRole.outlet_admin:
        if item.outlet_id != ctx.outlet_id:
            raise HTTPException(
                status_code=403, detail="outlet_admin can only delete outlet-specific items"
            )
    elif current_user.role == UserRole.super_admin:
        if item.outlet_id is not None:
            raise HTTPException(
                status_code=403,
                detail="super_admin can only delete brand-level items (outlet_id = NULL)",
            )

    order_check = await db.execute(
        select(OrderItem)
        .join(Order, Order.order_id == OrderItem.order_id)
        .where(
            OrderItem.item_id == item_id,
            Order.tenant_id == ctx.tenant_id,
            Order.status.in_(ACTIVE_ORDER_STATUSES),
        )
        .limit(1)
    )
    if order_check.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Cannot delete item in active orders")

    await db.delete(item)
    await db.commit()
    await menu_service.invalidate_menu_cache(ctx.tenant_id)

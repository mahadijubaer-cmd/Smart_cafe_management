from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.core.database import get_db
from app.models.menu import Category, MenuItem
from app.models.user import User, UserRole
from app.schemas.menu import CategoryResponse, MenuItemResponse, MenuItemCreate, MenuItemUpdate
from app.core.dependencies import require_role
from app.models.models import Order, OrderItem

router = APIRouter(prefix="/menu", tags=["menu"])

ACTIVE_ORDER_STATUSES = ("pending", "confirmed", "preparing", "ready")


async def _get_homemade_category_id(db: AsyncSession) -> int:
    result = await db.execute(
        select(Category).where(Category.name.ilike("Homemade"), Category.is_active.is_(True))
    )
    homemade_category = result.scalar_one_or_none()
    if homemade_category is None:
        raise HTTPException(status_code=400, detail="Homemade category not found")
    return homemade_category.category_id


@router.get("/categories", response_model=list[CategoryResponse])
async def get_categories(db: AsyncSession = Depends(get_db)):
    """Get all active categories"""
    result = await db.execute(
        select(Category)
        .where(Category.is_active.is_(True))
        .order_by(Category.display_order)
    )
    return result.scalars().all()


@router.get("/items", response_model=list[MenuItemResponse])
async def get_menu_items(
    category_id: int = Query(None),
    is_available: bool = Query(None),
    is_homemade: bool = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Get menu items with optional filters"""
    query = select(MenuItem)
    
    if category_id is not None:
        query = query.where(MenuItem.category_id == category_id)
    if is_available is not None:
        query = query.where(MenuItem.is_available == is_available)
    if is_homemade is not None:
        query = query.where(MenuItem.is_homemade == is_homemade)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/items/{item_id}", response_model=MenuItemResponse)
async def get_menu_item(item_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a single menu item"""
    result = await db.execute(select(MenuItem).where(MenuItem.item_id == item_id))
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return item


@router.post("/items", response_model=MenuItemResponse, status_code=201)
async def create_menu_item(
    item_data: MenuItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.student))
):
    """Create a new menu item"""
    payload = item_data.model_dump()

    if current_user.role == UserRole.student:
        payload["category_id"] = await _get_homemade_category_id(db)
        payload["is_homemade"] = True
        payload["listed_by"] = current_user.user_id

    elif payload.get("is_homemade"):
        homemade_category_id = await _get_homemade_category_id(db)
        if payload["category_id"] != homemade_category_id:
            raise HTTPException(status_code=400, detail="Homemade items must use the Homemade category")
    
    new_item = MenuItem(**payload)
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    
    return new_item


@router.put("/items/{item_id}", response_model=MenuItemResponse)
async def update_menu_item(
    item_id: UUID,
    item_data: MenuItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Update a menu item (Admin only)"""
    result = await db.execute(select(MenuItem).where(MenuItem.item_id == item_id))
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = item_data.model_dump()
    for key, value in update_data.items():
        setattr(item, key, value)
    
    await db.commit()
    await db.refresh(item)
    
    return item


@router.patch("/items/{item_id}/toggle", response_model=MenuItemResponse)
async def toggle_item_availability(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.staff))
):
    """Toggle menu item availability"""
    result = await db.execute(select(MenuItem).where(MenuItem.item_id == item_id))
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    item.is_available = not item.is_available
    await db.commit()
    await db.refresh(item)
    
    return item


@router.delete("/items/{item_id}", status_code=204)
async def delete_menu_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Delete a menu item (Admin only)"""
    result = await db.execute(select(MenuItem).where(MenuItem.item_id == item_id))
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check if item is in any active order
    order_check = await db.execute(
        select(OrderItem)
        .join(Order, Order.order_id == OrderItem.order_id)
        .where(OrderItem.item_id == item_id)
        .where(Order.status.in_(ACTIVE_ORDER_STATUSES))
        .limit(1)
    )
    if order_check.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Cannot delete item in active orders")
    
    await db.delete(item)
    await db.commit()

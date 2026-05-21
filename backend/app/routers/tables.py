from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.models import TablesMap, User, UserRole, Reservation
from app.schemas.table import TableResponse, TableUpdateStatus
from app.core.dependencies import require_role

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("/", response_model=list[TableResponse])
async def get_all_tables(db: AsyncSession = Depends(get_db)):
    """Get all tables with their current status"""
    result = await db.execute(select(TablesMap).order_by(TablesMap.position_y, TablesMap.position_x))
    return result.scalars().all()


@router.get("/reserved-slots")
async def get_reserved_slots(db: AsyncSession = Depends(get_db)):
    """Get reserved time slots for the current day and upcoming reservations."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Reservation.reserved_for).where(Reservation.reserved_for >= now)
    )
    return [slot.isoformat() for (slot,) in result.all()]


@router.get("/{table_id}", response_model=TableResponse)
async def get_table(table_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single table"""
    result = await db.execute(select(TablesMap).where(TablesMap.table_id == table_id))
    table = result.scalar()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    return table


@router.post("/reserve", status_code=201)
async def reserve_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student))
):
    """Reserve a table"""
    from datetime import datetime, timedelta
    
    result = await db.execute(select(TablesMap).where(TablesMap.table_id == table_id))
    table = result.scalar()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    if table.status != "available":
        raise HTTPException(status_code=400, detail="Table not available")
    
    # Create reservation
    reservation = Reservation(
        user_id=current_user.user_id,
        table_id=table_id,
        reserved_for=datetime.utcnow() + timedelta(hours=1),
        duration_mins=60
    )
    
    db.add(reservation)
    table.status = "reserved"
    await db.commit()
    
    return {"reservation_id": str(reservation.reservation_id), "table_id": table_id}


@router.patch("/{table_id}/status", response_model=TableResponse)
async def update_table_status(
    table_id: int,
    status_data: TableUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin))
):
    """Update table status (Admin only)"""
    result = await db.execute(select(TablesMap).where(TablesMap.table_id == table_id))
    table = result.scalar()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    table.status = status_data.status
    await db.commit()
    await db.refresh(table)
    
    return table

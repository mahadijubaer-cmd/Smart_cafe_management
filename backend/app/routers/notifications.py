"""Notification inbox endpoints.

GET  /notifications          — list user's notifications, newest first
PATCH /notifications/{id}/read — mark single notification read
POST /notifications/read-all  — mark all unread read
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.models import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    skip: int = 0,
    limit: int = 20,
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    limit = min(limit, 50)

    q = select(Notification).where(Notification.user_id == current_user.user_id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))

    count_q = select(func.count()).select_from(
        select(Notification).where(Notification.user_id == current_user.user_id).subquery()
    )
    unread_q = select(func.count()).select_from(
        select(Notification).where(
            Notification.user_id == current_user.user_id,
            Notification.is_read.is_(False),
        ).subquery()
    )

    total = (await db.execute(count_q)).scalar_one()
    unread_count = (await db.execute(unread_q)).scalar_one()

    items_result = await db.execute(
        q.order_by(Notification.created_at.desc()).offset(skip).limit(limit)
    )
    items = items_result.scalars().all()

    return {
        "items": [
            {
                "notif_id": str(n.notif_id),
                "type": n.type,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in items
        ],
        "total": total,
        "unread_count": unread_count,
    }


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(
            Notification.notif_id == notification_id,
            Notification.user_id == current_user.user_id,
        )
    )
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    await db.commit()
    return {"read": True}


@router.post("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.user_id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
        .returning(Notification.notif_id)
    )
    count = len(result.fetchall())
    await db.commit()
    return {"marked_read": count}

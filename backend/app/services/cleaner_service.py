from datetime import datetime
import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import CleanerLog, CleanerStatus, TablesMap, User
from app.models.table import TableStatus
from app.models.user import UserRole
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)


class CleanerService:
    async def assign_cleaner(
        self,
        db: AsyncSession,
        table_id: int,
        order_id: str,
        tenant_id: UUID,
    ) -> CleanerLog | None:
        table_result = await db.execute(
            select(TablesMap).where(
                TablesMap.table_id == table_id,
                TablesMap.tenant_id == tenant_id,
            )
        )
        table = table_result.scalar_one_or_none()
        if not table:
            logger.warning("Unable to assign cleaner for missing table_id=%s", table_id)
            return None

        cleaners_result = await db.execute(
            select(User).where(
                User.role == UserRole.cleaner,
                User.is_active.is_(True),
                User.tenant_id == tenant_id,
            ).order_by(User.created_at.asc())
        )
        cleaners = cleaners_result.scalars().all()
        if not cleaners:
            logger.warning("No active cleaners available for tenant %s", tenant_id)
            return None

        active_counts_result = await db.execute(
            select(CleanerLog.cleaner_id, func.count(CleanerLog.log_id))
            .where(
                CleanerLog.status != CleanerStatus.done,
                CleanerLog.tenant_id == tenant_id,
            )
            .group_by(CleanerLog.cleaner_id)
        )
        active_counts = {cid: cnt for cid, cnt in active_counts_result.all()}

        best_cleaner = min(
            cleaners,
            key=lambda c: (int(active_counts.get(c.user_id, 0)), c.created_at, str(c.user_id)),
        )

        log = CleanerLog(
            tenant_id=tenant_id,
            cleaner_id=best_cleaner.user_id,
            table_id=table_id,
            triggered_by_order=order_id,
            status=CleanerStatus.assigned,
        )
        table.status = TableStatus.cleaning
        db.add(log)
        await db.commit()

        refreshed = await db.execute(
            select(CleanerLog)
            .options(selectinload(CleanerLog.cleaner), selectinload(CleanerLog.table))
            .where(CleanerLog.log_id == log.log_id)
        )
        refreshed_log = refreshed.scalar_one_or_none() or log

        await manager.send_personal(
            str(best_cleaner.user_id),
            {"type": "CLEAN_ASSIGNED", "log_id": str(log.log_id), "table_number": table.table_number},
        )
        await manager.broadcast_to_role(
            "admin",
            {"type": "MEAL_DONE", "table_id": table.table_id, "table_number": table.table_number},
        )
        return refreshed_log

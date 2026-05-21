from datetime import datetime
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import CleanerLog, CleanerStatus, TablesMap, User
from app.models.table import TableStatus
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)


class CleanerService:
    async def assign_cleaner(self, db: AsyncSession, table_id: int, order_id: str) -> CleanerLog | None:
        """Assign the cleanest available cleaner to a table."""

        table_result = await db.execute(select(TablesMap).where(TablesMap.table_id == table_id))
        table = table_result.scalar_one_or_none()
        if not table:
            logger.warning("Unable to assign cleaner for missing table_id=%s", table_id)
            return None

        cleaners_result = await db.execute(
            select(User).where(User.role == "cleaner", User.is_active.is_(True)).order_by(User.created_at.asc())
        )
        cleaners = cleaners_result.scalars().all()

        if not cleaners:
            logger.warning("No active cleaners available for assignment")
            return None

        active_counts_result = await db.execute(
            select(CleanerLog.cleaner_id, func.count(CleanerLog.log_id))
            .where(CleanerLog.status != CleanerStatus.done)
            .group_by(CleanerLog.cleaner_id)
        )
        active_counts = {cleaner_id: count for cleaner_id, count in active_counts_result.all()}

        best_cleaner = min(
            cleaners,
            key=lambda cleaner: (
                int(active_counts.get(cleaner.user_id, 0)),
                cleaner.created_at,
                str(cleaner.user_id),
            ),
        )

        log = CleanerLog(
            cleaner_id=best_cleaner.user_id,
            table_id=table_id,
            triggered_by_order=order_id,
            status=CleanerStatus.assigned,
        )

        table.status = TableStatus.cleaning
        db.add(log)

        await db.commit()

        refreshed_log_result = await db.execute(
            select(CleanerLog)
            .options(selectinload(CleanerLog.cleaner), selectinload(CleanerLog.table))
            .where(CleanerLog.log_id == log.log_id)
        )
        refreshed_log = refreshed_log_result.scalar_one_or_none() or log

        await manager.send_personal(
            str(best_cleaner.user_id),
            {
                "type": "CLEAN_ASSIGNED",
                "log_id": str(log.log_id),
                "table_number": table.table_number,
            },
        )
        await manager.broadcast_to_role(
            "admin",
            {
                "type": "MEAL_DONE",
                "table_id": table.table_id,
                "table_number": table.table_number,
            },
        )

        return refreshed_log

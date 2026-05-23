from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

CURRENT_FILE = Path(__file__).resolve()
BACKEND_ROOT = CURRENT_FILE.parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
import app.models.models  # noqa: F401
import app.models.order  # noqa: F401
import app.models.table  # noqa: F401
import app.models.user  # noqa: F401
from app.models.table import TableStatus, TablesMap


def build_database_config() -> tuple[str, dict[str, object]]:
    url = settings.DATABASE_URL

    if url.startswith("postgresql+asyncpg://") and ("sslmode=" in url or "channel_binding=" in url):
        from sqlalchemy.engine import make_url

        parsed = make_url(url)
        query = dict(parsed.query)
        if query.get("sslmode") == "require":
            query["ssl"] = "require"
        query.pop("sslmode", None)
        query.pop("channel_binding", None)
        url = str(parsed.set(query=query))

    return url, {}


TABLE_SEEDS: list[dict[str, object]] = [
    {
        "table_number": "A1",
        "zone": "Window Side",
        "capacity": 2,
        "position_x": 1,
        "position_y": 1,
    },
    {
        "table_number": "A2",
        "zone": "Window Side",
        "capacity": 2,
        "position_x": 1,
        "position_y": 2,
    },
    {
        "table_number": "A3",
        "zone": "Window Side",
        "capacity": 2,
        "position_x": 1,
        "position_y": 3,
    },
    {
        "table_number": "A4",
        "zone": "Window Side",
        "capacity": 2,
        "position_x": 2,
        "position_y": 1,
    },
    {
        "table_number": "A5",
        "zone": "Window Side",
        "capacity": 2,
        "position_x": 2,
        "position_y": 2,
    },
    {
        "table_number": "A6",
        "zone": "Window Side",
        "capacity": 2,
        "position_x": 2,
        "position_y": 3,
    },
    {
        "table_number": "B1",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 3,
        "position_y": 1,
    },
    {
        "table_number": "B2",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 3,
        "position_y": 2,
    },
    {
        "table_number": "B3",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 3,
        "position_y": 3,
    },
    {
        "table_number": "B4",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 4,
        "position_y": 1,
    },
    {
        "table_number": "B5",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 4,
        "position_y": 2,
    },
    {
        "table_number": "B6",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 4,
        "position_y": 3,
    },
    {
        "table_number": "B7",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 5,
        "position_y": 1,
    },
    {
        "table_number": "B8",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 5,
        "position_y": 2,
    },
    {
        "table_number": "B9",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 5,
        "position_y": 3,
    },
    {
        "table_number": "B10",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 6,
        "position_y": 1,
    },
    {
        "table_number": "B11",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 6,
        "position_y": 2,
    },
    {
        "table_number": "B12",
        "zone": "Center Hall",
        "capacity": 4,
        "position_x": 6,
        "position_y": 3,
    },
    {
        "table_number": "C1",
        "zone": "Group Area",
        "capacity": 6,
        "position_x": 1,
        "position_y": 4,
    },
    {
        "table_number": "C2",
        "zone": "Group Area",
        "capacity": 6,
        "position_x": 1,
        "position_y": 5,
    },
    {
        "table_number": "C3",
        "zone": "Group Area",
        "capacity": 6,
        "position_x": 2,
        "position_y": 4,
    },
    {
        "table_number": "C4",
        "zone": "Group Area",
        "capacity": 6,
        "position_x": 2,
        "position_y": 5,
    },
    {
        "table_number": "C5",
        "zone": "Group Area",
        "capacity": 6,
        "position_x": 3,
        "position_y": 4,
    },
    {
        "table_number": "C6",
        "zone": "Group Area",
        "capacity": 6,
        "position_x": 3,
        "position_y": 5,
    },
    {
        "table_number": "D1",
        "zone": "Quick Bites",
        "capacity": 2,
        "position_x": 4,
        "position_y": 4,
    },
    {
        "table_number": "D2",
        "zone": "Quick Bites",
        "capacity": 2,
        "position_x": 4,
        "position_y": 5,
    },
    {
        "table_number": "D3",
        "zone": "Quick Bites",
        "capacity": 2,
        "position_x": 5,
        "position_y": 4,
    },
    {
        "table_number": "D4",
        "zone": "Quick Bites",
        "capacity": 2,
        "position_x": 5,
        "position_y": 5,
    },
    {
        "table_number": "D5",
        "zone": "Quick Bites",
        "capacity": 2,
        "position_x": 6,
        "position_y": 4,
    },
    {
        "table_number": "D6",
        "zone": "Quick Bites",
        "capacity": 2,
        "position_x": 6,
        "position_y": 5,
    },
]


async def get_or_create_table(session: AsyncSession, payload: dict[str, object]) -> tuple[TablesMap, bool]:
    result = await session.execute(
        select(TablesMap).where(TablesMap.table_number == payload["table_number"])
    )
    existing = result.scalar_one_or_none()

    if existing is not None:
        return existing, False

    table = TablesMap(
        table_number=str(payload["table_number"]),
        zone=str(payload["zone"]),
        capacity=int(payload["capacity"]),
        status=TableStatus.available,
        position_x=int(payload["position_x"]),
        position_y=int(payload["position_y"]),
    )
    session.add(table)
    await session.flush()
    return table, True


async def seed_tables() -> None:
    database_url, connect_args = build_database_config()
    engine = create_async_engine(database_url, echo=False, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    summary: dict[str, int] = {}

    async with session_factory() as session:
        for payload in TABLE_SEEDS:
            zone = str(payload["zone"])
            _, inserted = await get_or_create_table(session, payload)
            if inserted:
                summary[zone] = summary.get(zone, 0) + 1

        await session.commit()

    for zone in ["Window Side", "Center Hall", "Group Area", "Quick Bites"]:
        print(f"✓ Seeded {summary.get(zone, 0)} tables for {zone}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_tables())
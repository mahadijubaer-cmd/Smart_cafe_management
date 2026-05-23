from __future__ import annotations

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

CURRENT_FILE = Path(__file__).resolve()
BACKEND_ROOT = CURRENT_FILE.parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.models.menu import Category, MenuItem
import app.models.models  # noqa: F401
import app.models.order  # noqa: F401
import app.models.table  # noqa: F401
import app.models.user  # noqa: F401


CATEGORY_SEEDS: list[dict[str, object]] = [
    {
        "name": "Breakfast",
        "display_order": 1,
        "icon_url": "/icons/breakfast.svg",
        "items": [
            {
                "name": "Paratha with Egg",
                "price": Decimal("35.00"),
                "prep_time_mins": 8,
                "description": "Crispy layered flatbread served with fried egg",
            },
            {
                "name": "Khichuri",
                "price": Decimal("45.00"),
                "prep_time_mins": 5,
                "description": "Warm rice and lentil comfort bowl, Bengali style",
            },
            {
                "name": "Ruti with Dal",
                "price": Decimal("30.00"),
                "prep_time_mins": 7,
                "description": "Soft whole-wheat flatbread with yellow lentil soup",
            },
            {
                "name": "Puri Bhaji",
                "price": Decimal("40.00"),
                "prep_time_mins": 10,
                "description": "Deep-fried puffy bread with spiced potato bhaji",
            },
            {
                "name": "Egg Toast",
                "price": Decimal("25.00"),
                "prep_time_mins": 5,
                "description": "Grilled bread with omelette and chili sauce",
            },
            {
                "name": "Shemai",
                "price": Decimal("35.00"),
                "prep_time_mins": 6,
                "description": "Sweet vermicelli cooked in milk with cardamom",
            },
            {
                "name": "Halwa Puri",
                "price": Decimal("50.00"),
                "prep_time_mins": 12,
                "description": "Semolina halwa served with crispy puri",
            },
        ],
    },
    {
        "name": "Lunch",
        "display_order": 2,
        "icon_url": "/icons/lunch.svg",
        "items": [
            {
                "name": "Chicken Biryani",
                "price": Decimal("120.00"),
                "prep_time_mins": 10,
                "description": "Fragrant basmati rice cooked with tender chicken and whole spices",
            },
            {
                "name": "Beef Bhuna",
                "price": Decimal("130.00"),
                "prep_time_mins": 8,
                "description": "Slow-cooked beef in rich, dry-roasted spice gravy",
            },
            {
                "name": "Dal Bhat (Full Meal)",
                "price": Decimal("70.00"),
                "prep_time_mins": 5,
                "description": "Rice, lentil soup, vegetable stir-fry, and salad",
            },
            {
                "name": "Chicken Curry with Rice",
                "price": Decimal("100.00"),
                "prep_time_mins": 8,
                "description": "Home-style chicken curry served over steamed rice",
            },
            {
                "name": "Hilsa Fish Curry",
                "price": Decimal("150.00"),
                "prep_time_mins": 10,
                "description": "National fish of Bangladesh in mustard-turmeric sauce",
            },
            {
                "name": "Shutki Bhorta with Rice",
                "price": Decimal("80.00"),
                "prep_time_mins": 5,
                "description": "Dried fish mash with mustard oil and green chili",
            },
            {
                "name": "Vegetable Khichuri",
                "price": Decimal("60.00"),
                "prep_time_mins": 5,
                "description": "One-pot lentil rice with seasonal vegetables",
            },
            {
                "name": "Daal with Ruti",
                "price": Decimal("45.00"),
                "prep_time_mins": 5,
                "description": "Lentil soup served with three soft rotis",
            },
            {
                "name": "Tehari (Mutton)",
                "price": Decimal("140.00"),
                "prep_time_mins": 10,
                "description": "Dhaka-style mutton and rice in aromatic spices",
            },
            {
                "name": "Mixed Bhorta Platter",
                "price": Decimal("65.00"),
                "prep_time_mins": 5,
                "description": "Three types of mashed vegetables with mustard oil and rice",
            },
        ],
    },
    {
        "name": "Snacks",
        "display_order": 3,
        "icon_url": "/icons/snacks.svg",
        "items": [
            {
                "name": "Singara (2 pcs)",
                "price": Decimal("20.00"),
                "prep_time_mins": 3,
                "description": "Crispy triangle pastry filled with spiced potato",
            },
            {
                "name": "Samosa (2 pcs)",
                "price": Decimal("25.00"),
                "prep_time_mins": 3,
                "description": "Triangle pastry with minced beef and onion filling",
            },
            {
                "name": "Piyaju",
                "price": Decimal("15.00"),
                "prep_time_mins": 3,
                "description": "Lentil and onion fritters, classic iftar snack",
            },
            {
                "name": "Beguni",
                "price": Decimal("15.00"),
                "prep_time_mins": 3,
                "description": "Batter-fried eggplant slices with turmeric",
            },
            {
                "name": "Jhalmuri",
                "price": Decimal("20.00"),
                "prep_time_mins": 2,
                "description": "Puffed rice tossed with mustard oil, onion, green chili",
            },
            {
                "name": "Fuchka (6 pcs)",
                "price": Decimal("30.00"),
                "prep_time_mins": 5,
                "description": "Crispy hollow puri filled with tamarind water and chickpea",
            },
            {
                "name": "Chotpoti",
                "price": Decimal("35.00"),
                "prep_time_mins": 5,
                "description": "Spiced chickpea and potato with tamarind sauce and egg",
            },
            {
                "name": "Chicken Roll",
                "price": Decimal("60.00"),
                "prep_time_mins": 8,
                "description": "Grilled chicken strips wrapped in paratha with sauce",
            },
            {
                "name": "Egg Roll",
                "price": Decimal("40.00"),
                "prep_time_mins": 6,
                "description": "Crispy egg-coated paratha roll with chili sauce",
            },
            {
                "name": "Doi Fuchka (6 pcs)",
                "price": Decimal("40.00"),
                "prep_time_mins": 5,
                "description": "Sweet yogurt fuchka with tamarind and chaat masala",
            },
        ],
    },
    {
        "name": "Beverages",
        "display_order": 4,
        "icon_url": "/icons/beverages.svg",
        "items": [
            {
                "name": "Cha (Milk Tea)",
                "price": Decimal("15.00"),
                "prep_time_mins": 4,
                "description": "Classic Bangladesh-style sweet milk tea with ginger",
            },
            {
                "name": "Green Tea",
                "price": Decimal("20.00"),
                "prep_time_mins": 3,
                "description": "Light and refreshing green tea, unsweetened",
            },
            {
                "name": "Borhani",
                "price": Decimal("25.00"),
                "prep_time_mins": 2,
                "description": "Spiced yogurt drink with mint and cumin",
            },
            {
                "name": "Lassi (Sweet/Salty)",
                "price": Decimal("30.00"),
                "prep_time_mins": 3,
                "description": "Thick yogurt drink — sweet with rose or salty with mint",
            },
            {
                "name": "Aamsatto Sharbat",
                "price": Decimal("25.00"),
                "prep_time_mins": 2,
                "description": "Tangy mango leather dissolved in chilled water",
            },
            {
                "name": "Coconut Water",
                "price": Decimal("35.00"),
                "prep_time_mins": 1,
                "description": "Fresh tender coconut water, naturally sweet",
            },
            {
                "name": "Limon Sharbat",
                "price": Decimal("20.00"),
                "prep_time_mins": 2,
                "description": "Fresh lime with black salt and roasted cumin",
            },
            {
                "name": "Soft Drink (Can)",
                "price": Decimal("30.00"),
                "prep_time_mins": 1,
                "description": "Chilled Pepsi, 7Up, or RC Cola",
            },
            {
                "name": "Mineral Water (500ml)",
                "price": Decimal("15.00"),
                "prep_time_mins": 1,
                "description": "Sealed bottled drinking water",
            },
            {
                "name": "Cold Coffee",
                "price": Decimal("45.00"),
                "prep_time_mins": 5,
                "description": "Blended coffee with ice cream and milk",
            },
        ],
    },
    {
        "name": "Homemade",
        "display_order": 5,
        "icon_url": "/icons/homemade.svg",
        "items": [
            {
                "name": "Ma-er Hater Polao",
                "price": Decimal("80.00"),
                "prep_time_mins": 0,
                "description": "Home-cooked fragrant polao rice, limited portions daily",
                "is_homemade": True,
            },
            {
                "name": "Homemade Nolen Gur Payesh",
                "price": Decimal("50.00"),
                "prep_time_mins": 0,
                "description": "Rice pudding made with date palm jaggery",
                "is_homemade": True,
            },
        ],
    },
]


async def get_or_create_category(session: AsyncSession, payload: dict[str, object]) -> Category:
    result = await session.execute(select(Category).where(Category.name == payload["name"]))
    category = result.scalar_one_or_none()

    if category is None:
        category = Category(
            name=payload["name"],
            display_order=payload["display_order"],
            icon_url=payload["icon_url"],
        )
        session.add(category)
        await session.flush()
        return category

    category.display_order = int(payload["display_order"])
    category.icon_url = str(payload["icon_url"])
    await session.flush()
    return category


async def get_or_create_menu_item(
    session: AsyncSession,
    category: Category,
    item_payload: dict[str, object],
) -> tuple[MenuItem, bool]:
    result = await session.execute(
        select(MenuItem).where(
            MenuItem.category_id == category.category_id,
            MenuItem.name == item_payload["name"],
        )
    )
    item = result.scalar_one_or_none()

    if item is not None:
        return item, False

    item = MenuItem(
        category_id=category.category_id,
        listed_by=None,
        name=str(item_payload["name"]),
        description=str(item_payload["description"]),
        price=item_payload["price"],
        image_url=None,
        is_available=True,
        is_homemade=bool(item_payload.get("is_homemade", category.name == "Homemade")),
        prep_time_mins=int(item_payload["prep_time_mins"]),
    )
    session.add(item)
    await session.flush()
    return item, True


async def seed_menu() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        for category_payload in CATEGORY_SEEDS:
            category = await get_or_create_category(session, category_payload)
            inserted_count = 0

            for item_payload in category_payload["items"]:
                _, inserted = await get_or_create_menu_item(session, category, item_payload)
                if inserted:
                    inserted_count += 1

            await session.commit()
            print(f"✓ Seeded {inserted_count} items for {category.name}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_menu())
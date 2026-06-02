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

from app.models.menu import Category, MenuItem
from app.models.user import User, UserRole
from app.services.auth_service import AuthService
from scripts.seed_tables import TABLE_SEEDS, EXPECTED_TABLE_COUNT, build_database_config, get_or_create_table


auth_service = AuthService()


CATEGORY_SEEDS: list[dict[str, object]] = [
    {"name": "Breakfast", "icon_url": "/icons/breakfast.svg", "display_order": 1},
    {"name": "Lunch", "icon_url": "/icons/lunch.svg", "display_order": 2},
    {"name": "Snacks", "icon_url": "/icons/snacks.svg", "display_order": 3},
    {"name": "Beverages", "icon_url": "/icons/beverages.svg", "display_order": 4},
    {"name": "Homemade", "icon_url": "/icons/homemade.svg", "display_order": 5},
]

MENU_ITEM_SEEDS: dict[str, list[dict[str, object]]] = {
    "Breakfast": [
        {
            "name": "Paratha with Egg",
            "description": "Crispy layered flatbread served with fried egg",
            "price": Decimal("35.00"),
            "prep_time_mins": 8,
        },
        {
            "name": "Khichuri",
            "description": "Warm rice and lentil comfort bowl, Bengali style",
            "price": Decimal("45.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Ruti with Dal",
            "description": "Soft whole-wheat flatbread with yellow lentil soup",
            "price": Decimal("30.00"),
            "prep_time_mins": 7,
        },
        {
            "name": "Puri Bhaji",
            "description": "Deep-fried puffy bread with spiced potato bhaji",
            "price": Decimal("40.00"),
            "prep_time_mins": 10,
        },
        {
            "name": "Egg Toast",
            "description": "Grilled bread with omelette and chili sauce",
            "price": Decimal("25.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Shemai",
            "description": "Sweet vermicelli cooked in milk with cardamom",
            "price": Decimal("35.00"),
            "prep_time_mins": 6,
        },
        {
            "name": "Halwa Puri",
            "description": "Semolina halwa served with crispy puri",
            "price": Decimal("50.00"),
            "prep_time_mins": 12,
        },
    ],
    "Lunch": [
        {
            "name": "Chicken Biryani",
            "description": "Fragrant basmati rice cooked with tender chicken and whole spices",
            "price": Decimal("120.00"),
            "prep_time_mins": 10,
        },
        {
            "name": "Beef Bhuna",
            "description": "Slow-cooked beef in rich, dry-roasted spice gravy",
            "price": Decimal("130.00"),
            "prep_time_mins": 8,
        },
        {
            "name": "Dal Bhat (Full Meal)",
            "description": "Rice, lentil soup, vegetable stir-fry, and salad",
            "price": Decimal("70.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Chicken Curry with Rice",
            "description": "Home-style chicken curry served over steamed rice",
            "price": Decimal("100.00"),
            "prep_time_mins": 8,
        },
        {
            "name": "Hilsa Fish Curry",
            "description": "National fish of Bangladesh in mustard-turmeric sauce",
            "price": Decimal("150.00"),
            "prep_time_mins": 10,
        },
        {
            "name": "Shutki Bhorta with Rice",
            "description": "Dried fish mash with mustard oil and green chili",
            "price": Decimal("80.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Vegetable Khichuri",
            "description": "One-pot lentil rice with seasonal vegetables",
            "price": Decimal("60.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Daal with Ruti",
            "description": "Lentil soup served with three soft rotis",
            "price": Decimal("45.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Tehari (Mutton)",
            "description": "Dhaka-style mutton and rice in aromatic spices",
            "price": Decimal("140.00"),
            "prep_time_mins": 10,
        },
        {
            "name": "Mixed Bhorta Platter",
            "description": "Three types of mashed vegetables with mustard oil and rice",
            "price": Decimal("65.00"),
            "prep_time_mins": 5,
        },
    ],
    "Snacks": [
        {
            "name": "Singara (2 pcs)",
            "description": "Crispy triangle pastry filled with spiced potato",
            "price": Decimal("20.00"),
            "prep_time_mins": 3,
        },
        {
            "name": "Samosa (2 pcs)",
            "description": "Triangle pastry with minced beef and onion filling",
            "price": Decimal("25.00"),
            "prep_time_mins": 3,
        },
        {
            "name": "Piyaju",
            "description": "Lentil and onion fritters, classic iftar snack",
            "price": Decimal("15.00"),
            "prep_time_mins": 3,
        },
        {
            "name": "Beguni",
            "description": "Batter-fried eggplant slices with turmeric",
            "price": Decimal("15.00"),
            "prep_time_mins": 3,
        },
        {
            "name": "Jhalmuri",
            "description": "Puffed rice tossed with mustard oil, onion, green chili",
            "price": Decimal("20.00"),
            "prep_time_mins": 2,
        },
        {
            "name": "Fuchka (6 pcs)",
            "description": "Crispy hollow puri filled with tamarind water and chickpea",
            "price": Decimal("30.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Chotpoti",
            "description": "Spiced chickpea and potato with tamarind sauce and egg",
            "price": Decimal("35.00"),
            "prep_time_mins": 5,
        },
        {
            "name": "Chicken Roll",
            "description": "Grilled chicken strips wrapped in paratha with sauce",
            "price": Decimal("60.00"),
            "prep_time_mins": 8,
        },
        {
            "name": "Egg Roll",
            "description": "Crispy egg-coated paratha roll with chili sauce",
            "price": Decimal("40.00"),
            "prep_time_mins": 6,
        },
        {
            "name": "Doi Fuchka (6 pcs)",
            "description": "Sweet yogurt fuchka with tamarind and chaat masala",
            "price": Decimal("40.00"),
            "prep_time_mins": 5,
        },
    ],
    "Beverages": [
        {
            "name": "Cha (Milk Tea)",
            "description": "Classic Bangladesh-style sweet milk tea with ginger",
            "price": Decimal("15.00"),
            "prep_time_mins": 4,
        },
        {
            "name": "Green Tea",
            "description": "Light and refreshing green tea, unsweetened",
            "price": Decimal("20.00"),
            "prep_time_mins": 3,
        },
        {
            "name": "Borhani",
            "description": "Spiced yogurt drink with mint and cumin",
            "price": Decimal("25.00"),
            "prep_time_mins": 2,
        },
        {
            "name": "Lassi (Sweet/Salty)",
            "description": "Thick yogurt drink — sweet with rose or salty with mint",
            "price": Decimal("30.00"),
            "prep_time_mins": 3,
        },
        {
            "name": "Coconut Water",
            "description": "Fresh tender coconut water, naturally sweet",
            "price": Decimal("35.00"),
            "prep_time_mins": 1,
        },
        {
            "name": "Limon Sharbat",
            "description": "Fresh lime with black salt and roasted cumin",
            "price": Decimal("20.00"),
            "prep_time_mins": 2,
        },
        {
            "name": "Soft Drink (Can)",
            "description": "Chilled Pepsi, 7Up, or RC Cola",
            "price": Decimal("30.00"),
            "prep_time_mins": 1,
        },
        {
            "name": "Mineral Water (500ml)",
            "description": "Sealed bottled drinking water",
            "price": Decimal("15.00"),
            "prep_time_mins": 1,
        },
    ],
    "Homemade": [
        {
            "name": "Ma-er Hater Polao",
            "description": "Home-cooked fragrant polao rice, limited portions daily",
            "price": Decimal("80.00"),
            "prep_time_mins": 0,
            "is_homemade": True,
        },
        {
            "name": "Homemade Nolen Gur Payesh",
            "description": "Rice pudding made with date palm jaggery",
            "price": Decimal("50.00"),
            "prep_time_mins": 0,
            "is_homemade": True,
        },
    ],
}

USER_SEEDS: list[dict[str, object]] = [
    {
        "full_name": "Admin User",
        "email": "admin@bracu.ac.bd",
        "password": "Admin@1234",
        "role": UserRole.admin,
        "student_id": None,
        "phone": "01700000001",
        "wallet_balance": Decimal("0.00"),
        "reward_points": 0,
    },
    {
        "full_name": "Staff User 1",
        "email": "staff1@bracu.ac.bd",
        "password": "Staff@1234",
        "role": UserRole.staff,
        "student_id": None,
        "phone": "01700000011",
        "wallet_balance": Decimal("0.00"),
        "reward_points": 0,
    },
    {
        "full_name": "Staff User 2",
        "email": "staff2@bracu.ac.bd",
        "password": "Staff@1234",
        "role": UserRole.staff,
        "student_id": None,
        "phone": "01700000012",
        "wallet_balance": Decimal("0.00"),
        "reward_points": 0,
    },
    {
        "full_name": "Cleaner User 1",
        "email": "cleaner1@bracu.ac.bd",
        "password": "Cleaner@1234",
        "role": UserRole.cleaner,
        "student_id": None,
        "phone": "01700000021",
        "wallet_balance": Decimal("0.00"),
        "reward_points": 0,
    },
    {
        "full_name": "Cleaner User 2",
        "email": "cleaner2@bracu.ac.bd",
        "password": "Cleaner@1234",
        "role": UserRole.cleaner,
        "student_id": None,
        "phone": "01700000022",
        "wallet_balance": Decimal("0.00"),
        "reward_points": 0,
    },
    {
        "full_name": "Cleaner User 3",
        "email": "cleaner3@bracu.ac.bd",
        "password": "Cleaner@1234",
        "role": UserRole.cleaner,
        "student_id": None,
        "phone": "01700000023",
        "wallet_balance": Decimal("0.00"),
        "reward_points": 0,
    },
    {
        "full_name": "Student User 1",
        "email": "student1@bracu.ac.bd",
        "password": "Student@1234",
        "role": UserRole.student,
        "student_id": "22301162",
        "phone": "01700000031",
        "wallet_balance": Decimal("500.00"),
        "reward_points": 120,
    },
    {
        "full_name": "Student User 2",
        "email": "student2@bracu.ac.bd",
        "password": "Student@1234",
        "role": UserRole.student,
        "student_id": "22301163",
        "phone": "01700000032",
        "wallet_balance": Decimal("200.00"),
        "reward_points": 50,
    },
]


async def get_or_create_category(session: AsyncSession, payload: dict[str, object]) -> Category:
    result = await session.execute(select(Category).where(Category.name == payload["name"]))
    category = result.scalar_one_or_none()

    if category is not None:
        return category

    category = Category(
        name=str(payload["name"]),
        icon_url=str(payload["icon_url"]),
        display_order=int(payload["display_order"]),
        is_active=True,
    )
    session.add(category)
    await session.flush()
    return category


async def get_or_create_menu_item(session: AsyncSession, category: Category, payload: dict[str, object]) -> MenuItem:
    result = await session.execute(
        select(MenuItem).where(
            MenuItem.category_id == category.category_id,
            MenuItem.name == payload["name"],
        )
    )
    item = result.scalar_one_or_none()

    if item is not None:
        return item

    item = MenuItem(
        category_id=category.category_id,
        listed_by=None,
        name=str(payload["name"]),
        description=str(payload["description"]),
        price=payload["price"],
        image_url=None,
        is_available=True,
        is_homemade=bool(payload.get("is_homemade", category.name == "Homemade")),
        prep_time_mins=int(payload["prep_time_mins"]),
    )
    session.add(item)
    await session.flush()
    return item


async def get_or_create_user(session: AsyncSession, payload: dict[str, object]) -> User:
    result = await session.execute(select(User).where(User.email == payload["email"]))
    user = result.scalar_one_or_none()

    if user is not None:
        return user

    user = User(
        full_name=str(payload["full_name"]),
        email=str(payload["email"]),
        password_hash=auth_service.hash_password(str(payload["password"])),
        role=payload["role"],
        student_id=payload["student_id"],
        phone=payload["phone"],
        wallet_balance=payload["wallet_balance"],
        reward_points=int(payload["reward_points"]),
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


async def seed() -> None:
    if len(TABLE_SEEDS) != EXPECTED_TABLE_COUNT:
        raise RuntimeError(f"Expected {EXPECTED_TABLE_COUNT} table seeds, found {len(TABLE_SEEDS)}")

    database_url, connect_args = build_database_config()
    engine = create_async_engine(database_url, echo=False, connect_args=connect_args)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        categories = [await get_or_create_category(session, payload) for payload in CATEGORY_SEEDS]
        category_map = {category.name: category for category in categories}

        for category_name, items in MENU_ITEM_SEEDS.items():
            category = category_map[category_name]
            for item_payload in items:
                await get_or_create_menu_item(session, category, item_payload)

        for payload in TABLE_SEEDS:
            await get_or_create_table(session, payload)

        for payload in USER_SEEDS:
            await get_or_create_user(session, payload)

        await session.commit()

    print("✓ 5 categories seeded")
    print("✓ 37 menu items seeded")
    print("✓ 30 tables seeded")
    print("✓ 8 users seeded")
    print("✓ Seed complete. Ready for demo at http://localhost:3000")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())

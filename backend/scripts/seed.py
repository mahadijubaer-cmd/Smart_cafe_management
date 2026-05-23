import asyncio
from collections.abc import Iterable
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.menu import Category, MenuItem
from app.models.user import User, UserRole
from app.services.auth_service import AuthService


auth_service = AuthService()


CATEGORY_SEEDS = [
    {"name": "Breakfast", "icon_url": "breakfast.svg", "display_order": 1},
    {"name": "Lunch", "icon_url": "lunch.svg", "display_order": 2},
    {"name": "Snacks", "icon_url": "snacks.svg", "display_order": 3},
    {"name": "Beverages", "icon_url": "beverages.svg", "display_order": 4},
    {"name": "Homemade", "icon_url": "homemade.svg", "display_order": 5},
]

USER_SEEDS = [
    {
        "full_name": "Admin User",
        "email": "admin@bracu.ac.bd",
        "password": "Admin@1234",
        "role": UserRole.admin,
        "student_id": None,
        "phone": "01700000001",
        "wallet_balance": Decimal("0.00"),
    },
    *[
        {
            "full_name": f"Staff User {index}",
            "email": f"staff{index}@bracu.ac.bd",
            "password": "Staff@1234",
            "role": UserRole.staff,
            "student_id": None,
            "phone": f"0170000001{index}",
            "wallet_balance": Decimal("0.00"),
        }
        for index in range(1, 4)
    ],
    *[
        {
            "full_name": f"Cleaner User {index}",
            "email": f"cleaner{index}@bracu.ac.bd",
            "password": "Cleaner@1234",
            "role": UserRole.cleaner,
            "student_id": None,
            "phone": f"0170000002{index}",
            "wallet_balance": Decimal("0.00"),
        }
        for index in range(1, 4)
    ],
    {
        "full_name": "Student User 1",
        "email": "student1@bracu.ac.bd",
        "password": "Student@1234",
        "role": UserRole.student,
        "student_id": "22301162",
        "phone": "01700000031",
        "wallet_balance": Decimal("500.00"),
    },
    {
        "full_name": "Student User 2",
        "email": "student2@bracu.ac.bd",
        "password": "Student@1234",
        "role": UserRole.student,
        "student_id": "22301163",
        "phone": "01700000032",
        "wallet_balance": Decimal("500.00"),
    },
]

MENU_ITEM_SEEDS = {
    "Breakfast": [
        ("Dim Paratha Set", "Paratha with egg curry and tea", Decimal("65.00")),
        ("Egg Toast", "Toasted bread with omelette and butter", Decimal("45.00")),
        ("Vegetable Khichuri", "Comfort bowl with vegetables and spices", Decimal("55.00")),
        ("Bread Omelette", "Soft omelette served with toasted bread", Decimal("50.00")),
    ],
    "Lunch": [
        ("Chicken Biryani", "Fragrant rice with chicken and potato", Decimal("145.00")),
        ("Beef Tehari", "Classic beef tehari with aromatic rice", Decimal("150.00")),
        ("Rice with Fish Curry", "Steamed rice with today's fish curry", Decimal("130.00")),
        ("Khichuri Platter", "Khichuri with egg fry and salad", Decimal("110.00")),
    ],
    "Snacks": [
        ("Shingara", "Crispy savory snack", Decimal("30.00")),
        ("Samosa", "Spiced potato filled pastry", Decimal("30.00")),
        ("Chicken Roll", "Rolled paratha with chicken filling", Decimal("75.00")),
        ("Vegetable Sandwich", "Fresh sandwich with vegetables", Decimal("60.00")),
    ],
    "Beverages": [
        ("Tea", "Classic milk tea", Decimal("25.00")),
        ("Coffee", "Fresh brewed coffee", Decimal("50.00")),
        ("Lemon Juice", "Refreshing lemon drink", Decimal("40.00")),
        ("Mango Lassi", "Sweet yogurt mango drink", Decimal("70.00")),
    ],
    "Homemade": [
        ("Nana's Chicken Curry", "Homestyle chicken curry with spices", Decimal("140.00")),
        ("Beef Bhuna", "Slow cooked beef bhuna", Decimal("150.00")),
        ("Moong Dal Chilla", "Protein rich homemade lentil chilla", Decimal("55.00")),
        ("Vegetable Pulao", "Light homemade vegetable pulao", Decimal("85.00")),
    ],
}


async def get_or_create_category(session: AsyncSession, payload: dict) -> Category:
    result = await session.execute(select(Category).where(Category.name == payload["name"]))
    category = result.scalar_one_or_none()

    if category is not None:
        return category

    category = Category(**payload)
    session.add(category)
    await session.flush()
    return category


async def get_or_create_user(session: AsyncSession, payload: dict) -> User:
    result = await session.execute(select(User).where(User.email == payload["email"]))
    user = result.scalar_one_or_none()

    if user is not None:
        return user

    user = User(
        full_name=payload["full_name"],
        email=payload["email"],
        password_hash=auth_service.hash_password(payload["password"]),
        role=payload["role"],
        student_id=payload["student_id"],
        phone=payload["phone"],
        wallet_balance=payload["wallet_balance"],
        reward_points=0,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


async def get_or_create_menu_item(session: AsyncSession, category: Category, name: str, description: str, price: Decimal) -> MenuItem:
    result = await session.execute(select(MenuItem).where(MenuItem.name == name))
    item = result.scalar_one_or_none()

    if item is not None:
        return item

    item = MenuItem(
        category_id=category.category_id,
        listed_by=None,
        name=name,
        description=description,
        price=price,
        image_url=None,
        is_available=True,
        is_homemade=category.name == "Homemade",
        prep_time_mins=10,
    )
    session.add(item)
    await session.flush()
    return item


async def seed() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        categories = [await get_or_create_category(session, payload) for payload in CATEGORY_SEEDS]
        users = [await get_or_create_user(session, payload) for payload in USER_SEEDS]

        menu_items: list[MenuItem] = []
        category_map = {category.name: category for category in categories}
        for category_name, items in MENU_ITEM_SEEDS.items():
            category = category_map[category_name]
            for item_name, description, price in items:
                menu_items.append(
                    await get_or_create_menu_item(session, category, item_name, description, price)
                )

        await session.commit()

        print(
            "Seed complete: "
            f"{len(categories)} categories, "
            f"{len(users)} users, "
            f"{len(menu_items)} menu items"
        )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
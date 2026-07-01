"""Seed menu categories, menu items, and tables for the BRACU tenant.

The legacy seed_menu.py / seed_tables.py predate multi-tenancy and do not set
tenant_id. This script seeds the same content but scoped to the 'bracu' tenant
so the demo has a browsable menu and a floor plan.

Usage (inside Docker):
    docker compose exec backend python -m scripts.seed_bracu_content
"""
import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.tenant import Tenant
from app.models.menu import Category, MenuItem
from app.models.table import TablesMap

TENANT_SLUG = "bracu"

CATEGORIES = [
    {"name": "Breakfast", "icon_url": "/icons/breakfast.svg", "display_order": 1},
    {"name": "Lunch", "icon_url": "/icons/lunch.svg", "display_order": 2},
    {"name": "Snacks", "icon_url": "/icons/snacks.svg", "display_order": 3},
    {"name": "Beverages", "icon_url": "/icons/beverages.svg", "display_order": 4},
    {"name": "Homemade", "icon_url": "/icons/homemade.svg", "display_order": 5},
]

ITEMS = {
    "Breakfast": [
        ("Paratha with Egg", "Crispy layered flatbread with fried egg", "35.00", 8),
        ("Khichuri", "Warm rice and lentil comfort bowl", "45.00", 5),
        ("Ruti with Dal", "Soft whole-wheat flatbread with yellow lentil soup", "30.00", 7),
        ("Egg Toast", "Grilled bread with omelette and chili sauce", "25.00", 5),
    ],
    "Lunch": [
        ("Chicken Biryani", "Fragrant basmati rice with tender chicken", "120.00", 10),
        ("Beef Bhuna", "Slow-cooked beef in dry-roasted spice gravy", "130.00", 8),
        ("Dal Bhat (Full Meal)", "Rice, lentil soup, vegetable stir-fry, salad", "70.00", 5),
        ("Chicken Curry with Rice", "Home-style chicken curry over steamed rice", "100.00", 8),
        ("Vegetable Khichuri", "One-pot lentil rice with seasonal vegetables", "60.00", 5),
    ],
    "Snacks": [
        ("Singara (2 pcs)", "Crispy triangle pastry with spiced potato", "20.00", 3),
        ("Samosa (2 pcs)", "Triangle pastry with minced beef and onion", "25.00", 3),
        ("Fuchka (6 pcs)", "Crispy puri with tamarind water and chickpea", "30.00", 5),
        ("Chicken Roll", "Grilled chicken strips in paratha with sauce", "60.00", 8),
    ],
    "Beverages": [
        ("Cha (Milk Tea)", "Classic sweet milk tea with ginger", "15.00", 4),
        ("Borhani", "Spiced yogurt drink with mint and cumin", "25.00", 2),
        ("Lassi (Sweet)", "Thick sweet yogurt drink with rose", "30.00", 3),
        ("Soft Drink (Can)", "Chilled Pepsi, 7Up, or RC Cola", "30.00", 1),
    ],
    "Homemade": [
        ("Ma-er Hater Polao", "Home-cooked fragrant polao, limited daily", "80.00", 0, True),
        ("Nolen Gur Payesh", "Rice pudding with date palm jaggery", "50.00", 0, True),
    ],
}

ZONES = ["Window Side", "Center", "Garden", "Balcony"]


async def main():
    async with AsyncSessionLocal() as s:
        tenant = (
            await s.execute(select(Tenant).where(Tenant.slug == TENANT_SLUG))
        ).scalar_one_or_none()
        if tenant is None:
            raise SystemExit(f"Tenant '{TENANT_SLUG}' not found — run seed_demo first.")
        tid = tenant.tenant_id

        # Categories
        cat_map: dict[str, Category] = {}
        for c in CATEGORIES:
            existing = (
                await s.execute(
                    select(Category).where(
                        Category.tenant_id == tid, Category.name == c["name"]
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = Category(
                    tenant_id=tid,
                    name=c["name"],
                    icon_url=c["icon_url"],
                    display_order=c["display_order"],
                    is_active=True,
                )
                s.add(existing)
                await s.flush()
            cat_map[c["name"]] = existing

        # Menu items
        item_count = 0
        for cat_name, rows in ITEMS.items():
            cat = cat_map[cat_name]
            for row in rows:
                name, desc, price, prep = row[0], row[1], row[2], row[3]
                homemade = row[4] if len(row) > 4 else (cat_name == "Homemade")
                exists = (
                    await s.execute(
                        select(MenuItem).where(
                            MenuItem.category_id == cat.category_id,
                            MenuItem.name == name,
                        )
                    )
                ).scalar_one_or_none()
                if exists is None:
                    s.add(
                        MenuItem(
                            tenant_id=tid,
                            category_id=cat.category_id,
                            listed_by=None,
                            name=name,
                            description=desc,
                            price=Decimal(price),
                            image_url=None,
                            is_available=True,
                            is_homemade=bool(homemade),
                            prep_time_mins=int(prep),
                        )
                    )
                    item_count += 1

        # Tables — 20 tables across 4 zones, 5 per zone, grid positions
        table_count = 0
        for zi, zone in enumerate(ZONES):
            for i in range(1, 6):
                number = f"{chr(65 + zi)}{i}"
                exists = (
                    await s.execute(
                        select(TablesMap).where(
                            TablesMap.tenant_id == tid,
                            TablesMap.table_number == number,
                        )
                    )
                ).scalar_one_or_none()
                if exists is None:
                    s.add(
                        TablesMap(
                            tenant_id=tid,
                            outlet_id=None,
                            table_number=number,
                            zone=zone,
                            capacity=4,
                            status="available",
                            position_x=i,
                            position_y=zi + 1,
                        )
                    )
                    table_count += 1

        await s.commit()
        print(f"Tenant: {TENANT_SLUG} ({tid})")
        print(f"  categories ensured: {len(CATEGORIES)}")
        print(f"  menu items added:   {item_count}")
        print(f"  tables added:       {table_count}")
        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())

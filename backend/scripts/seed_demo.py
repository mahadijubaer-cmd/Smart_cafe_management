"""Demo seed script — Section 23.3 credentials.

Creates the exact users shown in the project demo table.
Run AFTER seed_platform.py (tenants must already exist).

Usage (inside Docker):
    docker compose exec backend python -m scripts.seed_demo

Or locally:
    python -m scripts.seed_demo
"""
import asyncio
import uuid

from passlib.context import CryptContext
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.tenant import SubscriptionTier, Tenant, TenantType
from app.models.user import User, UserRole

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _h(password: str) -> str:
    return pwd_context.hash(password)


# Fixed UUIDs — must match seed_platform.py so upserts are idempotent
PLATFORM_TENANT_ID  = uuid.UUID("10000000-0000-0000-0000-000000000002")
TESTY_BRAND_ID      = uuid.UUID("10000000-0000-0000-0000-000000000003")
TESTY_GULSHAN_ID    = uuid.UUID("10000000-0000-0000-0000-000000000004")
BRACU_TENANT_ID     = uuid.UUID("10000000-0000-0000-0000-000000000001")
# Food court extension (Phase 13)
UNIMART_FC_ID       = uuid.UUID("10000000-0000-0000-0000-000000000005")
UNIMART_BURGER_ID   = uuid.UUID("10000000-0000-0000-0000-000000000006")
UNIMART_SUSHI_ID    = uuid.UUID("10000000-0000-0000-0000-000000000007")

# Tenant definition for "BRACU Cafeteria" (slug: bracu)
# Inserted only if missing; seed_platform.py may already have it via migration 0003.
EXTRA_TENANTS = [
    {
        "tenant_id": BRACU_TENANT_ID,
        "tenant_type": TenantType.academic,
        "name": "BRACU Cafeteria",
        "slug": "bracu",
        "subscription_tier": SubscriptionTier.professional,
        "is_active": True,
    },
    # Food court parent
    {
        "tenant_id": UNIMART_FC_ID,
        "tenant_type": TenantType.food_court,
        "name": "Unimart Food Hall",
        "slug": "unimart-hall",
        "subscription_tier": SubscriptionTier.professional,
        "is_active": True,
    },
    # Vendor A
    {
        "tenant_id": UNIMART_BURGER_ID,
        "tenant_type": TenantType.food_court_vendor,
        "name": "Burger Joint",
        "slug": "unimart-burger",
        "parent_tenant_id": UNIMART_FC_ID,
        "subscription_tier": SubscriptionTier.starter,
        "is_active": True,
    },
    # Vendor B
    {
        "tenant_id": UNIMART_SUSHI_ID,
        "tenant_type": TenantType.food_court_vendor,
        "name": "Sushi Bar",
        "slug": "unimart-sushi",
        "parent_tenant_id": UNIMART_FC_ID,
        "subscription_tier": SubscriptionTier.starter,
        "is_active": True,
    },
]

# Section 23.3 demo credentials
DEMO_USERS = [
    {
        "tenant_id": PLATFORM_TENANT_ID,
        "email": "platform@scms.io",
        "full_name": "Platform Admin",
        "role": UserRole.platform_admin,
        # Must match seed_platform.py's DEMO_PASSWORD: that script runs first and
        # creates this user, so this script's own insert always skips (upsert-by-
        # existing-email) and seed_platform.py's password silently wins regardless
        # of what's set here — keep the two in sync rather than have this be a lie.
        "password": "Demo@1234",
    },
    {
        "tenant_id": TESTY_BRAND_ID,
        "email": "brand@testythreat.com",
        "full_name": "Testy Treat Super Admin",
        "role": UserRole.super_admin,
        "password": "Brand@1234",
    },
    {
        "tenant_id": TESTY_GULSHAN_ID,
        "outlet_id": TESTY_GULSHAN_ID,
        "email": "gulshan@testythreat.com",
        "full_name": "Gulshan Outlet Admin",
        "role": UserRole.outlet_admin,
        "password": "Outlet@1234",
    },
    {
        "tenant_id": BRACU_TENANT_ID,
        "email": "mahadi.jubaer@g.bracu.ac.bd",
        "full_name": "BRACU Tenant Admin",
        "role": UserRole.tenant_admin,
        "password": "Admin@1234",
    },
    {
        "tenant_id": BRACU_TENANT_ID,
        "email": "staff1@bracu.scms",
        "full_name": "BRACU Staff",
        "role": UserRole.staff,
        "password": "Staff@1234",
    },
    {
        "tenant_id": BRACU_TENANT_ID,
        "email": "cleaner1@bracu.scms",
        "full_name": "BRACU Cleaner",
        "role": UserRole.cleaner,
        "password": "Cleaner@1234",
    },
    {
        "tenant_id": BRACU_TENANT_ID,
        "email": "student1@g.bracu.ac.bd",
        "full_name": "Demo Student",
        "role": UserRole.student,
        "password": "Student@1234",
    },
    # Food court users (Phase 13)
    {
        "tenant_id": UNIMART_FC_ID,
        "email": "fcadmin@unimart.hall",
        "full_name": "Unimart Floor Admin",
        "role": UserRole.food_court_admin,
        "password": "FoodCourt@1234",
    },
    {
        "tenant_id": UNIMART_FC_ID,
        "email": "server1@unimart.hall",
        "full_name": "Unimart Server",
        "role": UserRole.server,
        "password": "Server@1234",
    },
    {
        "tenant_id": UNIMART_BURGER_ID,
        "email": "admin@unimart-burger.com",
        "full_name": "Burger Joint Admin",
        "role": UserRole.tenant_admin,
        "password": "Burger@1234",
    },
    {
        "tenant_id": UNIMART_SUSHI_ID,
        "email": "admin@unimart-sushi.com",
        "full_name": "Sushi Bar Admin",
        "role": UserRole.tenant_admin,
        "password": "Sushi@1234",
    },
]


async def _upsert_tenant(session, data: dict) -> None:
    existing = await session.execute(
        select(Tenant).where(Tenant.tenant_id == data["tenant_id"])
    )
    if existing.scalar_one_or_none():
        print(f"  [skip] tenant '{data['slug']}' already exists")
        return
    session.add(Tenant(**data))
    print(f"  [+] tenant '{data['slug']}'")


async def _upsert_user(session, data: dict) -> None:
    password = data.pop("password")
    existing = await session.execute(
        select(User).where(
            User.email == data["email"],
            User.tenant_id == data["tenant_id"],
        )
    )
    if existing.scalar_one_or_none():
        print(f"  [skip] user '{data['email']}' already exists")
        data["password"] = password  # restore for idempotent re-runs
        return
    session.add(User(password_hash=_h(password), **data))
    print(f"  [+] user '{data['email']}'  role={data['role'].value}  pw={password}")


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        print("Ensuring tenants exist...")
        for t in EXTRA_TENANTS:
            await _upsert_tenant(session, t)
        await session.commit()

        print("\nSeeding demo users (Section 23.3 credentials)...")
        for u in DEMO_USERS:
            await _upsert_user(session, u)
        await session.commit()

    print("\n✓ Demo seed complete.")
    print("\nDemo credentials:")
    print(f"  {'Role':<20} {'Email':<35} {'Password'}")
    print(f"  {'-'*20} {'-'*35} {'-'*15}")
    rows = [
        ("Platform Admin",    "platform@scms.io",          "Demo@1234"),
        ("Super Admin",       "brand@testythreat.com",      "Brand@1234"),
        ("Outlet Admin",      "gulshan@testythreat.com",    "Outlet@1234"),
        ("Tenant Admin",      "mahadi.jubaer@g.bracu.ac.bd", "Admin@1234"),
        ("Staff",             "staff1@bracu.scms",          "Staff@1234"),
        ("Cleaner",           "cleaner1@bracu.scms",        "Cleaner@1234"),
        ("Student",           "student1@g.bracu.ac.bd",     "Student@1234"),
        ("FC Admin",          "fcadmin@unimart.hall",       "FoodCourt@1234"),
        ("FC Server",         "server1@unimart.hall",       "Server@1234"),
        ("Vendor Admin (A)",  "admin@unimart-burger.com",   "Burger@1234"),
        ("Vendor Admin (B)",  "admin@unimart-sushi.com",    "Sushi@1234"),
    ]
    for role, email, pw in rows:
        print(f"  {role:<20} {email:<35} {pw}")


if __name__ == "__main__":
    asyncio.run(seed())

"""Seed script — run once after migrations to populate demo data.

Usage (from backend/ directory):
    python -m scripts.seed_platform

Or inside Docker:
    docker compose exec backend python -m scripts.seed_platform

What it creates:
  Tenants:
    - SCMS Platform          (slug: scms-platform,  type: corporate)   — houses platform_admin
    - BRAC University        (slug: bracu,           type: academic)    — seeded by migration 0003
    - Testy Treat            (slug: testy-treat,     type: franchise_brand)
    - Testy Treat Gulshan    (slug: testy-treat-gulshan, type: franchise_outlet)

  Users (password: Demo@1234 for all):
    - platform@scms.io       role: platform_admin  (SCMS Platform tenant)
    - admin@g.bracu.ac.bd    role: tenant_admin    (BRACU tenant)
    - alice@g.bracu.ac.bd    role: customer        (BRACU tenant)
    - superadmin@testy.com   role: super_admin     (Testy Treat brand)
    - staff@testy-gulshan.com role: outlet_admin   (Testy Treat Gulshan outlet)
"""
import asyncio
import uuid

from passlib.context import CryptContext
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.tenant import SubscriptionTier, Tenant, TenantType
from app.models.user import User, UserRole

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
DEMO_PASSWORD = pwd_context.hash("Demo@1234")

# Fixed UUIDs — deterministic so the script is idempotent
BRACU_TENANT_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
PLATFORM_TENANT_ID = uuid.UUID("10000000-0000-0000-0000-000000000002")
TESTY_BRAND_ID = uuid.UUID("10000000-0000-0000-0000-000000000003")
TESTY_GULSHAN_ID = uuid.UUID("10000000-0000-0000-0000-000000000004")


TENANTS = [
    {
        "tenant_id": PLATFORM_TENANT_ID,
        "tenant_type": TenantType.corporate,
        "name": "SCMS Platform",
        "slug": "scms-platform",
        "subscription_tier": SubscriptionTier.enterprise,
        "is_active": True,
    },
    {
        "tenant_id": TESTY_BRAND_ID,
        "tenant_type": TenantType.franchise_brand,
        "name": "Testy Treat",
        "slug": "testy-treat",
        "subscription_tier": SubscriptionTier.professional,
        "is_active": True,
    },
    {
        "tenant_id": TESTY_GULSHAN_ID,
        "tenant_type": TenantType.franchise_outlet,
        "name": "Testy Treat — Gulshan",
        "slug": "testy-treat-gulshan",
        "parent_tenant_id": TESTY_BRAND_ID,
        "subscription_tier": SubscriptionTier.professional,
        "is_active": True,
    },
]

USERS = [
    {
        "tenant_id": PLATFORM_TENANT_ID,
        "email": "platform@scms.io",
        "full_name": "Platform Admin",
        "role": UserRole.platform_admin,
    },
    {
        "tenant_id": BRACU_TENANT_ID,
        "email": "admin@g.bracu.ac.bd",
        "full_name": "BRACU Tenant Admin",
        "role": UserRole.tenant_admin,
    },
    {
        "tenant_id": BRACU_TENANT_ID,
        "email": "alice@g.bracu.ac.bd",
        "full_name": "Alice Rahman",
        "role": UserRole.customer,
    },
    {
        "tenant_id": TESTY_BRAND_ID,
        "email": "superadmin@testy.com",
        "full_name": "Testy Treat Super Admin",
        "role": UserRole.super_admin,
    },
    {
        "tenant_id": TESTY_GULSHAN_ID,
        "outlet_id": TESTY_GULSHAN_ID,
        "email": "staff@testy-gulshan.com",
        "full_name": "Gulshan Outlet Admin",
        "role": UserRole.outlet_admin,
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
    existing = await session.execute(
        select(User).where(
            User.email == data["email"],
            User.tenant_id == data["tenant_id"],
        )
    )
    if existing.scalar_one_or_none():
        print(f"  [skip] user '{data['email']}' already exists")
        return
    session.add(User(password_hash=DEMO_PASSWORD, **data))
    print(f"  [+] user '{data['email']}'  role={data['role'].value}")


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        print("Seeding tenants...")
        for t in TENANTS:
            await _upsert_tenant(session, t)
        await session.commit()

        print("Seeding users...")
        for u in USERS:
            await _upsert_user(session, u)
        await session.commit()

    print("\nDone. Demo password for all users: Demo@1234")


if __name__ == "__main__":
    asyncio.run(seed())

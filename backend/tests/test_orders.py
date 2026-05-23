import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app
from app.models.menu import Category, MenuItem
from app.models.models import CleanerLog, Order, User
from app.models.order import OrderStatus, PaymentStatus
from app.models.table import TablesMap, TableStatus
from app.models.user import UserRole
from app.services.auth_service import AuthService


TEST_PASSWORD = "password123"
auth_service = AuthService()

STUDENT_A_EMAIL = "student.a@bracu.ac.bd"
STUDENT_B_EMAIL = "student.b@bracu.ac.bd"
STAFF_EMAIL = "staff@test.bracu.ac.bd"
ADMIN_EMAIL = "admin@test.bracu.ac.bd"
CLEANER_EMAIL = "cleaner@test.bracu.ac.bd"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        category = Category(name="Test Category", icon_url=None, display_order=1, is_active=True)
        session.add(category)
        await session.flush()

        seeded_users = [
            User(
                user_id=uuid4(),
                full_name="Admin User",
                email=ADMIN_EMAIL,
                password_hash=auth_service.hash_password(TEST_PASSWORD),
                role=UserRole.admin,
                student_id=None,
                phone=None,
                wallet_balance=Decimal("0.00"),
                reward_points=0,
                is_active=True,
            ),
            User(
                user_id=uuid4(),
                full_name="Staff User",
                email=STAFF_EMAIL,
                password_hash=auth_service.hash_password(TEST_PASSWORD),
                role=UserRole.staff,
                student_id=None,
                phone=None,
                wallet_balance=Decimal("0.00"),
                reward_points=0,
                is_active=True,
            ),
            User(
                user_id=uuid4(),
                full_name="Cleaner User",
                email=CLEANER_EMAIL,
                password_hash=auth_service.hash_password(TEST_PASSWORD),
                role=UserRole.cleaner,
                student_id=None,
                phone=None,
                wallet_balance=Decimal("0.00"),
                reward_points=0,
                is_active=True,
            ),
            User(
                user_id=uuid4(),
                full_name="Student A",
                email=STUDENT_A_EMAIL,
                password_hash=auth_service.hash_password(TEST_PASSWORD),
                role=UserRole.student,
                student_id="22100010",
                phone="01710000010",
                wallet_balance=Decimal("500.00"),
                reward_points=0,
                is_active=True,
            ),
            User(
                user_id=uuid4(),
                full_name="Student B",
                email=STUDENT_B_EMAIL,
                password_hash=auth_service.hash_password(TEST_PASSWORD),
                role=UserRole.student,
                student_id="22100011",
                phone="01710000011",
                wallet_balance=Decimal("500.00"),
                reward_points=0,
                is_active=True,
            ),
        ]
        session.add_all(seeded_users)
        await session.commit()

        async def override_get_db():
            yield session

        app.dependency_overrides[get_db] = override_get_db

        try:
            yield session
        finally:
            app.dependency_overrides.pop(get_db, None)

    await engine.dispose()


@pytest_asyncio.fixture
async def async_client(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def seeded_tables(db_session):
    tables = [
        TablesMap(table_id=index, table_number=f"T{index}", zone="indoor", capacity=4, status=TableStatus.available, position_x=index - 1, position_y=0)
        for index in range(1, 6)
    ]
    db_session.add_all(tables)
    await db_session.commit()
    return tables


@pytest_asyncio.fixture
async def seeded_items(db_session):
    category_result = await db_session.execute(select(Category).where(Category.name == "Test Category"))
    category = category_result.scalar_one()

    items = [
        MenuItem(
            item_id=uuid4(),
            category_id=category.category_id,
            listed_by=None,
            name="Available Item 1",
            description="Available item one",
            price=Decimal("50.00"),
            image_url=None,
            is_available=True,
            is_homemade=False,
            prep_time_mins=10,
        ),
        MenuItem(
            item_id=uuid4(),
            category_id=category.category_id,
            listed_by=None,
            name="Available Item 2",
            description="Available item two",
            price=Decimal("70.00"),
            image_url=None,
            is_available=True,
            is_homemade=False,
            prep_time_mins=10,
        ),
        MenuItem(
            item_id=uuid4(),
            category_id=category.category_id,
            listed_by=None,
            name="Unavailable Item",
            description="Unavailable item",
            price=Decimal("40.00"),
            image_url=None,
            is_available=False,
            is_homemade=False,
            prep_time_mins=10,
        ),
    ]
    db_session.add_all(items)
    await db_session.commit()
    return items


@pytest_asyncio.fixture
async def student_token(async_client):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": STUDENT_A_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def staff_token(async_client):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": STAFF_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def admin_token(async_client):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def student_client(async_client, student_token):
    async_client.headers.update({"Authorization": f"Bearer {student_token}"})
    yield async_client
    async_client.headers.pop("Authorization", None)


@pytest_asyncio.fixture
async def staff_client(async_client, staff_token):
    async_client.headers.update({"Authorization": f"Bearer {staff_token}"})
    yield async_client
    async_client.headers.pop("Authorization", None)


@pytest_asyncio.fixture
async def admin_client(async_client, admin_token):
    async_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    yield async_client
    async_client.headers.pop("Authorization", None)


@pytest_asyncio.fixture
async def student_b_token(async_client):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": STUDENT_B_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _order_payload(items, table_id=1):
    return {
        "items": [{"item_id": str(item.item_id), "quantity": quantity} for item, quantity in items],
        "table_id": table_id,
        "time_slot": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "special_notes": "",
        "redeem_points": False,
    }


async def _create_order(async_client: AsyncClient, item_pairs, table_id=1):
    response = await async_client.post("/api/v1/orders/", json=_order_payload(item_pairs, table_id=table_id))
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_place_order_success(student_client, db_session, seeded_items, seeded_tables):
    order_response = await student_client.post(
        "/api/v1/orders/",
        json=_order_payload([(seeded_items[0], 2), (seeded_items[1], 1)], table_id=1),
    )

    assert order_response.status_code == 201
    order_id = order_response.json()["order_id"]

    order_result = await db_session.execute(select(Order).where(Order.order_id == order_id))
    order = order_result.scalar_one_or_none()
    assert order is not None
    assert Decimal(str(order.total_amount)) == Decimal("170.00")

    table_result = await db_session.execute(select(TablesMap).where(TablesMap.table_id == 1))
    table = table_result.scalar_one_or_none()
    assert table is not None
    assert table.status == TableStatus.occupied


@pytest.mark.asyncio
async def test_place_order_unavailable_item(student_client, seeded_items, seeded_tables):
    response = await student_client.post(
        "/api/v1/orders/",
        json=_order_payload([(seeded_items[0], 1), (seeded_items[2], 1)], table_id=2),
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_place_order_empty_items(student_client, seeded_tables):
    response = await student_client.post(
        "/api/v1/orders/",
        json={
            "items": [],
            "table_id": 1,
            "time_slot": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "special_notes": "",
            "redeem_points": False,
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_place_order_invalid_table(student_client, seeded_items, seeded_tables):
    response = await student_client.post(
        "/api/v1/orders/",
        json=_order_payload([(seeded_items[0], 1)], table_id=999),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_own_orders(student_client, db_session, seeded_items, seeded_tables):
    created = await _create_order(student_client, [(seeded_items[0], 1)], table_id=1)

    response = await student_client.get("/api/v1/orders/")

    assert response.status_code == 200
    assert any(order["order_id"] == created["order_id"] for order in response.json())


@pytest.mark.asyncio
async def test_student_cannot_see_other_orders(async_client, student_token, student_b_token, seeded_items, seeded_tables):
    async_client.headers.update({"Authorization": f"Bearer {student_b_token}"})
    other_order_response = await async_client.post(
        "/api/v1/orders/",
        json=_order_payload([(seeded_items[0], 1)], table_id=2),
    )
    assert other_order_response.status_code == 201
    other_order_id = other_order_response.json()["order_id"]

    async_client.headers.update({"Authorization": f"Bearer {student_token}"})
    response = await async_client.get(f"/api/v1/orders/{other_order_id}")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_staff_update_status_preparing(student_client, staff_client, seeded_items, seeded_tables):
    created = await _create_order(student_client, [(seeded_items[0], 1)], table_id=3)

    response = await staff_client.patch(
        f"/api/v1/orders/{created['order_id']}/status",
        json={"status": "confirmed"},
    )
    assert response.status_code == 200

    response = await staff_client.patch(
        f"/api/v1/orders/{created['order_id']}/status",
        json={"status": "preparing"},
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_staff_invalid_status_transition(student_client, staff_client, seeded_items, seeded_tables):
    created = await _create_order(student_client, [(seeded_items[0], 1)], table_id=4)

    response = await staff_client.patch(
        f"/api/v1/orders/{created['order_id']}/status",
        json={"status": "delivered"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_student_cannot_update_status(student_client, seeded_items, seeded_tables):
    created = await _create_order(student_client, [(seeded_items[0], 1)], table_id=5)

    response = await student_client.patch(
        f"/api/v1/orders/{created['order_id']}/status",
        json={"status": "confirmed"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_complete_meal_assigns_cleaner(student_client, staff_client, db_session, seeded_items, seeded_tables):
    created = await _create_order(student_client, [(seeded_items[0], 1)], table_id=1)
    order_id = created["order_id"]

    for status in ("confirmed", "preparing", "ready", "delivered"):
        response = await staff_client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"status": status},
        )
        assert response.status_code == 200

    complete_response = await student_client.patch(f"/api/v1/orders/{order_id}/complete")
    assert complete_response.status_code == 202

    cleaner_log = None
    for _ in range(10):
        cleaner_log_result = await db_session.execute(
            select(CleanerLog).where(CleanerLog.triggered_by_order == order_id)
        )
        cleaner_log = cleaner_log_result.scalar_one_or_none()
        if cleaner_log is not None:
            break
        await asyncio.sleep(0.05)

    assert cleaner_log is not None

    table_result = await db_session.execute(select(TablesMap).where(TablesMap.table_id == 1))
    table = table_result.scalar_one_or_none()
    assert table is not None
    assert table.status == TableStatus.cleaning


@pytest.mark.asyncio
async def test_cancel_pending_order(student_client, db_session, seeded_items, seeded_tables):
    created = await _create_order(student_client, [(seeded_items[0], 1)], table_id=2)

    response = await student_client.delete(f"/api/v1/orders/{created['order_id']}")

    assert response.status_code == 200

    order_result = await db_session.execute(select(Order).where(Order.order_id == created["order_id"]))
    order = order_result.scalar_one_or_none()
    assert order is not None
    assert order.status == OrderStatus.cancelled


@pytest.mark.asyncio
async def test_cannot_cancel_delivered_order(student_client, staff_client, seeded_items, seeded_tables):
    created = await _create_order(student_client, [(seeded_items[0], 1)], table_id=3)
    order_id = created["order_id"]

    for status in ("confirmed", "preparing", "ready", "delivered"):
        response = await staff_client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"status": status},
        )
        assert response.status_code == 200

    cancel_response = await student_client.delete(f"/api/v1/orders/{order_id}")
    assert cancel_response.status_code == 400
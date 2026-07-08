import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.menu import MenuItem
from app.models.models import Notification, RewardLog, User
from app.models.order import Order, OrderItem, OrderSource, OrderStatus, PaymentMethod, PaymentStatus
from app.models.table import TablesMap, TableStatus
from app.models.tenant import Tenant, TenantType
from app.schemas.order import OrderCreate, StaffPosOrderCreate
from app.schemas.public import GuestOrderCreate
from app.services.cleaner_service import CleanerService
from app.services import inventory_service

# PUB-4: a guest order not confirmed within this window is auto-cancelled.
GUEST_ORDER_EXPIRY_MINUTES = 20

# Risk mitigation (RFC-007 §5): cap concurrent pending guest orders per table.
GUEST_ORDER_TABLE_PENDING_CAP = 3

_GUEST_ACTIVE_STATUSES = (
    OrderStatus.pending_confirmation.value,
    OrderStatus.confirmed.value,
    OrderStatus.preparing.value,
    OrderStatus.ready.value,
)


class OrderService:
    async def create_order(
        self,
        db: AsyncSession,
        user_id: UUID,
        order_data: OrderCreate,
        tenant_id: UUID,
    ) -> Order:
        result = await db.execute(
            select(User).where(User.user_id == user_id, User.tenant_id == tenant_id)
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        items_data = []
        total_amount = Decimal("0.00")

        for item_req in order_data.items:
            result = await db.execute(
                select(MenuItem).where(
                    MenuItem.item_id == item_req.item_id,
                    MenuItem.tenant_id == tenant_id,
                )
            )
            item = result.scalar_one_or_none()
            if not item:
                raise HTTPException(status_code=404, detail=f"Item {item_req.item_id} not found")
            if not item.is_available:
                raise HTTPException(status_code=400, detail=f"Item {item.name} is not available")

            unit_price = Decimal(str(item.price))
            subtotal = unit_price * item_req.quantity
            total_amount += subtotal
            items_data.append({
                "item": item,
                "quantity": item_req.quantity,
                "unit_price": unit_price,
            })

        discount = Decimal("0.00")
        if order_data.redeem_points:
            if user.reward_points < 100:
                raise HTTPException(status_code=400, detail="Not enough reward points to redeem")
            discount = Decimal("10.00")
            user.reward_points -= 100

        order = Order(
            tenant_id=tenant_id,
            user_id=user_id,
            table_id=order_data.table_id,
            time_slot=order_data.time_slot,
            status=OrderStatus.pending,
            total_amount=total_amount,
            discount_amount=discount,
            payment_status=PaymentStatus.pending,
            payment_method=None,
            special_notes=order_data.special_notes,
        )
        db.add(order)
        await db.flush()

        for item_data in items_data:
            order_item = OrderItem(
                tenant_id=tenant_id,
                order_id=order.order_id,
                item_id=item_data["item"].item_id,
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
            )
            db.add(order_item)

        if order_data.table_id:
            result = await db.execute(
                select(TablesMap).where(
                    TablesMap.table_id == order_data.table_id,
                    TablesMap.tenant_id == tenant_id,
                )
            )
            table = result.scalar_one_or_none()
            if not table:
                raise HTTPException(status_code=404, detail="Table not found")
            table.status = TableStatus.occupied

        db.add(Notification(
            tenant_id=tenant_id,
            user_id=user_id,
            type="ORDER_PLACED",
            message=f"Your order #{str(order.order_id)[:8]} has been placed",
        ))

        await db.commit()
        await db.refresh(user)

        # Deduct inventory for all order items that have recipes (non-blocking)
        try:
            await inventory_service.consume_inventory_for_order(db, order, tenant_id)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "Inventory deduction failed for order %s — order still placed", order.order_id
            )

        loaded = await db.execute(
            select(Order).options(selectinload(Order.items)).where(Order.order_id == order.order_id)
        )
        return loaded.scalar_one()

    async def update_status(
        self,
        db: AsyncSession,
        order_id: str,
        new_status: str,
        tenant_id: UUID,
    ) -> Order:
        valid_transitions = {
            "pending_confirmation": ["confirmed", "cancelled"],  # PUB-3: staff confirmation gate
            "pending": ["confirmed"],
            "confirmed": ["preparing"],
            "preparing": ["ready"],
            "ready": ["delivered"],
            "cancelled": [],
        }

        try:
            order_uuid = uuid.UUID(str(order_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Order not found")

        result = await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.order_id == order_uuid, Order.tenant_id == tenant_id)
        )
        order = result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        current_status = getattr(order.status, "value", order.status)
        if new_status not in valid_transitions.get(current_status, []):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from {current_status} to {new_status}",
            )

        order.status = new_status
        order.updated_at = datetime.utcnow()
        await db.commit()

        # Re-load with items eagerly so response serialization does not trigger
        # a lazy load outside the async context (MissingGreenlet).
        reloaded = await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.order_id == order_uuid, Order.tenant_id == tenant_id)
        )
        return reloaded.scalar_one()

    async def complete_meal(
        self,
        db: AsyncSession,
        order_id: str,
        user_id: UUID,
        tenant_id: UUID,
    ) -> Order:
        try:
            order_uuid = uuid.UUID(str(order_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Order not found")

        result = await db.execute(
            select(Order).where(Order.order_id == order_uuid, Order.tenant_id == tenant_id)
        )
        order = result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        current_status = getattr(order.status, "value", order.status)
        if current_status != "delivered":
            raise HTTPException(status_code=400, detail="Order must be delivered before completion")

        if order.table_id:
            await CleanerService().assign_cleaner(db, order.table_id, order.order_id, tenant_id)

        points = int(Decimal(str(order.total_amount)) // Decimal("10"))
        result = await db.execute(
            select(User).where(User.user_id == user_id, User.tenant_id == tenant_id)
        )
        user = result.scalar_one_or_none()
        if user and points > 0:
            user.reward_points += points

        db.add(RewardLog(
            tenant_id=tenant_id,
            user_id=user_id,
            order_id=order.order_id,
            points_earned=points,
            points_redeemed=0,
            description=f"Reward points for completing order #{str(order.order_id)[:8]}",
        ))
        await db.commit()
        if user:
            await db.refresh(user)
        await db.refresh(order)
        return order

    async def create_guest_order_session(
        self,
        db: AsyncSession,
        tenant: Tenant,
        guest_data: GuestOrderCreate,
    ) -> list[Order]:
        """Entry point for guest checkout — dispatches to the single-vendor or
        food-court (multi-vendor) path. See create_food_court_guest_order for the
        "guest session" (shared guest_token across sibling per-vendor orders)."""
        if tenant.tenant_type == TenantType.food_court:
            return await self.create_food_court_guest_order(db, tenant, guest_data)
        order = await self.create_guest_order(db, tenant.tenant_id, guest_data)
        return [order]

    async def create_food_court_guest_order(
        self,
        db: AsyncSession,
        food_court_tenant: Tenant,
        guest_data: GuestOrderCreate,
    ) -> list[Order]:
        """A food-court guest cart can span multiple vendor tenants. Split into one
        Order per vendor, all sharing one guest_token (a "guest session"), created
        in a single transaction. Shared tables belong to the food-court parent
        (see food_court.list_shared_tables), not the individual vendors."""
        table_result = await db.execute(
            select(TablesMap).where(
                TablesMap.tenant_id == food_court_tenant.tenant_id,
                TablesMap.table_number == guest_data.table_number,
            )
        )
        table = table_result.scalar_one_or_none()
        if not table:
            raise HTTPException(status_code=409, detail="Unknown table for this venue")

        pending_count = await db.execute(
            select(func.count(Order.order_id)).where(
                Order.table_id == table.table_id,
                Order.order_source.in_([OrderSource.guest_qr, OrderSource.kiosk]),
                Order.status.in_(_GUEST_ACTIVE_STATUSES),
            )
        )
        if pending_count.scalar_one() >= GUEST_ORDER_TABLE_PENDING_CAP:
            raise HTTPException(
                status_code=409,
                detail="This table already has the maximum number of active orders",
            )

        vendor_result = await db.execute(
            select(Tenant).where(
                Tenant.parent_tenant_id == food_court_tenant.tenant_id,
                Tenant.tenant_type == TenantType.food_court_vendor,
                Tenant.is_active.is_(True),
            )
        )
        vendors_by_id = {t.tenant_id: t for t in vendor_result.scalars().all()}

        # Group requested items by the vendor tenant that owns each MenuItem —
        # derived server-side from the DB, never trusted from the client payload.
        items_by_vendor: dict[UUID, list[dict]] = {}
        for item_req in guest_data.items:
            result = await db.execute(select(MenuItem).where(MenuItem.item_id == item_req.item_id))
            item = result.scalar_one_or_none()
            if not item or item.tenant_id not in vendors_by_id:
                raise HTTPException(status_code=404, detail=f"Item {item_req.item_id} not found")
            if not item.is_available:
                raise HTTPException(status_code=400, detail=f"Item {item.name} is not available")

            items_by_vendor.setdefault(item.tenant_id, []).append({
                "item": item,
                "quantity": item_req.quantity,
                "unit_price": Decimal(str(item.price)),
            })

        shared_guest_token = uuid.uuid4()
        order_source = OrderSource.kiosk if guest_data.is_kiosk else OrderSource.guest_qr
        created_orders: list[Order] = []

        for vendor_id, items_data in items_by_vendor.items():
            vendor_total = sum((d["unit_price"] * d["quantity"] for d in items_data), Decimal("0.00"))
            order = Order(
                tenant_id=vendor_id,
                outlet_id=None,
                user_id=None,
                table_id=table.table_id,
                time_slot=datetime.now(timezone.utc),
                status=OrderStatus.pending_confirmation,
                order_source=order_source,
                guest_token=shared_guest_token,
                guest_name=guest_data.guest_name,
                guest_phone=guest_data.guest_phone,
                total_amount=vendor_total,
                discount_amount=Decimal("0.00"),
                payment_status=PaymentStatus.pending,
                payment_method=None,
                special_notes=guest_data.special_notes,
            )
            db.add(order)
            await db.flush()

            for item_data in items_data:
                db.add(OrderItem(
                    tenant_id=vendor_id,
                    order_id=order.order_id,
                    item_id=item_data["item"].item_id,
                    quantity=item_data["quantity"],
                    unit_price=item_data["unit_price"],
                ))
            created_orders.append(order)

        await db.commit()

        loaded_orders: list[Order] = []
        for order in created_orders:
            result = await db.execute(
                select(Order).options(selectinload(Order.items)).where(Order.order_id == order.order_id)
            )
            loaded_orders.append(result.scalar_one())
        return loaded_orders

    async def create_guest_order(
        self,
        db: AsyncSession,
        tenant_id: UUID,
        guest_data: GuestOrderCreate,
    ) -> Order:
        """PUB-1..PUB-7: create an unauthenticated guest order (RFC-007)."""
        table_result = await db.execute(
            select(TablesMap).where(
                TablesMap.tenant_id == tenant_id,
                TablesMap.table_number == guest_data.table_number,
            )
        )
        table = table_result.scalar_one_or_none()
        if not table:
            raise HTTPException(status_code=409, detail="Unknown table for this venue")

        # PUB-2/risk mitigation: cap concurrent pending guest orders per table.
        pending_count = await db.execute(
            select(func.count(Order.order_id)).where(
                Order.tenant_id == tenant_id,
                Order.table_id == table.table_id,
                Order.order_source.in_([OrderSource.guest_qr, OrderSource.kiosk]),
                Order.status.in_(_GUEST_ACTIVE_STATUSES),
            )
        )
        if pending_count.scalar_one() >= GUEST_ORDER_TABLE_PENDING_CAP:
            raise HTTPException(
                status_code=409,
                detail="This table already has the maximum number of active orders",
            )

        items_data = []
        total_amount = Decimal("0.00")
        for item_req in guest_data.items:
            result = await db.execute(
                select(MenuItem).where(
                    MenuItem.item_id == item_req.item_id,
                    MenuItem.tenant_id == tenant_id,
                )
            )
            item = result.scalar_one_or_none()
            if not item:
                raise HTTPException(status_code=404, detail=f"Item {item_req.item_id} not found")
            if not item.is_available:
                raise HTTPException(status_code=400, detail=f"Item {item.name} is not available")

            unit_price = Decimal(str(item.price))
            total_amount += unit_price * item_req.quantity
            items_data.append({
                "item": item,
                "quantity": item_req.quantity,
                "unit_price": unit_price,
            })

        order = Order(
            tenant_id=tenant_id,
            outlet_id=table.outlet_id,
            user_id=None,
            table_id=table.table_id,
            time_slot=datetime.now(timezone.utc),
            status=OrderStatus.pending_confirmation,
            order_source=OrderSource.kiosk if guest_data.is_kiosk else OrderSource.guest_qr,
            guest_token=uuid.uuid4(),
            guest_name=guest_data.guest_name,
            guest_phone=guest_data.guest_phone,
            total_amount=total_amount,
            discount_amount=Decimal("0.00"),
            payment_status=PaymentStatus.pending,
            payment_method=None,
            special_notes=guest_data.special_notes,
        )
        db.add(order)
        await db.flush()

        for item_data in items_data:
            db.add(OrderItem(
                tenant_id=tenant_id,
                order_id=order.order_id,
                item_id=item_data["item"].item_id,
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
            ))

        await db.commit()

        loaded = await db.execute(
            select(Order).options(selectinload(Order.items)).where(Order.order_id == order.order_id)
        )
        return loaded.scalar_one()

    async def get_guest_order_group(self, db: AsyncSession, guest_token: str) -> list[Order]:
        """PUB-6: guest_token is a capability for its whole "guest session" — one
        order for single-vendor venues, or one order per vendor for a food-court
        cart. Also enforces PUB-4 expiry on each sibling order independently."""
        try:
            token_uuid = uuid.UUID(str(guest_token))
        except ValueError:
            raise HTTPException(status_code=404, detail="Order not found")

        result = await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.guest_token == token_uuid)
            .order_by(Order.created_at)
        )
        orders = list(result.scalars().all())
        if not orders:
            raise HTTPException(status_code=404, detail="Order not found")

        for order in orders:
            await self._expire_if_stale(db, order)
        return orders

    async def resolve_public_owner_tenant(self, db: AsyncSession, order: Order) -> Tenant | None:
        """The tenant whose `public_slug`/`guest_checkout_mode` governs this order.

        For single-vendor restaurants this is `order.tenant_id` itself. For a
        food-court vendor order, the guest actually entered via the food-court
        PARENT's public menu — resolved via the shared table, which the parent
        owns (order.tenant_id is the vendor, not the parent, in that case)."""
        owner_tenant_id = order.tenant_id
        if order.table_id is not None:
            table_result = await db.execute(
                select(TablesMap).where(TablesMap.table_id == order.table_id)
            )
            table = table_result.scalar_one_or_none()
            if table is not None:
                owner_tenant_id = table.tenant_id

        tenant_result = await db.execute(select(Tenant).where(Tenant.tenant_id == owner_tenant_id))
        return tenant_result.scalar_one_or_none()

    async def _expire_if_stale(self, db: AsyncSession, order: Order) -> None:
        """PUB-4: auto-cancel a guest order still pending_confirmation past the expiry window."""
        current_status = getattr(order.status, "value", order.status)
        if current_status != OrderStatus.pending_confirmation.value:
            return

        created_at = order.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - created_at > timedelta(minutes=GUEST_ORDER_EXPIRY_MINUTES):
            order.status = OrderStatus.cancelled
            await db.commit()
            await db.refresh(order)

    async def pay_guest_order_online(self, db: AsyncSession, guest_token: str) -> list[Order]:
        """RFC-007 Phase 2: simulated online payment for a whole guest session.

        Mirrors the existing `PaymentMethod.simulation` pattern used by authenticated
        wallet orders — always succeeds, no real gateway call. Only usable when the
        owning tenant (the food-court parent, or the restaurant itself) has opted
        into `guest_checkout_mode='online'`; otherwise the venue is pay-at-counter
        only (see `mark_paid_at_counter`). Pays every non-cancelled sibling order in
        the session in one action — a guest pays once for the whole cart, even if
        it was split across multiple food-court vendors.
        """
        orders = await self.get_guest_order_group(db, guest_token)  # 404s + PUB-4 expiry check

        payable = [
            o for o in orders
            if getattr(o.status, "value", o.status) != OrderStatus.cancelled.value
        ]
        if not payable:
            raise HTTPException(status_code=400, detail="This order was cancelled")
        if all(getattr(o.payment_status, "value", o.payment_status) == PaymentStatus.paid.value for o in payable):
            raise HTTPException(status_code=400, detail="Order is already paid")

        owner_tenant = await self.resolve_public_owner_tenant(db, orders[0])
        if not owner_tenant or owner_tenant.guest_checkout_mode != "online":
            raise HTTPException(
                status_code=400,
                detail="Online payment is not enabled for this venue — pay at the counter instead",
            )

        for order in payable:
            if getattr(order.payment_status, "value", order.payment_status) != PaymentStatus.paid.value:
                order.payment_status = PaymentStatus.paid
                order.payment_method = PaymentMethod.simulation
        await db.commit()
        for order in orders:
            await db.refresh(order)
        return orders

    async def mark_paid_at_counter(self, db: AsyncSession, order_id: str, tenant_id: UUID) -> Order:
        """WAL-4: staff action for guest orders — no wallet, no gateway."""
        try:
            order_uuid = uuid.UUID(str(order_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Order not found")

        result = await db.execute(
            select(Order).options(selectinload(Order.items)).where(
                Order.order_id == order_uuid, Order.tenant_id == tenant_id
            )
        )
        order = result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        current_source = getattr(order.order_source, "value", order.order_source)
        if current_source == OrderSource.customer_app.value:
            raise HTTPException(
                status_code=400,
                detail="customer_app orders are paid via wallet, not the counter",
            )

        current_payment_status = getattr(order.payment_status, "value", order.payment_status)
        if current_payment_status == PaymentStatus.paid.value:
            raise HTTPException(status_code=400, detail="Order is already paid")

        order.payment_status = PaymentStatus.paid
        await db.commit()
        await db.refresh(order)
        return order

    async def create_staff_pos_order(
        self,
        db: AsyncSession,
        tenant_id: UUID,
        staff_user_id: UUID,
        pos_data: StaffPosOrderCreate,
    ) -> Order:
        """RFC-007 (Phase 22): staff POS entry — attributed to the staff member's
        own account (satisfies chk_order_identity), pay-at-counter, no wallet.
        Skips the guest confirmation gate: staff already confirmed by entering it."""
        items_data = []
        total_amount = Decimal("0.00")
        for item_req in pos_data.items:
            result = await db.execute(
                select(MenuItem).where(
                    MenuItem.item_id == item_req.item_id,
                    MenuItem.tenant_id == tenant_id,
                )
            )
            item = result.scalar_one_or_none()
            if not item:
                raise HTTPException(status_code=404, detail=f"Item {item_req.item_id} not found")
            if not item.is_available:
                raise HTTPException(status_code=400, detail=f"Item {item.name} is not available")

            unit_price = Decimal(str(item.price))
            total_amount += unit_price * item_req.quantity
            items_data.append({
                "item": item,
                "quantity": item_req.quantity,
                "unit_price": unit_price,
            })

        table_id = None
        if pos_data.table_id is not None:
            table_result = await db.execute(
                select(TablesMap).where(
                    TablesMap.table_id == pos_data.table_id,
                    TablesMap.tenant_id == tenant_id,
                )
            )
            table = table_result.scalar_one_or_none()
            if not table:
                raise HTTPException(status_code=404, detail="Table not found")
            table_id = table.table_id

        order = Order(
            tenant_id=tenant_id,
            user_id=staff_user_id,
            table_id=table_id,
            time_slot=datetime.now(timezone.utc),
            status=OrderStatus.confirmed,
            order_source=OrderSource.staff_pos,
            guest_name=pos_data.guest_name,
            total_amount=total_amount,
            discount_amount=Decimal("0.00"),
            payment_status=PaymentStatus.pending,
            payment_method=None,
            special_notes=pos_data.special_notes,
        )
        db.add(order)
        await db.flush()

        for item_data in items_data:
            db.add(OrderItem(
                tenant_id=tenant_id,
                order_id=order.order_id,
                item_id=item_data["item"].item_id,
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
            ))

        await db.commit()

        loaded = await db.execute(
            select(Order).options(selectinload(Order.items)).where(Order.order_id == order.order_id)
        )
        return loaded.scalar_one()

"""Public/guest ordering surface (RFC-007, Phase 22).

No JWT middleware applies to this router (mounted at /api/v1/public). Every
handler resolves `public_slug -> tenant_id` in exactly one query before
touching any other table (PUB-1) — that query is the entire tenant-isolation
boundary here, since there is no Bearer token to carry tenant context.

Food courts are a special case: `public_slug` resolves to the food-court PARENT
tenant, but its menu items and orders live on its vendor (child) tenants. A
guest cart spanning multiple vendors becomes one Order per vendor, all sharing
one guest_token (a "guest session") — see order_service.create_guest_order_session.

See specs/modules/public-surface.md for the full design.
"""
from __future__ import annotations

import base64
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.segments import is_restaurant_segment
from app.models.order import Order
from app.models.tenant import Tenant, TenantType
from app.schemas.public import (
    GuestOrderCreate,
    GuestOrderGroupResponse,
    GuestOrderResponse,
    PublicMenuResponse,
    PublicTenantInfoResponse,
)
from app.services import menu_service, qr_service
from app.services.order_service import OrderService
from app.services.ws_pubsub import publish_event

router = APIRouter(prefix="/public", tags=["public"])
order_service = OrderService()

# PUB-2: 5 requests / minute per (client IP, table_number).
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW_SECONDS = 60


async def _resolve_public_tenant(public_slug: str, db: AsyncSession) -> Tenant:
    """PUB-1: single-query slug -> tenant_id resolution. The only tenant-scoping
    mechanism on this router — never widen this to a join across other tables."""
    result = await db.execute(
        select(Tenant).where(
            Tenant.public_slug == public_slug,
            Tenant.public_menu_enabled.is_(True),
            Tenant.is_active.is_(True),
        )
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Menu not found")
    return tenant


async def _check_order_rate_limit(request: Request, table_number: str) -> None:
    """PUB-2: Redis sliding-window-ish (fixed window) rate limit per (ip, table)."""
    client_ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:public_order:{client_ip}:{table_number}"
    redis = await get_redis()
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, _RATE_LIMIT_WINDOW_SECONDS)
    if count > _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many order attempts. Please wait a minute.")


async def _group_response(db: AsyncSession, orders: list[Order]) -> GuestOrderGroupResponse:
    """Builds the response and attaches vendor_id/vendor_name by looking up each
    order's own tenant — NOT from the transient `_vendor_name` attribute set at
    creation time, which only survives on the same Python objects within a single
    request. Any later request (tracking, pay, the guest WS re-fetch) re-queries
    fresh ORM rows with no such attribute, so relying on it would silently drop
    vendor attribution after the first response (caught by live-testing RFC-007)."""
    tenant_ids = {o.tenant_id for o in orders}
    tenant_result = await db.execute(select(Tenant).where(Tenant.tenant_id.in_(tenant_ids)))
    tenants_by_id = {t.tenant_id: t for t in tenant_result.scalars().all()}

    order_responses = []
    for order in orders:
        resp = GuestOrderResponse.model_validate(order)
        tenant = tenants_by_id.get(order.tenant_id)
        if tenant is not None and tenant.tenant_type == TenantType.food_court_vendor:
            resp.vendor_id = str(order.tenant_id)
            resp.vendor_name = tenant.name
        order_responses.append(resp)

    return GuestOrderGroupResponse(
        guest_token=orders[0].guest_token,
        total_amount=sum((r.total_amount for r in order_responses), Decimal("0.00")),
        orders=order_responses,
    )


@router.get("/{public_slug}/menu", response_model=PublicMenuResponse)
async def get_public_menu(public_slug: str, db: AsyncSession = Depends(get_db)):
    """PUB-7: price/availability only — no cost/inventory fields ever leave this
    endpoint. Built by the shared builder in menu_service (RFC-010 refactor)."""
    tenant = await _resolve_public_tenant(public_slug, db)

    redis = await get_redis()
    cache_key = f"public:menu:{tenant.tenant_id}"
    cached = await redis.get(cache_key)
    if cached:
        return PublicMenuResponse.model_validate_json(cached)

    response = await menu_service.build_public_menu(tenant, db)

    await redis.set(cache_key, response.model_dump_json(), ex=60)
    return response


@router.get("/{public_slug}/info", response_model=PublicTenantInfoResponse)
async def get_public_tenant_info(public_slug: str, db: AsyncSession = Depends(get_db)):
    tenant = await _resolve_public_tenant(public_slug, db)
    return tenant


@router.post("/{public_slug}/orders", response_model=GuestOrderGroupResponse, status_code=201)
async def create_public_order(
    public_slug: str,
    order_data: GuestOrderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    tenant = await _resolve_public_tenant(public_slug, db)
    if not is_restaurant_segment(tenant.tenant_type):
        # RFC-007 Phase D: cafeteria-segment tenants may enable a public menu for
        # read-only browsing, but guest checkout stays restaurant-segment only —
        # cafeteria diners already have accounts and order through the normal app.
        raise HTTPException(
            status_code=400,
            detail="Guest ordering is not available for this venue — please log in to order",
        )
    await _check_order_rate_limit(request, order_data.table_number)

    orders = await order_service.create_guest_order_session(db, tenant, order_data)

    for order in orders:
        await publish_event(
            order.tenant_id,
            {
                "type": "ORDER_PLACED",
                "order_id": str(order.order_id),
                "table_id": order.table_id,
                "order_source": order.order_source.value if hasattr(order.order_source, "value") else order.order_source,
                "guest_name": order.guest_name,
                "total_amount": str(order.total_amount),
            },
        )
    return await _group_response(db, orders)


@router.get("/orders/{guest_token}", response_model=GuestOrderGroupResponse)
async def get_public_order(guest_token: str, response: Response, db: AsyncSession = Depends(get_db)):
    """PUB-6: guest_token is a capability for the whole guest session (1+ orders)."""
    response.headers["Cache-Control"] = "no-store"
    orders = await order_service.get_guest_order_group(db, guest_token)
    return await _group_response(db, orders)


@router.post("/orders/{guest_token}/pay", response_model=GuestOrderGroupResponse)
async def pay_public_order_online(guest_token: str, response: Response, db: AsyncSession = Depends(get_db)):
    """RFC-007 Phase 2: simulated online payment (see order_service.pay_guest_order_online).
    Pays every order in the guest's session at once. Only usable when the owning
    venue has `guest_checkout_mode='online'`; otherwise `400`."""
    response.headers["Cache-Control"] = "no-store"
    orders = await order_service.pay_guest_order_online(db, guest_token)

    for order in orders:
        await publish_event(
            order.tenant_id,
            {
                "type": "ORDER_PAID",
                "order_id": str(order.order_id),
                "target_guest_token": str(order.guest_token),
            },
        )
    return await _group_response(db, orders)


@router.get("/orders/{guest_token}/qr")
async def get_public_order_tracking_qr(
    guest_token: str, response: Response, db: AsyncSession = Depends(get_db)
):
    """Base64 PNG QR encoding the guest's own tracking URL — for the post-checkout
    success screen (RFC-007 Sprint 7.5 frontend spec: "success screen with tracking
    link + on-screen QR"). `guest_token` is validated the same way as tracking itself."""
    response.headers["Cache-Control"] = "no-store"
    orders = await order_service.get_guest_order_group(db, guest_token)  # 404s on unknown/foreign token

    owner_tenant = await order_service.resolve_public_owner_tenant(db, orders[0])
    if not owner_tenant:
        raise HTTPException(status_code=404, detail="Order not found")

    tracking_url = f"{settings.FRONTEND_URL}/m/{owner_tenant.public_slug}/track/{guest_token}"
    png_bytes = qr_service.generate_url_qr_bytes(tracking_url)
    return {"data": base64.b64encode(png_bytes).decode()}

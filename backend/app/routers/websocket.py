import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Order
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.websocket_manager import manager
from app.services.ws_pubsub import subscribe, unsubscribe

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])
auth_service = AuthService()


@router.websocket("/ws/device")
async def device_websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    """RFC-010 (Phase 25): device terminal channel — see specs/modules/websocket.md.

    The opaque device token IS the credential (ADR-013), validated by the same
    hash lookup as REST. Devices get the staff-style broadcast stream for their
    scope (a food-court device also hears its vendor children's channels, since
    sibling kiosk orders live on vendor tenants), plus targeted DEVICE_REVOKED.

    Declared before `/ws/{user_id}` deliberately: Starlette matches WebSocket
    routes in registration order, not by specificity, so a single-segment
    dynamic route like `/ws/{user_id}` would otherwise shadow this literal
    `/ws/device` path and swallow every device connection attempt.
    """
    from app.services import device_service

    db_gen = get_db()
    db: AsyncSession = await db_gen.__anext__()
    channels: list[str] = []
    conn_id: str | None = None

    try:
        device = await device_service.resolve_device_by_token(db, token)
        if device is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        conn_id = f"device:{device.device_id}"
        scope_ids = {str(t) for t in await device_service.device_scope_tenant_ids(db, device)}
        await manager.connect(
            websocket, conn_id, "device", str(device.tenant_id), scope_tenant_ids=scope_ids
        )

        channels = await subscribe(list(scope_ids), manager)
        logger.info(
            "Device WebSocket session started: device=%s type=%s tenants=%s",
            device.device_id, device.device_type, scope_ids,
        )

        while True:
            data = await websocket.receive_json()
            if data.get("type") == "PING":
                await websocket.send_json({"type": "PONG"})

    except WebSocketDisconnect:
        logger.info("Device WebSocket disconnected: %s", conn_id)
    except Exception as exc:
        logger.error("Device WebSocket error for %s: %s", conn_id, exc)
    finally:
        if conn_id:
            manager.disconnect(conn_id)
        if channels:
            await unsubscribe(channels)
        await db_gen.aclose()


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    token: str = Query(...),
):
    """Authenticated WebSocket endpoint.

    On connect:
    1. Validates the JWT and loads the user from DB.
    2. Registers the connection in ConnectionManager (with tenant_id).
    3. Joins the tenant's shared channel listener (ws_pubsub.subscribe) — one
       Redis subscription per channel regardless of how many local connections
       share it, so a busy tenant doesn't get N-fold event delivery.
    4. Loops to handle incoming PING frames (and any future client messages).

    On disconnect the channel is released, which tears the shared listener
    down (unsubscribe + close) once no other connection still needs it.
    """
    db_gen = get_db()
    db: AsyncSession = await db_gen.__anext__()
    channels: list[str] = []

    try:
        # ── Auth ──────────────────────────────────────────────────────────────
        try:
            token_data = auth_service.decode_token(token)
        except Exception as exc:
            logger.warning("WebSocket auth failed (token decode): %s", exc)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        if token_data.user_id is None or str(token_data.user_id) != user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if token_data.tenant_id is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        result = await db.execute(select(User).where(User.user_id == token_data.user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        role = user.role.value if hasattr(user.role, "value") else str(user.role)
        tenant_id = str(token_data.tenant_id)
        outlet_id = str(token_data.outlet_id) if token_data.outlet_id else None

        # ── Register connection ───────────────────────────────────────────────
        await manager.connect(websocket, user_id, role, tenant_id)

        # ── Join the tenant's shared channel listener ─────────────────────────
        channels = await subscribe([tenant_id], manager, outlet_id)
        logger.info("WebSocket session started: user=%s tenant=%s outlet=%s", user_id, tenant_id, outlet_id)

        # ── Message loop ──────────────────────────────────────────────────────
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "PING":
                await websocket.send_json({"type": "PONG"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: user=%s", user_id)
    except Exception as exc:
        logger.error("WebSocket error for user %s: %s", user_id, exc)
    finally:
        manager.disconnect(user_id)
        if channels:
            await unsubscribe(channels)
        await db_gen.aclose()


@router.websocket("/ws/public/orders/{guest_token}")
async def guest_order_websocket_endpoint(websocket: WebSocket, guest_token: str):
    """RFC-007 (Phase 22 / Phase D): token-authenticated tracking channel for a
    guest session (1+ sibling orders — a food-court cart split across vendors
    shares one guest_token, see order_service.create_food_court_guest_order).

    The guest_token IS the credential — no JWT, no user_id. Only events targeting
    this exact guest_token are ever delivered, regardless of which sibling
    order's tenant published them (see ConnectionManager.broadcast_to_tenant).
    """
    db_gen = get_db()
    db: AsyncSession = await db_gen.__anext__()
    channels: list[str] = []
    conn_id = f"guest:{guest_token}"

    try:
        result = await db.execute(select(Order).where(Order.guest_token == guest_token))
        orders = result.scalars().all()
        if not orders:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        tenant_ids = {str(o.tenant_id) for o in orders}
        # Registered tenant_id is only used for staff-facing (non-guest-targeted)
        # broadcasts, which guest connections never receive — any one is fine.
        await manager.connect(websocket, conn_id, "guest", next(iter(tenant_ids)))

        channels = await subscribe(list(tenant_ids), manager)
        logger.info("Guest WebSocket session started: orders=%s tenants=%s", [o.order_id for o in orders], tenant_ids)

        while True:
            data = await websocket.receive_json()
            if data.get("type") == "PING":
                await websocket.send_json({"type": "PONG"})

    except WebSocketDisconnect:
        logger.info("Guest WebSocket disconnected: token=%s", guest_token)
    except Exception as exc:
        logger.error("Guest WebSocket error for token %s: %s", guest_token, exc)
    finally:
        manager.disconnect(conn_id)
        if channels:
            await unsubscribe(channels)
        await db_gen.aclose()

import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Order
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.websocket_manager import manager
from app.services.ws_pubsub import subscribe_and_forward, subscribe_and_forward_many

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])
auth_service = AuthService()


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
    3. Starts a background task that subscribes to the tenant's Redis channel
       and forwards published events to all local connections for that tenant.
    4. Loops to handle incoming PING frames (and any future client messages).

    On disconnect the background task is cancelled, which triggers the
    pub/sub cleanup (unsubscribe + close).
    """
    db_gen = get_db()
    db: AsyncSession = await db_gen.__anext__()
    sub_task: asyncio.Task | None = None

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

        # ── Start Redis pub/sub forwarding task ───────────────────────────────
        sub_task = asyncio.create_task(
            subscribe_and_forward(tenant_id, manager, outlet_id)
        )
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
        if sub_task and not sub_task.done():
            sub_task.cancel()
            try:
                await sub_task
            except asyncio.CancelledError:
                pass
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
    sub_task: asyncio.Task | None = None
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

        sub_task = asyncio.create_task(subscribe_and_forward_many(list(tenant_ids), manager))
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
        if sub_task and not sub_task.done():
            sub_task.cancel()
            try:
                await sub_task
            except asyncio.CancelledError:
                pass
        await db_gen.aclose()

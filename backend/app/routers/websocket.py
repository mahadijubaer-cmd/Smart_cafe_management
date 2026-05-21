from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.websocket_manager import manager
import logging

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])
auth_service = AuthService()


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time updates"""
    db_gen = get_db()
    db: AsyncSession = await db_gen.__anext__()

    try:
        token_data = auth_service.decode_token(token)
        if token_data.user_id is None or str(token_data.user_id) != user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        result = await db.execute(select(User).where(User.user_id == token_data.user_id))
        user = result.scalar_one_or_none()
        if user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        role = user.role.value if hasattr(user.role, "value") else str(user.role)
    except Exception as e:
        logger.error(f"WebSocket auth failed: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, user_id, role)
    logger.info(f"WebSocket connected: {user_id} ({role})")
    
    try:
        while True:
            data = await websocket.receive_json()
            
            # Handle PING/PONG
            if data.get("type") == "PING":
                await websocket.send_json({"type": "PONG"})
            
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        logger.info(f"WebSocket disconnected: {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(user_id)
    finally:
        await db_gen.aclose()

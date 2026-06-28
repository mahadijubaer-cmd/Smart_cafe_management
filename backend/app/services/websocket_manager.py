from __future__ import annotations

import json
import logging
from typing import Dict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # {user_id: {"websocket": WebSocket, "role": str, "tenant_id": str}}
        self.active_connections: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str, role: str, tenant_id: str) -> None:
        await websocket.accept()
        self.active_connections[user_id] = {
            "websocket": websocket,
            "role": role,
            "tenant_id": tenant_id,
        }
        logger.info("WebSocket connected: user=%s role=%s tenant=%s", user_id, role, tenant_id)

    def disconnect(self, user_id: str) -> None:
        self.active_connections.pop(user_id, None)
        logger.info("WebSocket disconnected: user=%s", user_id)

    async def send_personal(self, user_id: str, message: dict) -> None:
        conn = self.active_connections.get(user_id)
        if conn:
            try:
                await conn["websocket"].send_json(message)
            except Exception as exc:
                logger.error("Error sending personal message to %s: %s", user_id, exc)
                self.disconnect(user_id)

    async def broadcast_to_tenant(self, tenant_id: str, event: dict) -> None:
        """Forward event to all local WebSocket connections for tenant_id.

        If the event contains "target_user_id", only that user receives it
        (used for personal events like ORDER_CONFIRMED / ORDER_READY).
        """
        target = event.get("target_user_id")
        disconnected: list[str] = []

        for user_id, conn in list(self.active_connections.items()):
            if conn["tenant_id"] != tenant_id:
                continue
            if target and user_id != str(target):
                continue
            try:
                await conn["websocket"].send_json(event)
            except Exception as exc:
                logger.error("Error forwarding event to %s: %s", user_id, exc)
                disconnected.append(user_id)

        for uid in disconnected:
            self.disconnect(uid)

    async def broadcast_to_role(self, role: str, message: dict) -> None:
        """Broadcast to all locally connected users with the given role."""
        disconnected: list[str] = []
        for user_id, conn in list(self.active_connections.items()):
            if conn["role"] == role:
                try:
                    await conn["websocket"].send_json(message)
                except Exception as exc:
                    logger.error("Error broadcasting to %s: %s", user_id, exc)
                    disconnected.append(user_id)
        for uid in disconnected:
            self.disconnect(uid)

    async def broadcast_all(self, message: dict) -> None:
        disconnected: list[str] = []
        for user_id, conn in list(self.active_connections.items()):
            try:
                await conn["websocket"].send_json(message)
            except Exception as exc:
                logger.error("Error broadcasting to %s: %s", user_id, exc)
                disconnected.append(user_id)
        for uid in disconnected:
            self.disconnect(uid)


# Global singleton — shared across all request handlers on this instance.
manager = ConnectionManager()

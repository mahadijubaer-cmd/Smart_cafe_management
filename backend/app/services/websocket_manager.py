from fastapi import WebSocket
from typing import Dict, List
import json
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # Structure: {user_id: {"websocket": WebSocket, "role": str}}
        self.active_connections: Dict[str, Dict] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str, role: str):
        """Accept a WebSocket connection"""
        await websocket.accept()
        self.active_connections[user_id] = {
            "websocket": websocket,
            "role": role
        }
        logger.info(f"Connection established for user {user_id} with role {role}")
    
    def disconnect(self, user_id: str):
        """Remove a WebSocket connection"""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            logger.info(f"Connection closed for user {user_id}")
    
    async def send_personal(self, user_id: str, message: dict):
        """Send message to a specific user"""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id]["websocket"].send_json(message)
            except Exception as e:
                logger.error(f"Error sending personal message to {user_id}: {e}")
                self.disconnect(user_id)
    
    async def broadcast_to_role(self, role: str, message: dict):
        """Broadcast message to all users with a specific role"""
        disconnected = []
        
        for user_id, connection in self.active_connections.items():
            if connection["role"] == role:
                try:
                    await connection["websocket"].send_json(message)
                except Exception as e:
                    logger.error(f"Error broadcasting to {user_id}: {e}")
                    disconnected.append(user_id)
        
        # Clean up disconnected users
        for user_id in disconnected:
            self.disconnect(user_id)
    
    async def broadcast_all(self, message: dict):
        """Broadcast message to all connected users"""
        disconnected = []
        
        for user_id, connection in self.active_connections.items():
            try:
                await connection["websocket"].send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to {user_id}: {e}")
                disconnected.append(user_id)
        
        # Clean up disconnected users
        for user_id in disconnected:
            self.disconnect(user_id)


# Global instance
manager = ConnectionManager()

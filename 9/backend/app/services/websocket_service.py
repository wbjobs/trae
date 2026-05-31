from fastapi import WebSocket
from typing import Dict, List, Set
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.device_subscribers: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, client_id: str = "default"):
        await websocket.accept()
        if client_id not in self.active_connections:
            self.active_connections[client_id] = []
        self.active_connections[client_id].append(websocket)
        logger.info(f"WebSocket connected: {client_id}")

    def disconnect(self, websocket: WebSocket, client_id: str = "default"):
        if client_id in self.active_connections:
            if websocket in self.active_connections[client_id]:
                self.active_connections[client_id].remove(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]
        
        for device_id, subscribers in self.device_subscribers.items():
            if websocket in subscribers:
                subscribers.remove(websocket)
        logger.info(f"WebSocket disconnected: {client_id}")

    async def subscribe_device(self, websocket: WebSocket, device_id: str):
        if device_id not in self.device_subscribers:
            self.device_subscribers[device_id] = set()
        self.device_subscribers[device_id].add(websocket)
        logger.info(f"Client subscribed to device: {device_id}")

    async def unsubscribe_device(self, websocket: WebSocket, device_id: str):
        if device_id in self.device_subscribers:
            if websocket in self.device_subscribers[device_id]:
                self.device_subscribers[device_id].remove(websocket)

    async def broadcast(self, message: dict):
        json_message = json.dumps(message, default=str)
        for client_id, connections in self.active_connections.items():
            for connection in connections:
                try:
                    await connection.send_text(json_message)
                except Exception as e:
                    logger.error(f"Error broadcasting to {client_id}: {e}")

    async def send_to_device(self, device_id: str, message: dict):
        if device_id in self.device_subscribers:
            json_message = json.dumps(message, default=str)
            for connection in self.device_subscribers[device_id]:
                try:
                    await connection.send_text(json_message)
                except Exception as e:
                    logger.error(f"Error sending to device {device_id}: {e}")

    async def send_to_client(self, client_id: str, message: dict):
        if client_id in self.active_connections:
            json_message = json.dumps(message, default=str)
            for connection in self.active_connections[client_id]:
                try:
                    await connection.send_text(json_message)
                except Exception as e:
                    logger.error(f"Error sending to client {client_id}: {e}")


manager = ConnectionManager()

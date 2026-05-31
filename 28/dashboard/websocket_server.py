import asyncio
import json
import logging
import threading
import time
from typing import Dict, Any, Set, Optional
from aiohttp import web, WSMsgType

logger = logging.getLogger(__name__)


class DashboardServer:
    def __init__(self, config: Dict, tag_configs: Dict[str, Dict]):
        self.config = config.get("dashboard", {})
        self.tag_configs = tag_configs
        self._app = web.Application()
        self._runner: Optional[web.AppRunner] = None
        self._site: Optional[web.TCPSite] = None
        self._clients: Set[web.WebSocketResponse] = set()
        self._current_values: Dict[str, Any] = {}
        self._value_history: Dict[str, list] = {}
        self._history_lock = threading.Lock()
        self._max_history_points = self.config.get("max_history_points", 100)
        self._running = False
        self._command_callback = None

        self._setup_routes()

    def _setup_routes(self):
        self._app.router.add_get("/ws", self._websocket_handler)
        self._app.router.add_get("/", self._serve_dashboard)
        self._app.router.add_static("/static", path="dashboard/static")

    async def _serve_dashboard(self, request):
        try:
            with open("dashboard/dashboard.html", "r", encoding="utf-8") as f:
                return web.Response(text=f.read(), content_type="text/html")
        except FileNotFoundError:
            return web.Response(text="Dashboard not found", status=404)

    async def _websocket_handler(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        logger.info("New dashboard client connected")
        self._clients.add(ws)

        try:
            await self._send_initial_state(ws)

            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_client_message(ws, msg.data)
                elif msg.type == WSMsgType.ERROR:
                    logger.error(f"WebSocket error: {ws.exception()}")
        except Exception as e:
            logger.error(f"WebSocket handler error: {e}")
        finally:
            self._clients.discard(ws)
            logger.info("Dashboard client disconnected")

        return ws

    async def _send_initial_state(self, ws: web.WebSocketResponse):
        with self._history_lock:
            history = {k: list(v) for k, v in self._value_history.items()}

        message = {
            "type": "initial",
            "values": self._current_values,
            "history": history,
            "tags": self.tag_configs,
        }
        await ws.send_json(message)

    async def _handle_client_message(self, ws: web.WebSocketResponse, data: str):
        try:
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "command":
                tag = message.get("tag")
                value = message.get("value")
                if tag and value is not None and self._command_callback:
                    self._command_callback(tag, value)
                    logger.info(f"Received command from dashboard: {tag} = {value}")

            elif msg_type == "ping":
                await ws.send_json({"type": "pong", "timestamp": time.time()})

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse client message: {e}")

    def on_value_changed(self, key: str, value: Any):
        self._current_values[key] = value

        with self._history_lock:
            if key not in self._value_history:
                self._value_history[key] = []
            self._value_history[key].append({
                "value": value,
                "timestamp": time.time()
            })
            if len(self._value_history[key]) > self._max_history_points:
                self._value_history[key].pop(0)

        asyncio.create_task(self._broadcast_update(key, value))

    async def _broadcast_update(self, key: str, value: Any):
        if not self._clients:
            return

        message = {
            "type": "update",
            "tag": key,
            "value": value,
            "timestamp": time.time()
        }

        for client in list(self._clients):
            try:
                if not client.closed:
                    await client.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send update to client: {e}")

    def register_command_callback(self, callback):
        self._command_callback = callback

    async def start(self):
        host = self.config.get("host", "0.0.0.0")
        port = self.config.get("port", 8080)

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, host, port)
        await self._site.start()
        self._running = True
        logger.info(f"Dashboard server started at http://{host}:{port}")

    async def stop(self):
        self._running = False

        for client in list(self._clients):
            try:
                await client.close()
            except Exception:
                pass
        self._clients.clear()

        if self._site:
            await self._site.stop()
        if self._runner:
            await self._runner.cleanup()

        logger.info("Dashboard server stopped")

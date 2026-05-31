"""
WebSocket服务器 - 处理与Unity前端的通信
"""

import asyncio
import json
import websockets
from websockets.server import WebSocketServerProtocol
from typing import Dict, Set
from .constants import UnitType
from .battle import BattleAction
from .game_manager import GameManager


class BattleServer:
    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        self.game_manager = GameManager()
        self.clients: Set[WebSocketServerProtocol] = set()
        self.client_battles: Dict[WebSocketServerProtocol, str] = {}

    async def handle_client(self, websocket: WebSocketServerProtocol):
        self.clients.add(websocket)
        print(f"新客户端连接: {websocket.remote_address}")

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    response = await self.handle_message(websocket, data)
                    if response:
                        await websocket.send(json.dumps(response, ensure_ascii=False))
                except json.JSONDecodeError:
                    await websocket.send(
                        json.dumps(
                            {"success": False, "message": "无效的JSON格式"},
                            ensure_ascii=False,
                        )
                    )
                except Exception as e:
                    print(f"处理消息时出错: {e}")
                    await websocket.send(
                        json.dumps(
                            {"success": False, "message": f"服务器错误: {str(e)}"},
                            ensure_ascii=False,
                        )
                    )
        except websockets.exceptions.ConnectionClosed:
            print(f"客户端断开连接: {websocket.remote_address}")
        finally:
            self.clients.remove(websocket)
            if websocket in self.client_battles:
                battle_id = self.client_battles[websocket]
                self.game_manager.remove_battle(battle_id)
                del self.client_battles[websocket]

    async def handle_message(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        message_type = data.get("type")

        handlers = {
            "create_battle": self.handle_create_battle,
            "start_battle": self.handle_start_battle,
            "execute_action": self.handle_execute_action,
            "end_turn": self.handle_end_turn,
            "get_state": self.handle_get_state,
            "get_valid_actions": self.handle_get_valid_actions,
            "execute_ai_turn": self.handle_execute_ai_turn,
            "get_statistics": self.handle_get_statistics,
            "get_battle_logs": self.handle_get_battle_logs,
            "ai_vs_ai": self.handle_ai_vs_ai,
        }

        handler = handlers.get(message_type)
        if handler:
            return await handler(websocket, data)
        else:
            return {"success": False, "message": f"未知的消息类型: {message_type}"}

    async def handle_create_battle(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        player_units_data = data.get("player_units", [])
        enemy_units_data = data.get("enemy_units", [])
        player_ai_type = data.get("player_ai_type")
        enemy_ai_type = data.get("enemy_ai_type", "minimax")
        ai_depth = data.get("ai_depth", 3)

        try:
            player_units = [UnitType(u) for u in player_units_data]
            enemy_units = [UnitType(u) for u in enemy_units_data]
        except ValueError as e:
            return {"success": False, "message": f"无效的单位类型: {e}"}

        if len(player_units) != 2 or len(enemy_units) != 2:
            return {"success": False, "message": "每队必须有2个单位"}

        battle = self.game_manager.create_battle(
            player_units, enemy_units, player_ai_type, enemy_ai_type, ai_depth
        )

        self.client_battles[websocket] = battle.id

        return {
            "success": True,
            "message": "战斗创建成功",
            "data": {"battle_id": battle.id, "state": battle.to_dict()},
        }

    async def handle_start_battle(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        battle_id = data.get("battle_id")
        battle = self.game_manager.get_battle(battle_id)

        if not battle:
            return {"success": False, "message": "战斗不存在"}

        battle.start()

        await self.broadcast_state(battle_id)

        return {"success": True, "message": "战斗开始", "data": battle.to_dict()}

    async def handle_execute_action(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        battle_id = data.get("battle_id")
        action_data = data.get("action")

        if not battle_id or not action_data:
            return {"success": False, "message": "缺少必要参数"}

        try:
            action = BattleAction.from_dict(action_data)
        except Exception as e:
            return {"success": False, "message": f"无效的行动数据: {e}"}

        result = self.game_manager.execute_player_action(battle_id, action)

        if result.get("success"):
            await self.broadcast_state(battle_id)

        return result

    async def handle_end_turn(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        battle_id = data.get("battle_id")

        if not battle_id:
            return {"success": False, "message": "缺少战斗ID"}

        result = self.game_manager.end_turn(battle_id)

        if result.get("success"):
            await self.broadcast_state(battle_id)

        return result

    async def handle_get_state(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        battle_id = data.get("battle_id")
        state = self.game_manager.get_battle_state(battle_id)

        if state:
            return {"success": True, "data": state}
        return {"success": False, "message": "战斗不存在"}

    async def handle_get_valid_actions(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        battle_id = data.get("battle_id")
        battle = self.game_manager.get_battle(battle_id)

        if not battle:
            return {"success": False, "message": "战斗不存在"}

        current_unit = battle.get_current_unit()
        if not current_unit:
            return {"success": False, "message": "没有可行动的单位"}

        valid_actions = battle.get_valid_actions(current_unit)
        actions_data = [action.to_dict() for action in valid_actions]

        return {
            "success": True,
            "data": {
                "unit_id": current_unit.id,
                "actions": actions_data,
            },
        }

    async def handle_execute_ai_turn(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        battle_id = data.get("battle_id")

        if not battle_id:
            return {"success": False, "message": "缺少战斗ID"}

        result = await self.game_manager.execute_ai_turn(battle_id)

        if result.get("success"):
            await self.broadcast_state(battle_id)

        return result

    async def handle_get_statistics(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        stats = self.game_manager.get_statistics()
        return {"success": True, "data": stats}

    async def handle_get_battle_logs(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        logs = self.game_manager.get_battle_logs()
        return {"success": True, "data": {"logs": logs}}

    async def handle_ai_vs_ai(
        self, websocket: WebSocketServerProtocol, data: Dict
    ) -> Dict:
        battle_id = data.get("battle_id")
        delay = data.get("delay", 0.5)

        if not battle_id:
            return {"success": False, "message": "缺少战斗ID"}

        battle = self.game_manager.get_battle(battle_id)
        if not battle:
            return {"success": False, "message": "战斗不存在"}

        async def callback(battle_obj, action_result):
            state = battle_obj.to_dict()
            response = {
                "type": "state_update",
                "data": {
                    "state": state,
                    "action_result": action_result,
                },
            }
            await websocket.send(json.dumps(response, ensure_ascii=False))
            await asyncio.sleep(0.01)

        result = await self.game_manager.run_ai_vs_ai_battle(
            battle_id, delay, callback
        )

        return result

    async def broadcast_state(self, battle_id: str):
        state = self.game_manager.get_battle_state(battle_id)
        if not state:
            return

        message = {"type": "state_update", "data": {"state": state}}
        message_json = json.dumps(message, ensure_ascii=False)

        for client in self.clients:
            if self.client_battles.get(client) == battle_id:
                try:
                    await client.send(message_json)
                except Exception:
                    pass

    async def start(self):
        print(f"WebSocket服务器启动在 {self.host}:{self.port}")
        async with websockets.serve(self.handle_client, self.host, self.port):
            await asyncio.Future()


def main():
    server = BattleServer()
    asyncio.run(server.start())


if __name__ == "__main__":
    main()

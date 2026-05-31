"""
游戏管理器 - 管理多个对战实例
"""

from typing import Dict, List, Optional
import uuid
import asyncio
from .constants import UnitType, Team
from .battle import Battle, BattleAction
from .ai import MinimaxAI, RandomAI, GreedyAI, DecisionTreeAI, AIFactory
from .logger import BattleLogger, Statistics


class GameManager:
    def __init__(self):
        self.battles: Dict[str, Battle] = {}
        self.ai_instances: Dict[str, object] = {}
        self.battle_ai_config: Dict[str, Dict] = {}
        self.logger = BattleLogger()
        self.stats = Statistics()

    def create_battle(
        self,
        player_units: List[UnitType],
        enemy_units: List[UnitType],
        player_ai_type: Optional[str] = None,
        enemy_ai_type: str = "minimax",
        ai_depth: int = 3,
    ) -> Battle:
        battle_id = str(uuid.uuid4())[:8]
        battle = Battle(battle_id, player_units, enemy_units)
        self.battles[battle_id] = battle

        if player_ai_type:
            self.ai_instances[f"{battle_id}_player"] = AIFactory.create_ai(
                player_ai_type, depth=ai_depth, max_depth=ai_depth
            )

        if enemy_ai_type:
            self.ai_instances[f"{battle_id}_enemy"] = AIFactory.create_ai(
                enemy_ai_type, depth=ai_depth, max_depth=ai_depth
            )

        self.battle_ai_config[battle_id] = {
            "player_ai_type": player_ai_type,
            "enemy_ai_type": enemy_ai_type,
        }

        return battle

    def get_battle(self, battle_id: str) -> Optional[Battle]:
        return self.battles.get(battle_id)

    def remove_battle(self, battle_id: str):
        if battle_id in self.battles:
            battle = self.battles[battle_id]
            if battle.state.value == "finished":
                ai_config = self.battle_ai_config.get(battle_id, {})
                self.stats.record_battle(
                    battle,
                    ai_config.get("player_ai_type", "human"),
                    ai_config.get("enemy_ai_type", "minimax"),
                )
                self.logger.save_battle_log(battle)

            del self.battles[battle_id]
            self.ai_instances.pop(f"{battle_id}_player", None)
            self.ai_instances.pop(f"{battle_id}_enemy", None)
            self.battle_ai_config.pop(battle_id, None)

    def execute_player_action(
        self, battle_id: str, action: BattleAction
    ) -> Dict:
        battle = self.get_battle(battle_id)
        if not battle:
            return {"success": False, "message": "战斗不存在"}

        if battle.state.value != "playing":
            return {"success": False, "message": "战斗未开始或已结束"}

        current_unit = battle.get_current_unit()
        if not current_unit or current_unit.team != Team.PLAYER:
            return {"success": False, "message": "不是玩家回合"}

        result = battle.execute_action(action)

        if result.success and battle.state.value == "playing":
            current_unit = battle.get_current_unit()
            if current_unit and current_unit.team == Team.ENEMY:
                pass

        return result.to_dict()

    def end_turn(self, battle_id: str) -> Dict:
        battle = self.get_battle(battle_id)
        if not battle:
            return {"success": False, "message": "战斗不存在"}

        result = battle.end_turn()

        if battle.state.value == "finished":
            ai_config = self.battle_ai_config.get(battle_id, {})
            self.stats.record_battle(
                battle,
                ai_config.get("player_ai_type", "human"),
                ai_config.get("enemy_ai_type", "minimax"),
            )
            self.logger.save_battle_log(battle)

        return result.to_dict()

    async def execute_ai_turn(self, battle_id: str) -> Dict:
        battle = self.get_battle(battle_id)
        if not battle or battle.state.value != "playing":
            return {"success": False, "message": "战斗不存在或未开始"}

        current_unit = battle.get_current_unit()
        if not current_unit:
            return {"success": False, "message": "没有可行动的单位"}

        team = current_unit.team
        ai_key = f"{battle_id}_{'player' if team == Team.PLAYER else 'enemy'}"
        ai = self.ai_instances.get(ai_key)

        if not ai:
            return {"success": False, "message": "该队伍没有AI配置"}

        ai_team = team

        if not current_unit.has_moved or not current_unit.has_acted:
            if hasattr(ai, "get_best_action"):
                action = ai.get_best_action(battle, ai_team)
            elif hasattr(ai, "search"):
                action = ai.search(battle, ai_team)
            else:
                action = None

            if action:
                result = battle.execute_action(action)
                if result.success:
                    return {
                        "success": True,
                        "action": action.to_dict(),
                        "result": result.to_dict(),
                    }

        end_result = battle.end_turn()

        if battle.state.value == "finished":
            ai_config = self.battle_ai_config.get(battle_id, {})
            self.stats.record_battle(
                battle,
                ai_config.get("player_ai_type", "human"),
                ai_config.get("enemy_ai_type", "minimax"),
            )
            self.logger.save_battle_log(battle)

        return {
            "success": True,
            "action": None,
            "result": end_result.to_dict(),
            "turn_ended": True,
        }

    async def run_ai_vs_ai_battle(
        self,
        battle_id: str,
        delay: float = 0.5,
        callback=None,
    ) -> Dict:
        battle = self.get_battle(battle_id)
        if not battle:
            return {"success": False, "message": "战斗不存在"}

        battle.start()

        while battle.state.value == "playing":
            result = await self.execute_ai_turn(battle_id)

            if callback:
                await callback(battle, result)

            if result.get("turn_ended"):
                await asyncio.sleep(delay)

        return {
            "success": True,
            "winner": battle.winner.value if battle.winner else None,
            "turns": battle.turn,
        }

    def get_battle_state(self, battle_id: str) -> Optional[Dict]:
        battle = self.get_battle(battle_id)
        if not battle:
            return None
        return battle.to_dict()

    def get_statistics(self) -> Dict:
        return self.stats.to_dict()

    def get_battle_logs(self) -> List[str]:
        return self.logger.get_all_battle_logs()

    def load_battle_log(self, filename: str) -> Dict:
        filepath = f"{self.logger.log_dir}/{filename}"
        return self.logger.load_battle_log(filepath)

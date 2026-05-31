"""
对战日志和统计系统
"""

from typing import Dict, List, Optional
from datetime import datetime
import json
import os
from .constants import Team
from .battle import Battle


class BattleLogger:
    def __init__(self, log_dir: str = "logs"):
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)

    def save_battle_log(self, battle: Battle) -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"battle_{battle.id}_{timestamp}.json"
        filepath = os.path.join(self.log_dir, filename)

        log_data = {
            "battle_id": battle.id,
            "timestamp": timestamp,
            "winner": battle.winner.value if battle.winner else None,
            "turns": battle.turn,
            "units": [u.to_dict() for u in battle.units],
            "terrain": battle.terrain.to_dict(),
            "battle_log": battle.battle_log,
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)

        return filepath

    def load_battle_log(self, filepath: str) -> Dict:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_all_battle_logs(self) -> List[str]:
        if not os.path.exists(self.log_dir):
            return []
        return sorted(
            [f for f in os.listdir(self.log_dir) if f.endswith(".json")],
            reverse=True,
        )


class Statistics:
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.stats_file = os.path.join(data_dir, "statistics.json")
        os.makedirs(data_dir, exist_ok=True)
        self._load_stats()

    def _load_stats(self):
        if os.path.exists(self.stats_file):
            with open(self.stats_file, "r", encoding="utf-8") as f:
                self.stats = json.load(f)
        else:
            self.stats = {
                "total_battles": 0,
                "player_wins": 0,
                "enemy_wins": 0,
                "ai_type_stats": {},
                "unit_stats": {},
                "average_turns": 0,
                "total_turns": 0,
            }

    def _save_stats(self):
        with open(self.stats_file, "w", encoding="utf-8") as f:
            json.dump(self.stats, f, ensure_ascii=False, indent=2)

    def record_battle(self, battle: Battle, player_ai_type: str = "human", enemy_ai_type: str = "minimax"):
        self.stats["total_battles"] += 1
        self.stats["total_turns"] += battle.turn
        self.stats["average_turns"] = (
            self.stats["total_turns"] / self.stats["total_battles"]
        )

        if battle.winner == Team.PLAYER:
            self.stats["player_wins"] += 1
        elif battle.winner == Team.ENEMY:
            self.stats["enemy_wins"] += 1

        ai_key = f"{player_ai_type}_vs_{enemy_ai_type}"
        if ai_key not in self.stats["ai_type_stats"]:
            self.stats["ai_type_stats"][ai_key] = {
                "total": 0,
                f"{player_ai_type}_wins": 0,
                f"{enemy_ai_type}_wins": 0,
            }
        self.stats["ai_type_stats"][ai_key]["total"] += 1
        if battle.winner == Team.PLAYER:
            self.stats["ai_type_stats"][ai_key][f"{player_ai_type}_wins"] += 1
        else:
            self.stats["ai_type_stats"][ai_key][f"{enemy_ai_type}_wins"] += 1

        for unit in battle.units:
            unit_type = unit.type.value
            if unit_type not in self.stats["unit_stats"]:
                self.stats["unit_stats"][unit_type] = {
                    "total_uses": 0,
                    "total_kills": 0,
                    "total_deaths": 0,
                    "total_damage_dealt": 0,
                    "total_damage_taken": 0,
                }
            self.stats["unit_stats"][unit_type]["total_uses"] += 1
            if not unit.is_alive:
                self.stats["unit_stats"][unit_type]["total_deaths"] += 1

        self._save_stats()

    def get_win_rate(self, team: Team) -> float:
        if self.stats["total_battles"] == 0:
            return 0.0
        wins = (
            self.stats["player_wins"]
            if team == Team.PLAYER
            else self.stats["enemy_wins"]
        )
        return wins / self.stats["total_battles"]

    def get_unit_stats(self, unit_type: str) -> Optional[Dict]:
        return self.stats["unit_stats"].get(unit_type)

    def get_ai_comparison(self, ai_type1: str, ai_type2: str) -> Optional[Dict]:
        ai_key = f"{ai_type1}_vs_{ai_type2}"
        return self.stats["ai_type_stats"].get(ai_key)

    def reset_stats(self):
        self.stats = {
            "total_battles": 0,
            "player_wins": 0,
            "enemy_wins": 0,
            "ai_type_stats": {},
            "unit_stats": {},
            "average_turns": 0,
            "total_turns": 0,
        }
        self._save_stats()

    def to_dict(self) -> Dict:
        return self.stats.copy()

"""
单位类定义
"""

from typing import Dict, List, Optional, Tuple
from .constants import UnitType, Team, UNIT_TEMPLATES, SKILLS, TERRAIN_BONUSES, TerrainType


class Unit:
    def __init__(self, unit_id: str, unit_type: UnitType, team: Team, position: Tuple[int, int]):
        self.id = unit_id
        self.type = unit_type
        self.team = team
        self.position = position

        template = UNIT_TEMPLATES[unit_type]
        self.name = template["name"]
        self.max_hp = template["max_hp"]
        self.hp = template["hp"]
        self.base_attack = template["attack"]
        self.base_defense = template["defense"]
        self.base_speed = template["speed"]
        self.attack_range = template["attack_range"]
        self.move_range = template["move_range"]
        self.skills: List[str] = template["skills"]

        self.skill_cooldowns: Dict[str, int] = {skill: 0 for skill in self.skills}
        self.effects: List[Dict] = []
        self.has_moved = False
        self.has_acted = False

    @property
    def is_alive(self) -> bool:
        return self.hp > 0

    def get_attack(self, terrain: TerrainType) -> float:
        attack = self.base_attack
        for effect in self.effects:
            if effect.get("type") == "defense_up":
                pass
        terrain_bonus = TERRAIN_BONUSES[terrain].get("attack", 0)
        attack *= (1 + terrain_bonus)
        return attack

    def get_defense(self, terrain: TerrainType) -> float:
        defense = self.base_defense
        for effect in self.effects:
            if effect.get("type") == "defense_up":
                defense *= (1 + effect.get("value", 0))
        terrain_bonus = TERRAIN_BONUSES[terrain].get("defense", 0)
        defense *= (1 + terrain_bonus)
        return defense

    def get_speed(self, terrain: TerrainType) -> float:
        speed = self.base_speed
        for effect in self.effects:
            if effect.get("type") == "slow":
                speed *= (1 - effect.get("value", 0))
        terrain_bonus = TERRAIN_BONUSES[terrain].get("speed", 0)
        speed *= (1 + terrain_bonus)
        return speed

    def take_damage(self, damage: float) -> float:
        actual_damage = max(1, damage)
        self.hp = max(0, self.hp - actual_damage)
        return actual_damage

    def heal(self, amount: float) -> float:
        actual_heal = min(amount, self.max_hp - self.hp)
        self.hp += actual_heal
        return actual_heal

    def add_effect(self, effect: Dict):
        self.effects.append(effect.copy())

    def update_effects(self):
        new_effects = []
        for effect in self.effects:
            effect["duration"] -= 1
            if effect["duration"] > 0:
                new_effects.append(effect)
        self.effects = new_effects

    def process_effects(self) -> Dict:
        result = {"poison_damage": 0}
        for effect in self.effects:
            if effect.get("type") == "poison":
                damage = self.take_damage(effect.get("value", 0))
                result["poison_damage"] += damage
        return result

    def reduce_cooldowns(self):
        for skill in self.skill_cooldowns:
            if self.skill_cooldowns[skill] > 0:
                self.skill_cooldowns[skill] -= 1

    def can_use_skill(self, skill_id: str) -> bool:
        return skill_id in self.skills and self.skill_cooldowns.get(skill_id, 0) == 0

    def use_skill(self, skill_id: str):
        if skill_id in SKILLS:
            self.skill_cooldowns[skill_id] = SKILLS[skill_id]["cooldown"]

    def reset_turn(self):
        self.has_moved = False
        self.has_acted = False

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type.value,
            "team": self.team.value,
            "name": self.name,
            "position": list(self.position),
            "hp": self.hp,
            "max_hp": self.max_hp,
            "attack": self.base_attack,
            "defense": self.base_defense,
            "speed": self.base_speed,
            "attack_range": self.attack_range,
            "move_range": self.move_range,
            "skills": self.skills,
            "skill_cooldowns": self.skill_cooldowns,
            "effects": self.effects,
            "is_alive": self.is_alive,
            "has_moved": self.has_moved,
            "has_acted": self.has_acted,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "Unit":
        unit = cls(
            unit_id=data["id"],
            unit_type=UnitType(data["type"]),
            team=Team(data["team"]),
            position=tuple(data["position"]),
        )
        unit.hp = data["hp"]
        unit.skill_cooldowns = data.get("skill_cooldowns", {})
        unit.effects = data.get("effects", [])
        unit.has_moved = data.get("has_moved", False)
        unit.has_acted = data.get("has_acted", False)
        return unit

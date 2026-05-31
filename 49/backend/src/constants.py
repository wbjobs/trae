"""
游戏常量定义
"""

from enum import Enum


class UnitType(Enum):
    WARRIOR = "warrior"
    MAGE = "mage"
    ARCHER = "archer"
    TANK = "tank"


class TerrainType(Enum):
    PLAIN = "plain"
    FOREST = "forest"
    MOUNTAIN = "mountain"
    WATER = "water"


class Team(Enum):
    PLAYER = "player"
    ENEMY = "enemy"


class GameState(Enum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"


class ActionType(Enum):
    ATTACK = "attack"
    SKILL = "skill"
    MOVE = "move"
    DEFEND = "defend"


TERRAIN_BONUSES = {
    TerrainType.PLAIN: {"attack": 0, "defense": 0, "speed": 0},
    TerrainType.FOREST: {"attack": 0, "defense": 0.2, "speed": -0.1},
    TerrainType.MOUNTAIN: {"attack": 0.1, "defense": 0.3, "speed": -0.2},
    TerrainType.WATER: {"attack": -0.1, "defense": -0.1, "speed": -0.3},
}


UNIT_TEMPLATES = {
    UnitType.WARRIOR: {
        "name": "战士",
        "hp": 120,
        "max_hp": 120,
        "attack": 25,
        "defense": 15,
        "speed": 10,
        "attack_range": 1,
        "move_range": 3,
        "skills": ["heavy_strike", "shield_bash"],
    },
    UnitType.MAGE: {
        "name": "法师",
        "hp": 80,
        "max_hp": 80,
        "attack": 35,
        "defense": 5,
        "speed": 8,
        "attack_range": 3,
        "move_range": 2,
        "skills": ["fireball", "heal"],
    },
    UnitType.ARCHER: {
        "name": "弓箭手",
        "hp": 90,
        "max_hp": 90,
        "attack": 30,
        "defense": 8,
        "speed": 12,
        "attack_range": 4,
        "move_range": 3,
        "skills": ["precise_shot", "poison_arrow"],
    },
    UnitType.TANK: {
        "name": "坦克",
        "hp": 180,
        "max_hp": 180,
        "attack": 15,
        "defense": 25,
        "speed": 6,
        "attack_range": 1,
        "move_range": 2,
        "skills": ["taunt", "fortify"],
    },
}


SKILLS = {
    "heavy_strike": {
        "name": "重击",
        "description": "造成150%攻击力的伤害",
        "cooldown": 2,
        "damage_multiplier": 1.5,
        "range": 1,
    },
    "shield_bash": {
        "name": "盾击",
        "description": "造成80%伤害并降低目标速度2回合",
        "cooldown": 3,
        "damage_multiplier": 0.8,
        "range": 1,
        "effect": {"type": "slow", "value": 0.3, "duration": 2},
    },
    "fireball": {
        "name": "火球术",
        "description": "造成200%攻击力的魔法伤害",
        "cooldown": 2,
        "damage_multiplier": 2.0,
        "range": 3,
    },
    "heal": {
        "name": "治疗",
        "description": "恢复目标50点生命值",
        "cooldown": 3,
        "heal_amount": 50,
        "range": 2,
    },
    "precise_shot": {
        "name": "精准射击",
        "description": "造成180%伤害,无视50%防御",
        "cooldown": 2,
        "damage_multiplier": 1.8,
        "armor_penetration": 0.5,
        "range": 5,
    },
    "poison_arrow": {
        "name": "毒箭",
        "description": "造成伤害并附加持续伤害3回合",
        "cooldown": 3,
        "damage_multiplier": 1.0,
        "range": 4,
        "effect": {"type": "poison", "value": 10, "duration": 3},
    },
    "taunt": {
        "name": "嘲讽",
        "description": "强制目标在2回合内只能攻击自己",
        "cooldown": 4,
        "range": 2,
        "effect": {"type": "taunt", "duration": 2},
    },
    "fortify": {
        "name": "坚守",
        "description": "提升自身50%防御,持续3回合",
        "cooldown": 3,
        "range": 0,
        "effect": {"type": "defense_up", "value": 0.5, "duration": 3},
    },
}


GRID_SIZE = 8
TEAM_SIZE = 2
MAX_TURNS = 50

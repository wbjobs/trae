"""
战斗系统核心逻辑
"""

from typing import Dict, List, Optional, Tuple
import copy
from .constants import (
    Team,
    GameState,
    ActionType,
    SKILLS,
    MAX_TURNS,
    TEAM_SIZE,
    GRID_SIZE,
    UnitType,
)
from .unit import Unit
from .terrain import TerrainGrid


class BattleAction:
    def __init__(
        self,
        action_type: ActionType,
        unit_id: str,
        target_id: Optional[str] = None,
        target_position: Optional[Tuple[int, int]] = None,
        skill_id: Optional[str] = None,
    ):
        self.action_type = action_type
        self.unit_id = unit_id
        self.target_id = target_id
        self.target_position = target_position
        self.skill_id = skill_id

    def to_dict(self) -> Dict:
        return {
            "action_type": self.action_type.value,
            "unit_id": self.unit_id,
            "target_id": self.target_id,
            "target_position": list(self.target_position) if self.target_position else None,
            "skill_id": self.skill_id,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "BattleAction":
        return cls(
            action_type=ActionType(data["action_type"]),
            unit_id=data["unit_id"],
            target_id=data.get("target_id"),
            target_position=tuple(data["target_position"]) if data.get("target_position") else None,
            skill_id=data.get("skill_id"),
        )


class BattleResult:
    def __init__(self, success: bool, message: str = "", data: Optional[Dict] = None):
        self.success = success
        self.message = message
        self.data = data or {}

    def to_dict(self) -> Dict:
        return {"success": self.success, "message": self.message, "data": self.data}


class Battle:
    def __init__(self, battle_id: str, player_units: List[UnitType], enemy_units: List[UnitType]):
        self.id = battle_id
        self.terrain = TerrainGrid(GRID_SIZE)
        self.units: List[Unit] = []
        self.turn = 1
        self.current_team = Team.PLAYER
        self.state = GameState.WAITING
        self.turn_order: List[str] = []
        self.current_unit_index = 0
        self.battle_log: List[Dict] = []
        self.winner: Optional[Team] = None

        self._initialize_units(player_units, enemy_units)

    def _initialize_units(self, player_units: List[UnitType], enemy_units: List[UnitType]):
        positions = [(0, 1), (0, 6), (7, 1), (7, 6)]

        for i, unit_type in enumerate(player_units[:TEAM_SIZE]):
            unit_id = f"player_{i}"
            pos = positions[i]
            while not self.terrain.is_walkable(pos):
                pos = (0, (pos[1] + 1) % GRID_SIZE)
            unit = Unit(unit_id, unit_type, Team.PLAYER, pos)
            self.units.append(unit)

        for i, unit_type in enumerate(enemy_units[:TEAM_SIZE]):
            unit_id = f"enemy_{i}"
            pos = positions[i + TEAM_SIZE]
            while not self.terrain.is_walkable(pos):
                pos = (7, (pos[1] + 1) % GRID_SIZE)
            unit = Unit(unit_id, unit_type, Team.ENEMY, pos)
            self.units.append(unit)

    def start(self):
        self.state = GameState.PLAYING
        self._determine_turn_order()
        self._log_event("battle_start", {"message": "战斗开始!"})

    def _determine_turn_order(self):
        alive_units = [u for u in self.units if u.is_alive]
        alive_units.sort(
            key=lambda u: u.get_speed(self.terrain.get_terrain(u.position)),
            reverse=True,
        )
        self.turn_order = [u.id for u in alive_units]
        self.current_unit_index = 0

    def get_current_unit(self) -> Optional[Unit]:
        if not self.turn_order:
            return None
        unit_id = self.turn_order[self.current_unit_index]
        return self._get_unit_by_id(unit_id)

    def _get_unit_by_id(self, unit_id: str) -> Optional[Unit]:
        for unit in self.units:
            if unit.id == unit_id:
                return unit
        return None

    def get_units_by_team(self, team: Team) -> List[Unit]:
        return [u for u in self.units if u.team == team and u.is_alive]

    def get_alive_units(self) -> List[Unit]:
        return [u for u in self.units if u.is_alive]

    def execute_action(self, action: BattleAction) -> BattleResult:
        if self.state != GameState.PLAYING:
            return BattleResult(False, "战斗未开始或已结束")

        current_unit = self.get_current_unit()
        if not current_unit or current_unit.id != action.unit_id:
            return BattleResult(False, "不是该单位的回合")

        if current_unit.team != self.current_team:
            return BattleResult(False, "不是你的回合")

        handler = {
            ActionType.MOVE: self._handle_move,
            ActionType.ATTACK: self._handle_attack,
            ActionType.SKILL: self._handle_skill,
            ActionType.DEFEND: self._handle_defend,
        }.get(action.action_type)

        if not handler:
            return BattleResult(False, "无效的行动类型")

        result = handler(current_unit, action)
        if result.success:
            self._check_battle_end()

        return result

    def _handle_move(self, unit: Unit, action: BattleAction) -> BattleResult:
        if unit.has_moved:
            return BattleResult(False, "该单位本回合已经移动过")

        if not action.target_position:
            return BattleResult(False, "需要指定目标位置")

        terrain = self.terrain
        distance = terrain.get_distance(unit.position, action.target_position)

        if distance > unit.move_range:
            return BattleResult(False, "目标位置超出移动范围")

        if not terrain.is_walkable(action.target_position):
            return BattleResult(False, "目标位置不可通行")

        for u in self.get_alive_units():
            if u.position == action.target_position:
                return BattleResult(False, "目标位置已有单位")

        old_position = unit.position
        unit.position = action.target_position
        unit.has_moved = True

        self._log_event(
            "move",
            {
                "unit_id": unit.id,
                "unit_name": unit.name,
                "from": list(old_position),
                "to": list(action.target_position),
            },
        )

        return BattleResult(True, "移动成功")

    def _handle_attack(self, unit: Unit, action: BattleAction) -> BattleResult:
        if unit.has_acted:
            return BattleResult(False, "该单位本回合已经行动过")

        if not action.target_id:
            return BattleResult(False, "需要指定目标单位")

        target = self._get_unit_by_id(action.target_id)
        if not target or not target.is_alive:
            return BattleResult(False, "目标单位不存在或已死亡")

        if target.team == unit.team:
            return BattleResult(False, "不能攻击友方单位")

        distance = self.terrain.get_distance(unit.position, target.position)
        if distance > unit.attack_range:
            return BattleResult(False, "目标超出攻击范围")

        attacker_terrain = self.terrain.get_terrain(unit.position)
        defender_terrain = self.terrain.get_terrain(target.position)

        attack = unit.get_attack(attacker_terrain)
        defense = target.get_defense(defender_terrain)

        damage = max(1, attack - defense * 0.5)
        actual_damage = target.take_damage(damage)

        unit.has_acted = True

        self._log_event(
            "attack",
            {
                "attacker_id": unit.id,
                "attacker_name": unit.name,
                "target_id": target.id,
                "target_name": target.name,
                "damage": actual_damage,
                "target_hp": target.hp,
                "target_alive": target.is_alive,
            },
        )

        return BattleResult(True, f"造成 {actual_damage:.0f} 点伤害", {"damage": actual_damage})

    def _handle_skill(self, unit: Unit, action: BattleAction) -> BattleResult:
        if unit.has_acted:
            return BattleResult(False, "该单位本回合已经行动过")

        if not action.skill_id:
            return BattleResult(False, "需要指定技能")

        if not unit.can_use_skill(action.skill_id):
            return BattleResult(False, "技能冷却中或不存在")

        skill = SKILLS.get(action.skill_id)
        if not skill:
            return BattleResult(False, "技能不存在")

        if action.target_id:
            target = self._get_unit_by_id(action.target_id)
            if not target or not target.is_alive:
                return BattleResult(False, "目标单位不存在或已死亡")

            distance = self.terrain.get_distance(unit.position, target.position)
            if distance > skill.get("range", 0):
                return BattleResult(False, "目标超出技能范围")
        elif action.target_position:
            distance = self.terrain.get_distance(unit.position, action.target_position)
            if distance > skill.get("range", 0):
                return BattleResult(False, "目标位置超出技能范围")
            target = None
        elif skill.get("range", 0) == 0:
            target = unit
        else:
            return BattleResult(False, "需要指定目标")

        result_data = {}
        message = ""

        if "heal_amount" in skill:
            if target:
                heal_amount = target.heal(skill["heal_amount"])
                message = f"恢复 {heal_amount:.0f} 点生命值"
                result_data["heal"] = heal_amount
        else:
            damage_multiplier = skill.get("damage_multiplier", 1.0)
            armor_penetration = skill.get("armor_penetration", 0)

            attacker_terrain = self.terrain.get_terrain(unit.position)
            attack = unit.get_attack(attacker_terrain) * damage_multiplier

            if target:
                defender_terrain = self.terrain.get_terrain(target.position)
                defense = target.get_defense(defender_terrain) * (1 - armor_penetration)
                damage = max(1, attack - defense * 0.5)
                actual_damage = target.take_damage(damage)
                message = f"造成 {actual_damage:.0f} 点伤害"
                result_data["damage"] = actual_damage

                if "effect" in skill:
                    effect = skill["effect"]
                    if effect.get("type") == "heal":
                        pass
                    else:
                        target.add_effect(effect)
                        result_data["effect_applied"] = True

        if "effect" in skill and skill.get("range", 0) == 0:
            unit.add_effect(skill["effect"])
            message = f"{skill['name']} 效果已应用"
            result_data["self_effect"] = True

        unit.use_skill(action.skill_id)
        unit.has_acted = True

        self._log_event(
            "skill",
            {
                "unit_id": unit.id,
                "unit_name": unit.name,
                "skill_id": action.skill_id,
                "skill_name": skill["name"],
                "target_id": target.id if target else None,
                "target_name": target.name if target else None,
                **result_data,
            },
        )

        return BattleResult(True, message, result_data)

    def _handle_defend(self, unit: Unit, action: BattleAction) -> BattleResult:
        if unit.has_acted:
            return BattleResult(False, "该单位本回合已经行动过")

        unit.add_effect({"type": "defense_up", "value": 0.5, "duration": 1})
        unit.has_acted = True

        self._log_event(
            "defend",
            {"unit_id": unit.id, "unit_name": unit.name},
        )

        return BattleResult(True, "进入防御姿态")

    def end_turn(self) -> BattleResult:
        if self.state != GameState.PLAYING:
            return BattleResult(False, "战斗未开始或已结束")

        current_unit = self.get_current_unit()
        if current_unit:
            current_unit.reset_turn()
            current_unit.reduce_cooldowns()
            current_unit.update_effects()
            effect_result = current_unit.process_effects()
            if effect_result["poison_damage"] > 0:
                self._log_event(
                    "effect_damage",
                    {
                        "unit_id": current_unit.id,
                        "unit_name": current_unit.name,
                        "damage": effect_result["poison_damage"],
                        "effect_type": "poison",
                    },
                )

        self.current_unit_index += 1

        if self.current_unit_index >= len(self.turn_order):
            self.turn += 1
            if self.turn > MAX_TURNS:
                self.state = GameState.FINISHED
                self.winner = self._determine_winner_by_hp()
                self._log_event(
                    "battle_end",
                    {"winner": self.winner.value, "reason": "回合数上限", "turn": self.turn},
                )
                return BattleResult(True, "战斗结束", {"winner": self.winner.value})

            self.current_team = (
                Team.ENEMY if self.current_team == Team.PLAYER else Team.PLAYER
            )
            self._determine_turn_order()
            self._log_event("new_turn", {"turn": self.turn, "team": self.current_team.value})
        else:
            next_unit = self.get_current_unit()
            if next_unit and next_unit.team != self.current_team:
                self.current_team = (
                    Team.ENEMY if self.current_team == Team.PLAYER else Team.PLAYER
                )

        self._check_battle_end()

        if self.state == GameState.PLAYING:
            next_unit = self.get_current_unit()
            if next_unit:
                return BattleResult(
                    True,
                    f"{next_unit.name} 的回合",
                    {"next_unit": next_unit.to_dict()},
                )

        return BattleResult(True, "回合结束")

    def _check_battle_end(self):
        player_alive = self.get_units_by_team(Team.PLAYER)
        enemy_alive = self.get_units_by_team(Team.ENEMY)

        if not player_alive:
            self.state = GameState.FINISHED
            self.winner = Team.ENEMY
            self._log_event("battle_end", {"winner": Team.ENEMY.value, "reason": "全歼"})
        elif not enemy_alive:
            self.state = GameState.FINISHED
            self.winner = Team.PLAYER
            self._log_event("battle_end", {"winner": Team.PLAYER.value, "reason": "全歼"})

    def _determine_winner_by_hp(self) -> Team:
        player_hp = sum(u.hp for u in self.get_units_by_team(Team.PLAYER))
        enemy_hp = sum(u.hp for u in self.get_units_by_team(Team.ENEMY))

        if player_hp >= enemy_hp:
            return Team.PLAYER
        return Team.ENEMY

    def _log_event(self, event_type: str, data: Dict):
        self.battle_log.append(
            {"turn": self.turn, "event_type": event_type, "data": data}
        )

    def get_valid_actions(self, unit: Unit) -> List[BattleAction]:
        actions = []

        if not unit.has_moved:
            for pos in self.terrain.get_reachable_positions(unit.position, unit.move_range):
                occupied = False
                for u in self.get_alive_units():
                    if u.position == pos:
                        occupied = True
                        break
                if not occupied:
                    actions.append(
                        BattleAction(ActionType.MOVE, unit.id, target_position=pos)
                    )

        if not unit.has_acted:
            actions.append(BattleAction(ActionType.DEFEND, unit.id))

            enemies = [u for u in self.get_alive_units() if u.team != unit.team]
            for enemy in enemies:
                distance = self.terrain.get_distance(unit.position, enemy.position)
                if distance <= unit.attack_range:
                    actions.append(
                        BattleAction(ActionType.ATTACK, unit.id, target_id=enemy.id)
                    )

            for skill_id in unit.skills:
                if unit.can_use_skill(skill_id):
                    skill = SKILLS[skill_id]
                    skill_range = skill.get("range", 0)

                    if skill_range == 0:
                        actions.append(
                            BattleAction(ActionType.SKILL, unit.id, skill_id=skill_id)
                        )
                    else:
                        if "heal_amount" in skill:
                            allies = [
                                u for u in self.get_alive_units() if u.team == unit.team
                            ]
                            for ally in allies:
                                distance = self.terrain.get_distance(
                                    unit.position, ally.position
                                )
                                if distance <= skill_range:
                                    actions.append(
                                        BattleAction(
                                            ActionType.SKILL,
                                            unit.id,
                                            target_id=ally.id,
                                            skill_id=skill_id,
                                        )
                                    )
                        else:
                            for enemy in enemies:
                                distance = self.terrain.get_distance(
                                    unit.position, enemy.position
                                )
                                if distance <= skill_range:
                                    actions.append(
                                        BattleAction(
                                            ActionType.SKILL,
                                            unit.id,
                                            target_id=enemy.id,
                                            skill_id=skill_id,
                                        )
                                    )

        return actions

    def clone(self) -> "Battle":
        return copy.deepcopy(self)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "state": self.state.value,
            "turn": self.turn,
            "current_team": self.current_team.value,
            "current_unit": self.get_current_unit().to_dict() if self.get_current_unit() else None,
            "units": [u.to_dict() for u in self.units],
            "terrain": self.terrain.to_dict(),
            "winner": self.winner.value if self.winner else None,
            "log_count": len(self.battle_log),
        }

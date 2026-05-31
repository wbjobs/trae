"""
AI逻辑模块 - 实现Minimax算法和决策树搜索
包含单位配合和技能组合策略
"""

from typing import Dict, List, Optional, Tuple
import random
import time
import math
from .constants import Team, ActionType, UnitType
from .battle import Battle, BattleAction
from .unit import Unit


class UnitRole:
    TANK = "tank"
    WARRIOR = "warrior"
    MAGE = "mage"
    ARCHER = "archer"


class Positioning:
    FRONT_ROW = "front"
    BACK_ROW = "back"


class SkillPriority:
    HIGH = 100
    MEDIUM = 50
    LOW = 10


class AIEvaluation:
    @staticmethod
    def get_unit_role(unit_type: UnitType) -> str:
        role_map = {
            UnitType.TANK: UnitRole.TANK,
            UnitType.WARRIOR: UnitRole.WARRIOR,
            UnitType.MAGE: UnitRole.MAGE,
            UnitType.ARCHER: UnitRole.ARCHER,
        }
        return role_map.get(unit_type, UnitRole.WARRIOR)

    @staticmethod
    def get_preferred_position(unit: Unit, enemy_units: List[Unit]) -> Positioning:
        role = AIEvaluation.get_unit_role(unit.type)
        
        if role in [UnitRole.TANK, UnitRole.WARRIOR]:
            return Positioning.FRONT_ROW
        else:
            return Positioning.BACK_ROW

    @staticmethod
    def calculate_position_score(
        unit: Unit, position: Tuple[int, int], 
        allies: List[Unit], enemies: List[Unit], battle: Battle
    ) -> float:
        score = 0.0
        role = AIEvaluation.get_unit_role(unit.type)
        terrain = battle.terrain.get_terrain(position)
        bonuses = battle.terrain.get_bonuses(position)

        score += bonuses.get("defense", 0) * 20
        score += bonuses.get("attack", 0) * 15
        score += bonuses.get("speed", 0) * 10

        if enemies:
            avg_enemy_x = sum(e.position[0] for e in enemies) / len(enemies)
            avg_enemy_y = sum(e.position[1] for e in enemies) / len(enemies)
            
            distance_to_enemy = battle.terrain.get_distance(
                position, (int(avg_enemy_x), int(avg_enemy_y))
            )

            if role == UnitRole.TANK:
                if distance_to_enemy <= 2:
                    score += 30
                elif distance_to_enemy <= 3:
                    score += 15
                score += (5 - distance_to_enemy) * 5
            elif role == UnitRole.WARRIOR:
                if distance_to_enemy <= unit.attack_range:
                    score += 25
                elif distance_to_enemy <= 3:
                    score += 10
            else:
                preferred_distance = unit.attack_range
                if distance_to_enemy == preferred_distance:
                    score += 30
                elif abs(distance_to_enemy - preferred_distance) <= 1:
                    score += 20
                elif distance_to_enemy < preferred_distance:
                    score -= (preferred_distance - distance_to_enemy) * 10

        if allies:
            for ally in allies:
                if ally.id == unit.id:
                    continue
                ally_distance = battle.terrain.get_distance(position, ally.position)
                
                ally_role = AIEvaluation.get_unit_role(ally.type)
                if role == UnitRole.TANK:
                    if ally_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                        if ally_distance <= 2:
                            score += 15
                elif role in [UnitRole.MAGE, UnitRole.ARCHER]:
                    if ally_role == UnitRole.TANK:
                        if ally_distance <= 2:
                            score += 20
                    elif ally_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                        if 2 <= ally_distance <= 4:
                            score += 5

        return score

    @staticmethod
    def evaluate_skill_effectiveness(
        battle: Battle, unit: Unit, skill_id: str, target: Optional[Unit],
        allies: List[Unit], enemies: List[Unit]
    ) -> float:
        score = 0.0
        from .constants import SKILLS
        
        skill = SKILLS.get(skill_id)
        if not skill:
            return score

        if "heal_amount" in skill and target:
            hp_ratio = target.hp / target.max_hp
            if hp_ratio < 0.2:
                score += 100
            elif hp_ratio < 0.4:
                score += 70
            elif hp_ratio < 0.6:
                score += 40
            else:
                score += 10
            
            target_role = AIEvaluation.get_unit_role(target.type)
            if target_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                score += 30
            elif target_role == UnitRole.TANK:
                score += 20

        if "damage_multiplier" in skill and target:
            base_damage = skill["damage_multiplier"]
            
            hp_ratio = target.hp / target.max_hp
            if hp_ratio < 0.2:
                score += 80
            elif hp_ratio < 0.4:
                score += 60
            elif hp_ratio < 0.6:
                score += 40
            
            target_role = AIEvaluation.get_unit_role(target.type)
            if target_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                score += 25
            
            if skill.get("armor_penetration", 0) > 0:
                if target_role == UnitRole.TANK:
                    score += 30

        if "effect" in skill:
            effect = skill["effect"]
            effect_type = effect.get("type")
            
            if effect_type == "slow" and target:
                target_role = AIEvaluation.get_unit_role(target.type)
                if target_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                    score += 40
                else:
                    score += 20
                
                for enemy in enemies:
                    if enemy.id != target.id:
                        if battle.terrain.get_distance(target.position, enemy.position) <= 2:
                            score += 10
            
            elif effect_type == "poison" and target:
                score += effect.get("value", 0) * effect.get("duration", 0) * 0.5
                hp_ratio = target.hp / target.max_hp
                if hp_ratio < 0.3:
                    score += 30
            
            elif effect_type == "taunt" and target:
                target_role = AIEvaluation.get_unit_role(target.type)
                if target_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                    score += 50
                
                for ally in allies:
                    if ally.id != unit.id:
                        ally_role = AIEvaluation.get_unit_role(ally.type)
                        if ally_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                            score += 15
            
            elif effect_type == "defense_up":
                if skill.get("range", 0) == 0:
                    unit_role = AIEvaluation.get_unit_role(unit.type)
                    if unit_role == UnitRole.TANK:
                        score += 40
                    
                    total_enemy_damage = sum(e.base_attack for e in enemies)
                    if total_enemy_damage > unit.base_defense * 2:
                        score += 30

        return score

    @staticmethod
    def evaluate_team_synergy(battle: Battle, ai_team: Team) -> float:
        score = 0.0
        player_units = battle.get_units_by_team(ai_team)
        enemy_units = battle.get_units_by_team(
            Team.ENEMY if ai_team == Team.PLAYER else Team.PLAYER
        )

        if len(player_units) < 2:
            return score

        has_tank = any(AIEvaluation.get_unit_role(u.type) == UnitRole.TANK for u in player_units)
        has_dps = any(AIEvaluation.get_unit_role(u.type) in [UnitRole.MAGE, UnitRole.ARCHER] for u in player_units)

        if has_tank and has_dps:
            score += 40

        for unit in player_units:
            role = AIEvaluation.get_unit_role(unit.type)
            unit_score = AIEvaluation.calculate_position_score(
                unit, unit.position, player_units, enemy_units, battle
            )
            score += unit_score * 0.3

        tanks = [u for u in player_units if AIEvaluation.get_unit_role(u.type) == UnitRole.TANK]
        dps = [u for u in player_units if AIEvaluation.get_unit_role(u.type) in [UnitRole.MAGE, UnitRole.ARCHER]]

        if tanks and dps:
            for tank in tanks:
                for d in dps:
                    distance = battle.terrain.get_distance(tank.position, d.position)
                    if distance <= 2:
                        score += 15
                    elif distance <= 3:
                        score += 5

        for enemy in enemy_units:
            nearest_ally = None
            min_distance = float("inf")
            
            for ally in player_units:
                dist = battle.terrain.get_distance(ally.position, enemy.position)
                if dist < min_distance:
                    min_distance = dist
                    nearest_ally = ally

            if nearest_ally:
                ally_role = AIEvaluation.get_unit_role(nearest_ally.type)
                enemy_role = AIEvaluation.get_unit_role(enemy.type)
                
                if ally_role == UnitRole.TANK:
                    if min_distance <= 1:
                        score += 10
                elif ally_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                    preferred_range = nearest_ally.attack_range
                    if min_distance == preferred_range:
                        score += 15
                    elif abs(min_distance - preferred_range) <= 1:
                        score += 5
                    elif min_distance < preferred_range - 1:
                        score -= 10

        return score

    @staticmethod
    def evaluate_state(battle: Battle, ai_team: Team) -> float:
        score = 0.0

        player_units = battle.get_units_by_team(ai_team)
        enemy_units = battle.get_units_by_team(
            Team.ENEMY if ai_team == Team.PLAYER else Team.PLAYER
        )

        if not player_units:
            return -1000
        if not enemy_units:
            return 1000

        player_total_hp = sum(u.hp for u in player_units)
        player_max_hp = sum(u.max_hp for u in player_units)
        enemy_total_hp = sum(u.hp for u in enemy_units)
        enemy_max_hp = sum(u.max_hp for u in enemy_units)

        score += (player_total_hp / player_max_hp) * 150
        score -= (enemy_total_hp / enemy_max_hp) * 150

        score += len(player_units) * 50
        score -= len(enemy_units) * 50

        for unit in player_units:
            unit_power = (unit.base_attack + unit.base_defense + unit.base_speed) / 3
            hp_ratio = unit.hp / unit.max_hp
            score += unit_power * hp_ratio * 2

            for effect in unit.effects:
                effect_type = effect.get("type")
                if effect_type == "defense_up":
                    score += 25 * effect.get("duration", 0)
                elif effect_type == "poison":
                    score -= 20 * effect.get("duration", 0)
                elif effect_type == "slow":
                    score -= 15 * effect.get("duration", 0)
                elif effect_type == "taunt":
                    score += 30 * effect.get("duration", 0)

        for unit in enemy_units:
            unit_power = (unit.base_attack + unit.base_defense + unit.base_speed) / 3
            hp_ratio = unit.hp / unit.max_hp
            score -= unit_power * hp_ratio * 2

            for effect in unit.effects:
                effect_type = effect.get("type")
                if effect_type == "poison":
                    score += 20 * effect.get("duration", 0)
                elif effect_type == "slow":
                    score += 15 * effect.get("duration", 0)

        score += AIEvaluation.evaluate_team_synergy(battle, ai_team)

        if battle.state.value == "finished" and battle.winner:
            if battle.winner == ai_team:
                score += 2000
            else:
                score -= 2000

        return score

    @staticmethod
    def evaluate_action(
        battle: Battle, action: BattleAction, ai_team: Team
    ) -> float:
        score = 0.0

        player_units = battle.get_units_by_team(ai_team)
        enemy_units = battle.get_units_by_team(
            Team.ENEMY if ai_team == Team.PLAYER else Team.PLAYER
        )

        current_unit = battle.get_current_unit()
        if not current_unit:
            return score

        if action.action_type == ActionType.ATTACK:
            score += 40
            target = None
            for u in battle.units:
                if u.id == action.target_id:
                    target = u
                    break
            if target:
                hp_ratio = target.hp / target.max_hp
                if hp_ratio < 0.2:
                    score += 100
                elif hp_ratio < 0.4:
                    score += 70
                elif hp_ratio < 0.6:
                    score += 40
                
                target_role = AIEvaluation.get_unit_role(target.type)
                if target_role in [UnitRole.MAGE, UnitRole.ARCHER]:
                    score += 30
                
                estimated_damage = max(1, current_unit.base_attack - target.base_defense * 0.5)
                if estimated_damage >= target.hp:
                    score += 80

        elif action.action_type == ActionType.SKILL:
            score += 50
            
            target = None
            if action.target_id:
                for u in battle.units:
                    if u.id == action.target_id:
                        target = u
                        break
            
            skill_score = AIEvaluation.evaluate_skill_effectiveness(
                battle, current_unit, action.skill_id, target,
                player_units, enemy_units
            )
            score += skill_score

            if action.skill_id == "heal":
                score += 30
            elif action.skill_id in ["fireball", "heavy_strike", "precise_shot"]:
                score += 20
            elif action.skill_id == "poison_arrow":
                score += 25
            elif action.skill_id == "taunt":
                score += 35
            elif action.skill_id == "fortify":
                score += 25
            elif action.skill_id == "shield_bash":
                score += 25

        elif action.action_type == ActionType.MOVE:
            if action.target_position:
                pos_score = AIEvaluation.calculate_position_score(
                    current_unit, tuple(action.target_position),
                    player_units, enemy_units, battle
                )
                score += pos_score
                
                old_score = AIEvaluation.calculate_position_score(
                    current_unit, current_unit.position,
                    player_units, enemy_units, battle
                )
                improvement = pos_score - old_score
                if improvement > 0:
                    score += improvement * 0.5

                for enemy in enemy_units:
                    new_distance = battle.terrain.get_distance(
                        tuple(action.target_position), enemy.position
                    )
                    old_distance = battle.terrain.get_distance(
                        current_unit.position, enemy.position
                    )
                    
                    role = AIEvaluation.get_unit_role(current_unit.type)
                    if role == UnitRole.TANK:
                        if new_distance < old_distance and new_distance <= 2:
                            score += 15
                    elif role in [UnitRole.MAGE, UnitRole.ARCHER]:
                        preferred = current_unit.attack_range
                        old_diff = abs(old_distance - preferred)
                        new_diff = abs(new_distance - preferred)
                        if new_diff < old_diff:
                            score += 20

        elif action.action_type == ActionType.DEFEND:
            hp_ratio = current_unit.hp / current_unit.max_hp
            if hp_ratio < 0.3:
                score += 80
            elif hp_ratio < 0.5:
                score += 50
            else:
                score += 10

            role = AIEvaluation.get_unit_role(current_unit.type)
            if role == UnitRole.TANK:
                score += 30

            total_enemy_threat = 0
            for enemy in enemy_units:
                dist = battle.terrain.get_distance(current_unit.position, enemy.position)
                if dist <= enemy.attack_range:
                    total_enemy_threat += enemy.base_attack
            
            if total_enemy_threat > current_unit.base_defense * 1.5:
                score += 40

        return score


class MinimaxAI:
    def __init__(self, depth: int = 3, use_heuristic: bool = True):
        self.depth = depth
        self.use_heuristic = use_heuristic
        self.max_time = 5.0

    def get_best_action(self, battle: Battle, ai_team: Team) -> Optional[BattleAction]:
        start_time = time.time()

        current_unit = battle.get_current_unit()
        if not current_unit or current_unit.team != ai_team:
            return None

        valid_actions = battle.get_valid_actions(current_unit)
        if not valid_actions:
            return None

        prioritized_actions = self._prioritize_actions(
            battle, valid_actions, current_unit, ai_team
        )

        best_action = None
        best_score = float("-inf")
        alpha = float("-inf")
        beta = float("inf")

        for action in prioritized_actions:
            if time.time() - start_time > self.max_time:
                break

            cloned_battle = battle.clone()
            result = cloned_battle.execute_action(action)

            if result.success:
                if not current_unit.has_acted or action.action_type == ActionType.MOVE:
                    score = self._minimax(
                        cloned_battle, self.depth - 1, alpha, beta, False, ai_team, start_time
                    )
                else:
                    cloned_battle.end_turn()
                    score = self._minimax(
                        cloned_battle, self.depth - 1, alpha, beta, False, ai_team, start_time
                    )

                if self.use_heuristic:
                    heuristic_score = AIEvaluation.evaluate_action(battle, action, ai_team)
                    score += heuristic_score * 0.4

                if score > best_score:
                    best_score = score
                    best_action = action
                    alpha = max(alpha, score)

        if best_action is None:
            best_action = random.choice(valid_actions)

        return best_action

    def _prioritize_actions(
        self, battle: Battle, actions: List[BattleAction], 
        current_unit: Unit, ai_team: Team
    ) -> List[BattleAction]:
        scored_actions = []
        for action in actions:
            score = AIEvaluation.evaluate_action(battle, action, ai_team)
            scored_actions.append((score, action))

        scored_actions.sort(key=lambda x: x[0], reverse=True)
        return [action for score, action in scored_actions]

    def _minimax(
        self,
        battle: Battle,
        depth: int,
        alpha: float,
        beta: float,
        is_maximizing: bool,
        ai_team: Team,
        start_time: float,
    ) -> float:
        if depth == 0 or battle.state.value == "finished" or time.time() - start_time > self.max_time:
            return AIEvaluation.evaluate_state(battle, ai_team)

        current_unit = battle.get_current_unit()
        if not current_unit:
            return AIEvaluation.evaluate_state(battle, ai_team)

        is_ai_turn = current_unit.team == ai_team
        actual_maximizing = is_ai_turn

        valid_actions = battle.get_valid_actions(current_unit)
        if not valid_actions:
            cloned_battle = battle.clone()
            cloned_battle.end_turn()
            return self._minimax(
                cloned_battle, depth - 1, alpha, beta, not actual_maximizing, ai_team, start_time
            )

        if actual_maximizing:
            max_score = float("-inf")
            for action in valid_actions:
                if time.time() - start_time > self.max_time:
                    break
                cloned_battle = battle.clone()
                result = cloned_battle.execute_action(action)
                if result.success:
                    if not current_unit.has_acted or action.action_type == ActionType.MOVE:
                        score = self._minimax(
                            cloned_battle, depth - 1, alpha, beta, False, ai_team, start_time
                        )
                    else:
                        cloned_battle.end_turn()
                        score = self._minimax(
                            cloned_battle, depth - 1, alpha, beta, False, ai_team, start_time
                        )
                    max_score = max(max_score, score)
                    alpha = max(alpha, score)
                    if beta <= alpha:
                        break
            return max_score
        else:
            min_score = float("inf")
            for action in valid_actions:
                if time.time() - start_time > self.max_time:
                    break
                cloned_battle = battle.clone()
                result = cloned_battle.execute_action(action)
                if result.success:
                    if not current_unit.has_acted or action.action_type == ActionType.MOVE:
                        score = self._minimax(
                            cloned_battle, depth - 1, alpha, beta, True, ai_team, start_time
                        )
                    else:
                        cloned_battle.end_turn()
                        score = self._minimax(
                            cloned_battle, depth - 1, alpha, beta, True, ai_team, start_time
                        )
                    min_score = min(min_score, score)
                    beta = min(beta, score)
                    if beta <= alpha:
                        break
            return min_score


class DecisionTreeNode:
    def __init__(self, battle: Battle, action: Optional[BattleAction] = None, parent=None):
        self.battle = battle
        self.action = action
        self.parent = parent
        self.children: List[DecisionTreeNode] = []
        self.score: Optional[float] = None
        self.visits = 0

    def expand(self, ai_team: Team) -> List["DecisionTreeNode"]:
        current_unit = self.battle.get_current_unit()
        if not current_unit:
            return []

        valid_actions = self.battle.get_valid_actions(current_unit)
        for action in valid_actions:
            cloned_battle = self.battle.clone()
            result = cloned_battle.execute_action(action)
            if result.success:
                child = DecisionTreeNode(cloned_battle, action, self)
                self.children.append(child)

        return self.children

    def get_best_child(self) -> Optional["DecisionTreeNode"]:
        if not self.children:
            return None
        return max(self.children, key=lambda c: c.score if c.score is not None else float("-inf"))


class DecisionTreeAI:
    def __init__(self, max_depth: int = 3):
        self.max_depth = max_depth

    def search(self, battle: Battle, ai_team: Team) -> Optional[BattleAction]:
        root = DecisionTreeNode(battle)
        self._build_tree(root, 0, ai_team)

        best_child = root.get_best_child()
        if best_child:
            return best_child.action
        return None

    def _build_tree(self, node: DecisionTreeNode, depth: int, ai_team: Team):
        if depth >= self.max_depth or node.battle.state.value == "finished":
            node.score = AIEvaluation.evaluate_state(node.battle, ai_team)
            return

        children = node.expand(ai_team)
        if not children:
            node.score = AIEvaluation.evaluate_state(node.battle, ai_team)
            return

        for child in children:
            self._build_tree(child, depth + 1, ai_team)

        current_unit = node.battle.get_current_unit()
        if current_unit and current_unit.team == ai_team:
            node.score = max(
                (child.score for child in children if child.score is not None),
                default=float("-inf"),
            )
        else:
            node.score = min(
                (child.score for child in children if child.score is not None),
                default=float("inf"),
            )


class RandomAI:
    @staticmethod
    def get_best_action(battle: Battle, ai_team: Team) -> Optional[BattleAction]:
        current_unit = battle.get_current_unit()
        if not current_unit or current_unit.team != ai_team:
            return None

        valid_actions = battle.get_valid_actions(current_unit)
        if not valid_actions:
            return None

        attack_actions = [a for a in valid_actions if a.action_type == ActionType.ATTACK]
        skill_actions = [a for a in valid_actions if a.action_type == ActionType.SKILL]
        move_actions = [a for a in valid_actions if a.action_type == ActionType.MOVE]
        defend_actions = [a for a in valid_actions if a.action_type == ActionType.DEFEND]

        if attack_actions and random.random() < 0.5:
            return random.choice(attack_actions)
        if skill_actions and random.random() < 0.7:
            return random.choice(skill_actions)
        if move_actions and random.random() < 0.8:
            return random.choice(move_actions)
        if defend_actions:
            return random.choice(defend_actions)

        return random.choice(valid_actions)


class GreedyAI:
    @staticmethod
    def get_best_action(battle: Battle, ai_team: Team) -> Optional[BattleAction]:
        current_unit = battle.get_current_unit()
        if not current_unit or current_unit.team != ai_team:
            return None

        valid_actions = battle.get_valid_actions(current_unit)
        if not valid_actions:
            return None

        best_action = None
        best_score = float("-inf")

        for action in valid_actions:
            score = AIEvaluation.evaluate_action(battle, action, ai_team)

            cloned_battle = battle.clone()
            result = cloned_battle.execute_action(action)
            if result.success:
                score += AIEvaluation.evaluate_state(cloned_battle, ai_team) * 0.5

            if score > best_score:
                best_score = score
                best_action = action

        return best_action


class Difficulty:
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class DifficultyConfig:
    CONFIGS = {
        Difficulty.EASY: {
            "minimax_depth": 1,
            "mcts_iterations": 50,
            "mcts_exploration": 0.5,
            "randomness": 0.3,
            "max_time": 2.0,
        },
        Difficulty.MEDIUM: {
            "minimax_depth": 3,
            "mcts_iterations": 200,
            "mcts_exploration": 1.0,
            "randomness": 0.1,
            "max_time": 5.0,
        },
        Difficulty.HARD: {
            "minimax_depth": 5,
            "mcts_iterations": 500,
            "mcts_exploration": 1.4,
            "randomness": 0.0,
            "max_time": 10.0,
        },
    }

    @staticmethod
    def get_config(difficulty: str) -> Dict:
        return DifficultyConfig.CONFIGS.get(difficulty, DifficultyConfig.CONFIGS[Difficulty.MEDIUM])


class MCTSNode:
    def __init__(self, battle: Battle, action: Optional[BattleAction] = None, parent=None):
        self.battle = battle
        self.action = action
        self.parent = parent
        self.children: List[MCTSNode] = []
        self.visits = 0
        self.wins = 0.0
        self.untried_actions: List[BattleAction] = []

        if parent is None:
            self._initialize_untried_actions()

    def _initialize_untried_actions(self):
        current_unit = self.battle.get_current_unit()
        if current_unit and self.battle.state.value == "playing":
            self.untried_actions = self.battle.get_valid_actions(current_unit)
            random.shuffle(self.untried_actions)

    @property
    def is_fully_expanded(self) -> bool:
        return len(self.untried_actions) == 0 and len(self.children) > 0

    @property
    def is_terminal(self) -> bool:
        return self.battle.state.value == "finished"

    def uct_value(self, exploration_param: float = 1.4) -> float:
        if self.visits == 0:
            return float("inf")

        exploitation = self.wins / self.visits
        if self.parent and self.parent.visits > 0:
            exploration = exploration_param * math.sqrt(
                math.log(self.parent.visits) / self.visits
            )
        else:
            exploration = 0

        return exploitation + exploration

    def select_best_child(self, exploration_param: float = 1.4) -> "MCTSNode":
        return max(
            self.children,
            key=lambda c: c.uct_value(exploration_param),
            default=None,
        )

    def expand(self) -> "MCTSNode":
        if not self.untried_actions:
            return None

        action = self.untried_actions.pop()
        cloned_battle = self.battle.clone()
        result = cloned_battle.execute_action(action)

        if result.success:
            child_node = MCTSNode(cloned_battle, action, self)
            self.children.append(child_node)
            return child_node

        return None

    def update(self, result: float):
        self.visits += 1
        self.wins += result


class MCTS:
    def __init__(
        self,
        iterations: int = 200,
        exploration_param: float = 1.4,
        max_time: float = 5.0,
        difficulty: str = Difficulty.MEDIUM,
    ):
        config = DifficultyConfig.get_config(difficulty)
        self.iterations = iterations if iterations > 0 else config["mcts_iterations"]
        self.exploration_param = exploration_param if exploration_param > 0 else config["mcts_exploration"]
        self.max_time = max_time if max_time > 0 else config["max_time"]
        self.randomness = config["randomness"]
        self.difficulty = difficulty

    def get_best_action(self, battle: Battle, ai_team: Team) -> Optional[BattleAction]:
        start_time = time.time()

        current_unit = battle.get_current_unit()
        if not current_unit or current_unit.team != ai_team:
            return None

        valid_actions = battle.get_valid_actions(current_unit)
        if not valid_actions:
            return None

        if len(valid_actions) == 1:
            return valid_actions[0]

        if random.random() < self.randomness:
            return random.choice(valid_actions)

        root = MCTSNode(battle.clone())

        for i in range(self.iterations):
            if time.time() - start_time > self.max_time:
                break

            node = self._select(root)
            if not node.is_terminal:
                expanded_node = self._expand(node)
                if expanded_node:
                    result = self._simulate(expanded_node, ai_team)
                    self._backpropagate(expanded_node, result)

        best_child = self._select_best_child(root)
        if best_child:
            return best_child.action

        return random.choice(valid_actions)

    def _select(self, node: MCTSNode) -> MCTSNode:
        while not node.is_terminal:
            if not node.is_fully_expanded:
                return node
            else:
                next_node = node.select_best_child(self.exploration_param)
                if next_node is None:
                    return node
                node = next_node
        return node

    def _expand(self, node: MCTSNode) -> Optional[MCTSNode]:
        if node.untried_actions:
            return node.expand()
        return None

    def _simulate(self, node: MCTSNode, ai_team: Team) -> float:
        battle = node.battle.clone()
        simulation_depth = 0
        max_simulation_depth = 20

        while battle.state.value == "playing" and simulation_depth < max_simulation_depth:
            current_unit = battle.get_current_unit()
            if not current_unit:
                break

            valid_actions = battle.get_valid_actions(current_unit)
            if not valid_actions:
                battle.end_turn()
                simulation_depth += 1
                continue

            action = self._simulation_policy(battle, valid_actions, current_unit)
            if action:
                result = battle.execute_action(action)
                if not result.success:
                    battle.end_turn()
            else:
                battle.end_turn()

            simulation_depth += 1

        return self._evaluate_simulation_result(battle, ai_team)

    def _simulation_policy(
        self, battle: Battle, valid_actions: List[BattleAction], current_unit: Unit
    ) -> Optional[BattleAction]:
        if random.random() < 0.3:
            return random.choice(valid_actions)

        scored_actions = []
        for action in valid_actions:
            score = AIEvaluation.evaluate_action(battle, action, current_unit.team)
            scored_actions.append((score, action))

        scored_actions.sort(key=lambda x: x[0], reverse=True)

        top_actions = scored_actions[: max(1, len(scored_actions) // 3)]
        if top_actions:
            return random.choice(top_actions)[1]

        return random.choice(valid_actions)

    def _evaluate_simulation_result(self, battle: Battle, ai_team: Team) -> float:
        if battle.state.value == "finished" and battle.winner:
            if battle.winner == ai_team:
                return 1.0
            else:
                return 0.0

        score = AIEvaluation.evaluate_state(battle, ai_team)
        normalized_score = 1 / (1 + math.exp(-score / 100))
        return normalized_score

    def _backpropagate(self, node: MCTSNode, result: float):
        current_node = node
        while current_node is not None:
            current_node.update(result)
            current_node = current_node.parent

    def _select_best_child(self, root: MCTSNode) -> Optional[MCTSNode]:
        if not root.children:
            return None

        if self.difficulty == Difficulty.EASY:
            return max(
                root.children,
                key=lambda c: c.wins / (c.visits + 1e-6) + random.random() * 0.1,
                default=None,
            )
        else:
            return max(
                root.children,
                key=lambda c: c.visits,
                default=None,
            )


class HybridAI:
    def __init__(
        self,
        difficulty: str = Difficulty.MEDIUM,
        use_mcts: bool = True,
        use_minimax: bool = True,
    ):
        self.difficulty = difficulty
        self.use_mcts = use_mcts
        self.use_minimax = use_minimax
        config = DifficultyConfig.get_config(difficulty)

        if use_minimax:
            self.minimax = MinimaxAI(depth=config["minimax_depth"])
        if use_mcts:
            self.mcts = MCTS(
                iterations=config["mcts_iterations"],
                exploration_param=config["mcts_exploration"],
                max_time=config["max_time"],
                difficulty=difficulty,
            )

    def get_best_action(self, battle: Battle, ai_team: Team) -> Optional[BattleAction]:
        actions = []
        scores = []

        if self.use_minimax:
            minimax_action = self.minimax.get_best_action(battle, ai_team)
            if minimax_action:
                actions.append(minimax_action)
                score = AIEvaluation.evaluate_action(battle, minimax_action, ai_team)
                scores.append(score)

        if self.use_mcts:
            mcts_action = self.mcts.get_best_action(battle, ai_team)
            if mcts_action:
                actions.append(mcts_action)
                score = AIEvaluation.evaluate_action(battle, mcts_action, ai_team)
                scores.append(score * 1.1)

        if not actions:
            return None

        if self.difficulty == Difficulty.HARD:
            best_idx = scores.index(max(scores))
            return actions[best_idx]
        elif self.difficulty == Difficulty.MEDIUM:
            weighted_scores = [s * random.uniform(0.8, 1.2) for s in scores]
            best_idx = weighted_scores.index(max(weighted_scores))
            return actions[best_idx]
        else:
            return random.choice(actions)


class AIFactory:
    @staticmethod
    def create_ai(ai_type: str, **kwargs) -> object:
        ai_types = {
            "random": RandomAI,
            "greedy": GreedyAI,
            "minimax": MinimaxAI,
            "decision_tree": DecisionTreeAI,
            "mcts": MCTS,
            "hybrid": HybridAI,
        }

        ai_class = ai_types.get(ai_type.lower())
        if not ai_class:
            raise ValueError(f"未知的AI类型: {ai_type}")

        return ai_class(**kwargs)

    @staticmethod
    def create_ai_with_difficulty(ai_type: str, difficulty: str, **kwargs) -> object:
        base_kwargs = kwargs.copy()

        if ai_type.lower() in ["minimax", "hybrid"]:
            config = DifficultyConfig.get_config(difficulty)
            base_kwargs.update({
                "depth": config["minimax_depth"],
                "difficulty": difficulty,
                **base_kwargs
            })

        return AIFactory.create_ai(ai_type, **base_kwargs)

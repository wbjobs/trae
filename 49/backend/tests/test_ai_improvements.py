"""
AI改进效果测试脚本
测试单位配合、技能组合和智能决策
"""

import sys
import os
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.constants import UnitType, Team, ActionType
from src.battle import Battle, BattleAction
from src.ai import (
    AIEvaluation,
    MinimaxAI,
    RandomAI,
    GreedyAI,
    AIFactory,
    UnitRole,
)


def test_unit_role_detection():
    print("=== 测试单位角色识别 ===")
    
    test_cases = [
        (UnitType.WARRIOR, UnitRole.WARRIOR),
        (UnitType.MAGE, UnitRole.MAGE),
        (UnitType.ARCHER, UnitRole.ARCHER),
        (UnitType.TANK, UnitRole.TANK),
    ]
    
    for unit_type, expected_role in test_cases:
        role = AIEvaluation.get_unit_role(unit_type)
        status = "✓" if role == expected_role else "✗"
        print(f"{status} {unit_type.value} -> {role} (期望: {expected_role})")
    
    print("✓ 单位角色识别测试完成\n")


def test_position_scoring():
    print("=== 测试位置评分系统 ===")
    
    battle = Battle(
        "test_pos",
        [UnitType.TANK, UnitType.MAGE],
        [UnitType.WARRIOR, UnitType.ARCHER],
    )
    
    player_units = battle.get_units_by_team(Team.PLAYER)
    enemy_units = battle.get_units_by_team(Team.ENEMY)
    
    tank = [u for u in player_units if AIEvaluation.get_unit_role(u.type) == UnitRole.TANK][0]
    mage = [u for u in player_units if AIEvaluation.get_unit_role(u.type) == UnitRole.MAGE][0]
    
    print(f"坦克初始位置: {tank.position}")
    print(f"法师初始位置: {mage.position}")
    
    front_position = (3, 3)
    back_position = (5, 5)
    
    tank_front_score = AIEvaluation.calculate_position_score(
        tank, front_position, player_units, enemy_units, battle
    )
    tank_back_score = AIEvaluation.calculate_position_score(
        tank, back_position, player_units, enemy_units, battle
    )
    
    mage_front_score = AIEvaluation.calculate_position_score(
        mage, front_position, player_units, enemy_units, battle
    )
    mage_back_score = AIEvaluation.calculate_position_score(
        mage, back_position, player_units, enemy_units, battle
    )
    
    print(f"坦克在前排评分: {tank_front_score:.1f}, 在后排评分: {tank_back_score:.1f}")
    print(f"法师在前排评分: {mage_front_score:.1f}, 在后排评分: {mage_back_score:.1f}")
    
    assert tank_front_score > tank_back_score, "坦克应该更偏好前排位置"
    assert mage_back_score > mage_front_score, "法师应该更偏好后排位置"
    
    print("✓ 位置评分系统测试通过\n")


def test_skill_effectiveness():
    print("=== 测试技能效果评估 ===")
    
    battle = Battle(
        "test_skill",
        [UnitType.MAGE, UnitType.WARRIOR],
        [UnitType.TANK, UnitType.ARCHER],
    )
    
    player_units = battle.get_units_by_team(Team.PLAYER)
    enemy_units = battle.get_units_by_team(Team.ENEMY)
    
    mage = [u for u in player_units if AIEvaluation.get_unit_role(u.type) == UnitRole.MAGE][0]
    tank_enemy = [u for u in enemy_units if AIEvaluation.get_unit_role(u.type) == UnitRole.TANK][0]
    archer_enemy = [u for u in enemy_units if AIEvaluation.get_unit_role(u.type) == UnitRole.ARCHER][0]
    
    fireball_on_tank = AIEvaluation.evaluate_skill_effectiveness(
        battle, mage, "fireball", tank_enemy, player_units, enemy_units
    )
    fireball_on_archer = AIEvaluation.evaluate_skill_effectiveness(
        battle, mage, "fireball", archer_enemy, player_units, enemy_units
    )
    
    print(f"火球术攻击坦克评分: {fireball_on_tank:.1f}")
    print(f"火球术攻击弓箭手评分: {fireball_on_archer:.1f}")
    
    archer_enemy.hp = 20
    fireball_on_low_hp = AIEvaluation.evaluate_skill_effectiveness(
        battle, mage, "fireball", archer_enemy, player_units, enemy_units
    )
    print(f"火球术攻击低血量弓箭手评分: {fireball_on_low_hp:.1f}")
    
    assert fireball_on_archer > fireball_on_tank, "应该优先攻击脆弱的输出单位"
    assert fireball_on_low_hp > fireball_on_archer, "应该优先攻击低血量单位"
    
    warrior = [u for u in player_units if AIEvaluation.get_unit_role(u.type) == UnitRole.WARRIOR][0]
    warrior.hp = 30
    heal_on_warrior = AIEvaluation.evaluate_skill_effectiveness(
        battle, mage, "heal", warrior, player_units, enemy_units
    )
    
    warrior.hp = warrior.max_hp
    heal_on_full_hp = AIEvaluation.evaluate_skill_effectiveness(
        battle, mage, "heal", warrior, player_units, enemy_units
    )
    
    print(f"治疗低血量战士评分: {heal_on_warrior:.1f}")
    print(f"治疗满血战士评分: {heal_on_full_hp:.1f}")
    
    assert heal_on_warrior > heal_on_full_hp, "应该优先治疗低血量友方"
    
    print("✓ 技能效果评估测试通过\n")


def test_team_synergy():
    print("=== 测试团队配合评估 ===")
    
    battle1 = Battle(
        "test_syn1",
        [UnitType.TANK, UnitType.MAGE],
        [UnitType.WARRIOR, UnitType.ARCHER],
    )
    
    battle2 = Battle(
        "test_syn2",
        [UnitType.WARRIOR, UnitType.WARRIOR],
        [UnitType.WARRIOR, UnitType.ARCHER],
    )
    
    synergy1 = AIEvaluation.evaluate_team_synergy(battle1, Team.PLAYER)
    synergy2 = AIEvaluation.evaluate_team_synergy(battle2, Team.PLAYER)
    
    print(f"坦克+法师组合配合评分: {synergy1:.1f}")
    print(f"双战士组合配合评分: {synergy2:.1f}")
    
    assert synergy1 > synergy2, "坦克+输出的组合应该比纯战士组合有更好的配合评分"
    
    print("✓ 团队配合评估测试通过\n")


def test_action_evaluation():
    print("=== 测试行动评估 ===")
    
    battle = Battle(
        "test_action",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.TANK, UnitType.ARCHER],
    )
    battle.start()
    
    current_unit = battle.get_current_unit()
    print(f"当前单位: {current_unit.name} ({current_unit.team.value})")
    
    valid_actions = battle.get_valid_actions(current_unit)
    print(f"有效行动数量: {len(valid_actions)}")
    
    scored_actions = []
    for action in valid_actions:
        score = AIEvaluation.evaluate_action(battle, action, Team.PLAYER)
        scored_actions.append((score, action))
    
    scored_actions.sort(key=lambda x: x[0], reverse=True)
    
    print("行动评分排序:")
    for i, (score, action) in enumerate(scored_actions[:5]):
        action_desc = action.action_type.value
        if action.target_id:
            target = battle._get_unit_by_id(action.target_id)
            if target:
                action_desc += f" -> {target.name}"
        if action.target_position:
            action_desc += f" -> {action.target_position}"
        if action.skill_id:
            action_desc += f" ({action.skill_id})"
        print(f"  {i+1}. {action_desc}: {score:.1f}")
    
    print("✓ 行动评估测试完成\n")


def test_ai_vs_ai_comparison():
    print("=== 测试AI vs AI对战对比 ===")
    
    num_battles = 5
    results = defaultdict(int)
    
    for i in range(num_battles):
        battle = Battle(
            f"comp_{i}",
            [UnitType.TANK, UnitType.MAGE],
            [UnitType.WARRIOR, UnitType.ARCHER],
        )
        battle.start()
        
        ai1 = AIFactory.create_ai("minimax", depth=2)
        ai2 = AIFactory.create_ai("random")
        
        turn_count = 0
        while battle.state.value == "playing" and turn_count < 100:
            current_unit = battle.get_current_unit()
            if not current_unit:
                break
            
            ai_team = current_unit.team
            ai = ai1 if ai_team == Team.PLAYER else ai2
            
            action = None
            if hasattr(ai, "get_best_action"):
                action = ai.get_best_action(battle, ai_team)
            elif hasattr(ai, "search"):
                action = ai.search(battle, ai_team)
            
            if action:
                result = battle.execute_action(action)
                if not result.success:
                    battle.end_turn()
            else:
                battle.end_turn()
            
            turn_count += 1
        
        winner = battle.winner.value if battle.winner else "draw"
        results[winner] += 1
        print(f"  对战 {i+1}: {winner} (回合数: {battle.turn})")
    
    print(f"\n结果统计:")
    for team, count in results.items():
        print(f"  {team}: {count} 胜 ({count/num_battles*100:.0f}%)")
    
    print("✓ AI对比测试完成\n")


def test_healing_priority():
    print("=== 测试治疗优先级 ===")
    
    battle = Battle(
        "test_heal",
        [UnitType.MAGE, UnitType.TANK],
        [UnitType.WARRIOR, UnitType.ARCHER],
    )
    
    player_units = battle.get_units_by_team(Team.PLAYER)
    enemy_units = battle.get_units_by_team(Team.ENEMY)
    
    mage = [u for u in player_units if u.type == UnitType.MAGE][0]
    tank = [u for u in player_units if u.type == UnitType.TANK][0]
    
    tank.hp = 50
    mage.hp = 70
    
    heal_tank = BattleAction(
        ActionType.SKILL, mage.id, target_id=tank.id, skill_id="heal"
    )
    heal_self = BattleAction(
        ActionType.SKILL, mage.id, target_id=mage.id, skill_id="heal"
    )
    
    score_tank = AIEvaluation.evaluate_action(battle, heal_tank, Team.PLAYER)
    score_self = AIEvaluation.evaluate_action(battle, heal_self, Team.PLAYER)
    
    print(f"坦克血量: {tank.hp}/{tank.max_hp}")
    print(f"法师血量: {mage.hp}/{mage.max_hp}")
    print(f"治疗坦克评分: {score_tank:.1f}")
    print(f"治疗自己评分: {score_self:.1f}")
    
    tank.hp = tank.max_hp
    mage.hp = 30
    
    score_tank_full = AIEvaluation.evaluate_action(battle, heal_tank, Team.PLAYER)
    score_self_low = AIEvaluation.evaluate_action(battle, heal_self, Team.PLAYER)
    
    print(f"\n坦克满血, 法师低血量时:")
    print(f"治疗坦克评分: {score_tank_full:.1f}")
    print(f"治疗自己评分: {score_self_low:.1f}")
    
    print("✓ 治疗优先级测试完成\n")


def test_positioning_vs_threat():
    print("=== 测试威胁评估下的定位决策 ===")
    
    battle = Battle(
        "test_threat",
        [UnitType.TANK, UnitType.MAGE],
        [UnitType.WARRIOR, UnitType.ARCHER],
    )
    
    player_units = battle.get_units_by_team(Team.PLAYER)
    enemy_units = battle.get_units_by_team(Team.ENEMY)
    
    mage = [u for u in player_units if u.type == UnitType.MAGE][0]
    
    safe_position = (7, 7)
    dangerous_position = (1, 1)
    
    safe_score = AIEvaluation.calculate_position_score(
        mage, safe_position, player_units, enemy_units, battle
    )
    dangerous_score = AIEvaluation.calculate_position_score(
        mage, dangerous_position, player_units, enemy_units, battle
    )
    
    print(f"法师安全位置评分: {safe_score:.1f}")
    print(f"法师危险位置评分: {dangerous_score:.1f}")
    
    assert safe_score > dangerous_score, "法师应该偏好远离敌人的安全位置"
    
    print("✓ 威胁评估定位测试通过\n")


def main():
    print("=" * 60)
    print("AI改进效果测试开始")
    print("=" * 60 + "\n")
    
    tests = [
        test_unit_role_detection,
        test_position_scoring,
        test_skill_effectiveness,
        test_team_synergy,
        test_action_evaluation,
        test_healing_priority,
        test_positioning_vs_threat,
        test_ai_vs_ai_comparison,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"✗ 测试失败: {e}\n")
            failed += 1
        except Exception as e:
            print(f"✗ 测试异常: {e}\n")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("=" * 60)
    print(f"测试完成: {passed} 通过, {failed} 失败")
    print("=" * 60)
    
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

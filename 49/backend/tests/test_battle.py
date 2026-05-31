"""
战斗系统测试脚本
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.constants import UnitType, Team, ActionType
from src.battle import Battle, BattleAction
from src.ai import MinimaxAI, RandomAI, GreedyAI, AIFactory


def test_battle_creation():
    print("=== 测试战斗创建 ===")
    battle = Battle(
        "test_001",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    print(f"战斗ID: {battle.id}")
    print(f"单位数量: {len(battle.units)}")
    for unit in battle.units:
        print(f"  {unit.name} ({unit.team.value}) - HP: {unit.hp}/{unit.max_hp}")
    print("✓ 战斗创建成功\n")
    return battle


def test_turn_order():
    print("=== 测试回合顺序 ===")
    battle = Battle(
        "test_002",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    battle.start()
    print(f"回合顺序: {[battle._get_unit_by_id(uid).name for uid in battle.turn_order]}")
    print(f"当前单位: {battle.get_current_unit().name}")
    print("✓ 回合顺序确定成功\n")
    return battle


def test_attack():
    print("=== 测试攻击 ===")
    battle = Battle(
        "test_003",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    battle.start()

    current_unit = battle.get_current_unit()
    enemies = [u for u in battle.get_alive_units() if u.team != current_unit.team]

    if enemies:
        target = enemies[0]
        old_hp = target.hp
        action = BattleAction(ActionType.ATTACK, current_unit.id, target_id=target.id)
        result = battle.execute_action(action)
        print(f"攻击者: {current_unit.name}")
        print(f"目标: {target.name}")
        print(f"攻击前HP: {old_hp}")
        print(f"攻击后HP: {target.hp}")
        print(f"结果: {result.message}")
        print("✓ 攻击测试成功\n")


def test_ai():
    print("=== 测试AI ===")
    battle = Battle(
        "test_004",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    battle.start()

    ai = AIFactory.create_ai("minimax", depth=2)

    for _ in range(5):
        if battle.state.value != "playing":
            break

        current_unit = battle.get_current_unit()
        if not current_unit:
            break

        ai_team = current_unit.team
        action = ai.get_best_action(battle, ai_team)

        if action:
            result = battle.execute_action(action)
            print(f"回合 {battle.turn}: {current_unit.name} ({ai_team.value}) 执行 {action.action_type.value}")
            if not result.success:
                print(f"  失败: {result.message}")
        else:
            battle.end_turn()

    print(f"战斗状态: {battle.state.value}")
    if battle.winner:
        print(f"胜利者: {battle.winner.value}")
    print(f"当前回合: {battle.turn}")
    print("✓ AI测试成功\n")


def test_ai_vs_ai():
    print("=== 测试AI vs AI ===")

    ai1 = AIFactory.create_ai("minimax", depth=2)
    ai2 = AIFactory.create_ai("random")

    battle = Battle(
        "test_005",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    battle.start()

    turn_count = 0
    while battle.state.value == "playing" and turn_count < 50:
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

    print(f"战斗结束! 回合数: {battle.turn}")
    print(f"胜利者: {battle.winner.value if battle.winner else '无'}")
    for unit in battle.units:
        status = "存活" if unit.is_alive else "死亡"
        print(f"  {unit.name} ({unit.team.value}): {status}, HP: {unit.hp}/{unit.max_hp}")
    print(f"日志数量: {len(battle.battle_log)}")
    print("✓ AI vs AI 测试成功\n")


def test_terrain_effects():
    print("=== 测试地形效果 ===")
    battle = Battle(
        "test_006",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )

    for unit in battle.units:
        terrain = battle.terrain.get_terrain(unit.position)
        bonuses = battle.terrain.get_bonuses(unit.position)
        attack = unit.get_attack(terrain)
        defense = unit.get_defense(terrain)
        speed = unit.get_speed(terrain)
        print(f"{unit.name} 位置: {unit.position}, 地形: {terrain.value}")
        print(f"  属性: 攻击={attack:.1f}, 防御={defense:.1f}, 速度={speed:.1f}")
        print(f"  加成: 攻击+{bonuses['attack']*100:.0f}%, 防御+{bonuses['defense']*100:.0f}%, 速度{bonuses['speed']*100:.0f}%")

    print("✓ 地形效果测试成功\n")


def main():
    print("开始运行战斗系统测试...\n")

    try:
        test_battle_creation()
        test_turn_order()
        test_attack()
        test_terrain_effects()
        test_ai()
        test_ai_vs_ai()
        print("所有测试通过! ✓")
    except Exception as e:
        print(f"测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

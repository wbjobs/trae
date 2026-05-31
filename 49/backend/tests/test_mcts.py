"""
MCTS算法和难度系统测试脚本
"""

import sys
import os
from collections import defaultdict
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.constants import UnitType, Team, ActionType
from src.battle import Battle, BattleAction
from src.ai import (
    MCTS,
    MCTSNode,
    Difficulty,
    DifficultyConfig,
    HybridAI,
    AIFactory,
    MinimaxAI,
    RandomAI,
    AIEvaluation,
)


def test_difficulty_config():
    print("=== 测试难度配置 ===")
    
    for difficulty in [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]:
        config = DifficultyConfig.get_config(difficulty)
        print(f"\n{difficulty.upper()} 难度:")
        print(f"  Minimax深度: {config['minimax_depth']}")
        print(f"  MCTS迭代次数: {config['mcts_iterations']}")
        print(f"  MCTS探索系数: {config['mcts_exploration']}")
        print(f"  随机性: {config['randomness']}")
        print(f"  最大思考时间: {config['max_time']}s")
    
    print("\n✓ 难度配置测试完成\n")


def test_mcts_node():
    print("=== 测试MCTS节点 ===")
    
    battle = Battle(
        "test_mcts_node",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    battle.start()
    
    node = MCTSNode(battle.clone())
    
    print(f"根节点未尝试行动数: {len(node.untried_actions)}")
    print(f"根节点子节点数: {len(node.children)}")
    print(f"根节点访问次数: {node.visits}")
    
    child = node.expand()
    if child:
        print(f"扩展后子节点数: {len(node.children)}")
        print(f"剩余未尝试行动数: {len(node.untried_actions)}")
        print(f"子节点行动类型: {child.action.action_type.value}")
    
    print("✓ MCTS节点测试完成\n")


def test_uct_value():
    print("=== 测试UCT值计算 ===")
    
    battle = Battle(
        "test_uct",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    battle.start()
    
    parent = MCTSNode(battle.clone())
    parent.visits = 100
    
    child1 = MCTSNode(battle.clone(), None, parent)
    child1.visits = 50
    child1.wins = 30
    
    child2 = MCTSNode(battle.clone(), None, parent)
    child2.visits = 10
    child2.wins = 8
    
    child3 = MCTSNode(battle.clone(), None, parent)
    child3.visits = 0
    child3.wins = 0
    
    uct1 = child1.uct_value(1.4)
    uct2 = child2.uct_value(1.4)
    uct3 = child3.uct_value(1.4)
    
    print(f"节点1: 访问50次, 胜率30/50, UCT = {uct1:.4f}")
    print(f"节点2: 访问10次, 胜率8/10, UCT = {uct2:.4f}")
    print(f"节点3: 未访问, UCT = {uct3}")
    
    assert uct3 == float("inf"), "未访问节点的UCT值应为无穷大"
    
    print("✓ UCT值计算测试完成\n")


def test_mcts_single_decision():
    print("=== 测试MCTS单次决策 ===")
    
    battle = Battle(
        "test_mcts_single",
        [UnitType.WARRIOR, UnitType.MAGE],
        [UnitType.ARCHER, UnitType.TANK],
    )
    battle.start()
    
    mcts = MCTS(iterations=100, max_time=5.0)
    
    start_time = time.time()
    action = mcts.get_best_action(battle, Team.PLAYER)
    elapsed = time.time() - start_time
    
    if action:
        print(f"决策时间: {elapsed:.2f}s")
        print(f"选择行动: {action.action_type.value}")
        if action.target_id:
            target = battle._get_unit_by_id(action.target_id)
            if target:
                print(f"目标: {target.name}")
        if action.skill_id:
            print(f"技能: {action.skill_id}")
        if action.target_position:
            print(f"位置: {action.target_position}")
    else:
        print("未找到有效行动")
    
    print("✓ MCTS单次决策测试完成\n")


def test_difficulty_comparison():
    print("=== 测试不同难度的AI表现 ===")
    
    results = defaultdict(lambda: defaultdict(int))
    num_battles = 3
    
    difficulties = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]
    
    for difficulty in difficulties:
        print(f"\n测试 {difficulty.upper()} 难度 AI vs RandomAI:")
        
        for i in range(num_battles):
            battle = Battle(
                f"diff_{difficulty}_{i}",
                [UnitType.TANK, UnitType.MAGE],
                [UnitType.WARRIOR, UnitType.ARCHER],
            )
            battle.start()
            
            mcts_ai = MCTS(
                difficulty=difficulty,
                max_time=DifficultyConfig.get_config(difficulty)["max_time"],
            )
            random_ai = RandomAI()
            
            turn_count = 0
            while battle.state.value == "playing" and turn_count < 100:
                current_unit = battle.get_current_unit()
                if not current_unit:
                    break
                
                ai_team = current_unit.team
                ai = mcts_ai if ai_team == Team.PLAYER else random_ai
                
                action = ai.get_best_action(battle, ai_team)
                
                if action:
                    result = battle.execute_action(action)
                    if not result.success:
                        battle.end_turn()
                else:
                    battle.end_turn()
                
                turn_count += 1
            
            winner = battle.winner.value if battle.winner else "draw"
            results[difficulty][winner] += 1
            print(f"  对战 {i+1}: {winner} (回合: {battle.turn})")
    
    print("\n结果统计:")
    for difficulty in difficulties:
        wins = results[difficulty]["player"]
        total = sum(results[difficulty].values())
        win_rate = wins / total * 100 if total > 0 else 0
        print(f"  {difficulty.upper()}: {wins}胜/{total}场 ({win_rate:.0f}%胜率)")
    
    print("\n✓ 难度对比测试完成\n")


def test_hybrid_ai():
    print("=== 测试HybridAI ===")
    
    battle = Battle(
        "test_hybrid",
        [UnitType.TANK, UnitType.MAGE],
        [UnitType.WARRIOR, UnitType.ARCHER],
    )
    battle.start()
    
    hybrid = HybridAI(difficulty=Difficulty.MEDIUM, use_mcts=True, use_minimax=True)
    
    print("HybridAI组件:")
    print(f"  使用Minimax: {hybrid.use_minimax}")
    print(f"  使用MCTS: {hybrid.use_mcts}")
    print(f"  难度: {hybrid.difficulty}")
    
    start_time = time.time()
    action = hybrid.get_best_action(battle, Team.PLAYER)
    elapsed = time.time() - start_time
    
    if action:
        print(f"\n决策时间: {elapsed:.2f}s")
        print(f"选择行动: {action.action_type.value}")
        if action.skill_id:
            print(f"技能: {action.skill_id}")
    
    print("\n✓ HybridAI测试完成\n")


def test_ai_factory_with_difficulty():
    print("=== 测试AI工厂与难度集成 ===")
    
    test_cases = [
        ("minimax", Difficulty.EASY),
        ("minimax", Difficulty.MEDIUM),
        ("mcts", Difficulty.MEDIUM),
        ("hybrid", Difficulty.HARD),
    ]
    
    for ai_type, difficulty in test_cases:
        try:
            ai = AIFactory.create_ai_with_difficulty(ai_type, difficulty)
            print(f"✓ 成功创建 {ai_type.upper()} AI ({difficulty.upper()}难度)")
            print(f"  类型: {type(ai).__name__}")
        except Exception as e:
            print(f"✗ 创建 {ai_type} AI 失败: {e}")
    
    print("\n✓ AI工厂测试完成\n")


def test_action_quality():
    print("=== 测试AI决策质量 ===")
    
    battle = Battle(
        "test_quality",
        [UnitType.MAGE, UnitType.TANK],
        [UnitType.WARRIOR, UnitType.ARCHER],
    )
    battle.start()
    
    for unit in battle.units:
        if unit.team == Team.ENEMY and unit.type == UnitType.ARCHER:
            unit.hp = 15
            print(f"设置弓箭手血量为 {unit.hp}/{unit.max_hp}")
    
    current_unit = battle.get_current_unit()
    print(f"\n当前单位: {current_unit.name}")
    
    valid_actions = battle.get_valid_actions(current_unit)
    print(f"有效行动数: {len(valid_actions)}")
    
    print("\n各AI的选择:")
    
    random_ai = RandomAI()
    random_action = random_ai.get_best_action(battle, Team.PLAYER)
    print(f"  RandomAI: {random_action.action_type.value if random_action else 'None'}")
    
    minimax = MinimaxAI(depth=2)
    minimax_action = minimax.get_best_action(battle, Team.PLAYER)
    print(f"  Minimax: {minimax_action.action_type.value if minimax_action else 'None'}")
    
    mcts = MCTS(iterations=150, max_time=3.0)
    start = time.time()
    mcts_action = mcts.get_best_action(battle, Team.PLAYER)
    mcts_time = time.time() - start
    print(f"  MCTS: {mcts_action.action_type.value if mcts_action else 'None'} (耗时 {mcts_time:.2f}s)")
    
    for action in valid_actions:
        if action.target_id:
            target = battle._get_unit_by_id(action.target_id)
            if target and target.hp < 20:
                print(f"\n发现低血量目标: {target.name} (HP: {target.hp})")
                for ai_name, ai_action in [("Minimax", minimax_action), ("MCTS", mcts_action)]:
                    if ai_action and ai_action.target_id == target.id:
                        print(f"  ✓ {ai_name} 选择了攻击低血量目标!")
    
    print("\n✓ 决策质量测试完成\n")


def test_mcts_vs_minimax():
    print("=== 测试MCTS vs Minimax对战 ===")
    
    results = defaultdict(int)
    num_battles = 3
    
    for i in range(num_battles):
        battle = Battle(
            f"mcts_vs_minimax_{i}",
            [UnitType.TANK, UnitType.MAGE],
            [UnitType.WARRIOR, UnitType.ARCHER],
        )
        battle.start()
        
        mcts_ai = MCTS(iterations=200, max_time=5.0)
        minimax_ai = MinimaxAI(depth=3)
        
        turn_count = 0
        while battle.state.value == "playing" and turn_count < 100:
            current_unit = battle.get_current_unit()
            if not current_unit:
                break
            
            ai_team = current_unit.team
            ai = mcts_ai if ai_team == Team.PLAYER else minimax_ai
            
            if hasattr(ai, "get_best_action"):
                action = ai.get_best_action(battle, ai_team)
            else:
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
        print(f"  对战 {i+1}: MCTS ({'player' if winner == 'player' else 'enemy'}) vs Minimax ({'player' if winner != 'player' else 'enemy'}) -> {winner} 胜 (回合: {battle.turn})")
    
    print(f"\n结果: MCTS {results.get('player', 0)}胜, Minimax {results.get('enemy', 0)}胜, 平局 {results.get('draw', 0)}")
    print("✓ MCTS vs Minimax测试完成\n")


def main():
    print("=" * 60)
    print("MCTS算法和难度系统测试开始")
    print("=" * 60 + "\n")
    
    tests = [
        test_difficulty_config,
        test_mcts_node,
        test_uct_value,
        test_mcts_single_decision,
        test_hybrid_ai,
        test_ai_factory_with_difficulty,
        test_action_quality,
        test_difficulty_comparison,
        test_mcts_vs_minimax,
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

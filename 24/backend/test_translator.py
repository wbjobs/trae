from cypher_parser import CypherParser
from cte_generator import CTEGenerator
from explain_parser import ExplainPlanParser


def run_test(name, cypher, test_explain=True):
    print(f"\n{'='*70}")
    print(f"测试: {name}")
    print(f"{'='*70}")
    print(f"\n输入 Cypher:\n{cypher}\n")

    try:
        parser = CypherParser(cypher)
        parsed = parser.parse()
        print(f"✓ 解析成功")

        generator = CTEGenerator(parsed)
        sql = generator.generate()
        print(f"✓ SQL 生成成功\n")
        print(f"生成 SQL:\n{sql}\n")

        union_count = sql.upper().count('UNION')
        print(f"统计: UNION 数量 = {union_count}")
        if 'CYCLE' in sql:
            print("✓ 已启用循环检测 (CYCLE)")
        if 'visited' in sql:
            print("✓ 已启用访问记录 (防止回头路)")
        if 'SEARCH DEPTH FIRST' in sql:
            print("✓ 已启用深度优先搜索")
        if 'e.to_node <> ALL' in sql:
            print("✓ 已启用节点去重过滤")

        if test_explain:
            print()
            explain_parser = ExplainPlanParser(sql=sql)
            plan = explain_parser.parse()
            print(f"✓ 执行计划生成成功")
            print(f"  - 节点数量: {plan['summary']['node_count']}")
            print(f"  - 全表扫描: {plan['summary']['full_scan_count']} 个")
            print(f"  - 预估总成本: {plan['summary']['total_cost']}")
            if plan['has_full_scan']:
                print("  ⚠️ 检测到全表扫描，存在性能优化空间")

        return True
    except Exception as e:
        print(f"✗ 错误: {e}\n")
        return False


def main():
    tests = [
        (
            "1. 节点属性过滤",
            "MATCH (n:Person {name: 'Alice'}) RETURN n.name, n.age"
        ),
        (
            "2. 关系类型过滤",
            "MATCH (n:Person)-[r:KNOWS]->(m:Person) RETURN n.name, m.name"
        ),
        (
            "3. 变长路径匹配 (1..3) - 优化后",
            "MATCH (n:Person)-[r:KNOWS*1..3]->(m:Person) RETURN n.name AS start, m.name AS end"
        ),
        (
            "4. 多关系类型过滤",
            "MATCH (n)-[r:KNOWS|FOLLOWS]->(m) WHERE n.age > 25 RETURN n.name, m.name"
        ),
        (
            "5. 固定深度变长路径 (*2)",
            "MATCH (n:Person)-[r:KNOWS*2]->(m) RETURN n.name, m.name"
        ),
        (
            "6. 无长度上限路径 (*) - 自动限制100",
            "MATCH (n:Person)-[r:KNOWS*]->(m) RETURN n.name, m.name"
        ),
        (
            "7. 复杂混合过滤",
            "MATCH (n:Person {city: 'Beijing'})-[r:KNOWS*1..5]->(m:User) WHERE m.age < 30 RETURN n.name, m.name"
        ),
        (
            "8. 最小深度过滤 (*3..)",
            "MATCH (n)-[r:KNOWS*3..]->(m) RETURN n.name, m.name"
        )
    ]

    print("\n" + "="*70)
    print("Cypher to PostgreSQL 翻译器 - 优化后测试")
    print("="*70)

    passed = 0
    for name, cypher in tests:
        if run_test(name, cypher):
            passed += 1

    print(f"\n{'='*70}")
    print(f"测试结果: {passed}/{len(tests)} 通过")
    print(f"{'='*70}\n")

    print("\n优化说明:")
    print("-" * 70)
    print("1. 循环检测: 使用 CYCLE 子句自动检测和避免循环路径")
    print("2. 访问记录: 使用 visited 数组防止走回头路 (e.to_node <> ALL(pc.visited))")
    print("3. 深度优先: SEARCH DEPTH FIRST 优化搜索顺序")
    print("4. 深度限制: 无上限时自动限制为 100 层防止爆炸")
    print("5. 早期过滤: 在 CTE 内部而非外部过滤，减少中间结果")
    print("6. 双向搜索: 提供 _generate_bidirectional_variable_length_query 选项")
    print("-" * 70)


if __name__ == "__main__":
    main()

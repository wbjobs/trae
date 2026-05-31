from plc_editor import parse_source, generate_code, PLCSimulator

test_cases = [
    {
        "name": "简单串联 (2个触点)",
        "code": """
LD X0
AND X1
OUT Y0
"""
    },
    {
        "name": "深层串联 (5个触点)",
        "code": """
LD X0
AND X1
AND X2
AND X3
AND X4
OUT Y0
"""
    },
    {
        "name": "混合逻辑: AND + OR",
        "code": """
LD X0
AND X1
OR X2
OUT Y0
"""
    },
    {
        "name": "常闭触点串联",
        "code": """
LDI X0
ANI X1
ANI X2
OUT Y0
"""
    },
    {
        "name": "多个梯级，每个梯级多个触点",
        "code": """
LD X0
AND X1
AND X2
OUT Y0

LD X3
AND X4
AND X5
AND X6
OUT Y1

LDI X7
OUT Y2
"""
    },
    {
        "name": "极端测试: 10个串联触点",
        "code": """
LD X0
AND X1
AND X2
AND X3
AND X4
AND X5
AND X6
AND X7
AND X8
AND X9
OUT Y0
"""
    }
]

print("=" * 80)
print("测试深层串联触点的解析和代码生成")
print("=" * 80)

for i, test in enumerate(test_cases, 1):
    print(f"\n{'=' * 80}")
    print(f"测试 {i}: {test['name']}")
    print("=" * 80)
    print("\n输入代码:")
    print(test['code'].strip())
    
    try:
        ast = parse_source(test['code'])
        
        print(f"\n✓ 解析成功!")
        print(f"  梯级数: {len(ast.rungs)}")
        
        for j, rung in enumerate(ast.rungs):
            print(f"  梯级 {j+1}: {rung}")
        
        python_code = generate_code(ast)
        
        print(f"\n✓ 代码生成成功!")
        print(f"\n生成的Python代码:")
        print("-" * 60)
        print(python_code)
        print("-" * 60)
        
        sim = PLCSimulator(ast)
        print(f"\n✓ 模拟器创建成功!")
        print(f"  输入变量: {list(sim.get_all_inputs().keys())}")
        print(f"  输出变量: {list(sim.get_all_outputs().keys())}")
        
        inputs = sim.get_all_inputs()
        for name in inputs:
            sim.set_input(name, True)
        
        result = sim.scan()
        print(f"\n✓ 单次扫描成功!")
        print(f"  扫描周期: {result.cycle_number}")
        print(f"  所有输入=True 时的输出: {result.outputs}")
        
    except Exception as e:
        print(f"\n✗ 错误: {e}")
        import traceback
        traceback.print_exc()

print("\n" + "=" * 80)
print("所有测试完成!")
print("=" * 80)

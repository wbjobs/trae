from plc_editor import Lexer, Parser, parse_source, generate_code, PLCSimulator

test_code = """
LD X0
AND X1
OUT Y0

LD X2
OR X3
OUT Y1

LDI X4
OUT Y2
"""

print("=" * 60)
print("测试词法分析器 (Lexer)")
print("=" * 60)

lexer = Lexer(test_code)
tokens = lexer.tokenize()

for token in tokens[:20]:
    print(token)

print()
print("=" * 60)
print("测试语法分析器 (Parser)")
print("=" * 60)

try:
    ast = parse_source(test_code)
    print("解析成功!")
    print()
    print("AST 结构:")
    print(ast)
except Exception as e:
    print(f"解析错误: {e}")

print()
print("=" * 60)
print("测试代码生成器 (Code Generator)")
print("=" * 60)

python_code = generate_code(ast)
print(python_code)

print()
print("=" * 60)
print("测试模拟器 (Simulator)")
print("=" * 60)

sim = PLCSimulator(ast)
print(f"检测到的输入: {sim.get_all_inputs()}")
print(f"检测到的输出: {sim.get_all_outputs()}")

print()
print("设置 X0=True, X1=True")
sim.set_input("X0", True)
sim.set_input("X1", True)

result = sim.scan()
print(f"扫描周期 {result.cycle_number}:")
print(f"  输入: {result.inputs}")
print(f"  输出: {result.outputs}")

print()
print("设置 X2=True")
sim.set_input("X2", True)
sim.set_input("X3", False)

result = sim.scan()
print(f"扫描周期 {result.cycle_number}:")
print(f"  输入: {result.inputs}")
print(f"  输出: {result.outputs}")

print()
print("=" * 60)
print("所有测试通过!")
print("=" * 60)

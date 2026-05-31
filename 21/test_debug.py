from plc_editor import parse_source, generate_code

test_code = """
; 测试用例: 与门逻辑
LD X0
AND X1
AND X2
OUT Y0

; 测试用例: 或门逻辑
LD X3
OR X4
OUT Y1

; 测试用例: 常闭触点
LDI X5
OUT Y2
"""

print("=" * 70)
print("测试代码生成器 - 调试模式")
print("=" * 70)

try:
    ast = parse_source(test_code)
    print("✓ 解析成功!")
    
    python_code = generate_code(ast)
    print("✓ 代码生成成功!")
    
    output_path = "output.py"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(python_code)
    
    print(f"✓ 代码已保存到: {output_path}")
    print()
    print("=" * 70)
    print("使用方法:")
    print("=" * 70)
    print("1. 安装依赖: pip install websockets")
    print("2. 运行: python output.py")
    print("3. 浏览器会自动打开调试面板")
    print()
    print("调试面板功能:")
    print("  • 实时显示输入/输出状态")
    print("  • 波形图展示最近100个周期")
    print("  • ▶ 运行 - 连续扫描")
    print("  • ⏸ 暂停 - 暂停执行")
    print("  • ⏭ 单步 - 执行一个周期")
    print("  • 🔄 重置 - 清空历史")
    print("  • 点击输入框可切换 ON/OFF")
    print("=" * 70)
    
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"\n错误: {e}")

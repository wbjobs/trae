"""
快速验证脚本 - 验证 H3 边界漏点修复是否正确
安装依赖后运行: python quick_verify.py
"""
import sys
import os

try:
    import h3
    import numpy as np
    import pandas as pd
except ImportError as e:
    print(f"缺少依赖: {e}")
    print("请先运行: pip install -r requirements.txt")
    sys.exit(1)

from app.h3_aggregator import H3Aggregator
from app.data_loader import DataLoader


def test_all():
    print("="*60)
    print("H3 边界漏点修复 - 快速验证")
    print("="*60)
    
    tests_passed = 0
    tests_failed = 0
    
    # Test 1: 动态 bbox padding
    print("\n[1/6] 测试动态 bbox padding...")
    try:
        padding_res6 = DataLoader._get_h3_hexagon_diameter(6)
        padding_res8 = DataLoader._get_h3_hexagon_diameter(8)
        padding_res10 = DataLoader._get_h3_hexagon_diameter(10)
        
        assert padding_res6 > padding_res8 > padding_res10, "Padding 应该随分辨率增大而减小"
        assert padding_res8 > 0.001 and padding_res8 < 0.02, f"Res 8 padding 应该在合理范围, 当前: {padding_res8}"
        
        print(f"  ✓ Res 6 padding: {padding_res6:.6f}° (~{padding_res6*111000:.0f}m)")
        print(f"  ✓ Res 8 padding: {padding_res8:.6f}° (~{padding_res8*111000:.0f}m)")
        print(f"  ✓ Res 10 padding: {padding_res10:.6f}° (~{padding_res10*111000:.0f}m)")
        tests_passed += 1
    except AssertionError as e:
        print(f"  ✗ 失败: {e}")
        tests_failed += 1
    
    # Test 2: bbox 扩展
    print("\n[2/6] 测试 bbox 扩展...")
    try:
        base_bbox = [121.45, 31.21, 121.50, 31.25]
        expanded = DataLoader._expand_bbox(base_bbox, 8)
        
        assert expanded[0] < base_bbox[0], "西边界应该向西扩展"
        assert expanded[1] < base_bbox[1], "南边界应该向南扩展"
        assert expanded[2] > base_bbox[2], "东边界应该向东扩展"
        assert expanded[3] > base_bbox[3], "北边界应该向北扩展"
        
        print(f"  ✓ 原始 bbox: {base_bbox}")
        print(f"  ✓ 扩展 bbox: {[round(x, 6) for x in expanded]}")
        tests_passed += 1
    except AssertionError as e:
        print(f"  ✗ 失败: {e}")
        tests_failed += 1
    
    # Test 3: H3 多边形相交检测
    print("\n[3/6] 测试 H3 多边形相交检测...")
    try:
        center_lat, center_lng = 31.2304, 121.4737
        hex_res8 = h3.geo_to_h3(center_lat, center_lng, 8)
        
        boundary = h3.h3_to_geo_boundary(hex_res8)
        lats = [p[0] for p in boundary]
        lngs = [p[1] for p in boundary]
        hex_bbox = [min(lngs), min(lats), max(lngs), max(lats)]
        
        children = list(h3.h3_to_children(hex_res8, 9))
        intersecting = [
            c for c in children
            if H3Aggregator._hex_intersects_bbox(c, hex_bbox)
        ]
        
        assert len(intersecting) == len(children), f"应该包含所有子六边形，期望 {len(children)}, 实际 {len(intersecting)}"
        
        print(f"  ✓ 父六边形: {hex_res8}")
        print(f"  ✓ 子六边形数量: {len(children)}")
        print(f"  ✓ 相交检测通过: {len(intersecting)}/{len(children)}")
        tests_passed += 1
    except AssertionError as e:
        print(f"  ✗ 失败: {e}")
        tests_failed += 1
    
    # Test 4: 创建测试数据并聚合
    print("\n[4/6] 测试数据聚合...")
    try:
        np.random.seed(42)
        center_lat, center_lng = 31.2304, 121.4737
        n = 10000
        
        df = pd.DataFrame({
            "lat": center_lat + np.random.normal(0, 0.02, n),
            "lng": center_lng + np.random.normal(0, 0.02, n),
            "speed": np.random.uniform(10, 80, n)
        })
        
        hex_res8, total_8, _ = H3Aggregator.aggregate_numpy(df, 8)
        hex_res9, total_9, _ = H3Aggregator.aggregate_numpy(df, 9)
        
        assert total_8 == n, f"Res 8 应该包含所有点，期望 {n}, 实际 {total_8}"
        assert total_9 == n, f"Res 9 应该包含所有点，期望 {n}, 实际 {total_9}"
        assert len(hex_res8) > 0, "Res 8 聚合结果不应为空"
        assert len(hex_res9) > len(hex_res8), "Res 9 六边形数量应该多于 Res 8"
        
        print(f"  ✓ 生成测试数据: {n} 个点")
        print(f"  ✓ Res 8 聚合: {len(hex_res8)} 个六边形, {total_8} 个点")
        print(f"  ✓ Res 9 聚合: {len(hex_res9)} 个六边形, {total_9} 个点")
        tests_passed += 1
    except AssertionError as e:
        print(f"  ✗ 失败: {e}")
        tests_failed += 1
    
    # Test 5: 下钻一致性
    print("\n[5/6] 测试下钻点计数一致性...")
    try:
        target_hex = max(hex_res8, key=lambda x: x["count"])
        target_hex_id = target_hex["hex_id"]
        target_count = target_hex["count"]
        
        children_data, child_total, _ = H3Aggregator.drill_down(
            df, target_hex_id, target_resolution=9
        )
        
        children_count = sum(h["count"] for h in children_data)
        
        assert children_count == target_count, (
            f"下钻后点数不一致: 父级 {target_count}, 子级 {children_count}, "
            f"差异 {children_count - target_count}"
        )
        
        print(f"  ✓ 父六边形: {target_hex_id[:12]}...")
        print(f"  ✓ 父级点数: {target_count}")
        print(f"  ✓ 子级点数: {children_count}")
        print(f"  ✓ 一致性验证通过 ✓")
        tests_passed += 1
    except AssertionError as e:
        print(f"  ✗ 失败: {e}")
        tests_failed += 1
    
    # Test 6: 边界漏点场景测试
    print("\n[6/6] 测试边界漏点场景...")
    try:
        parent_hex = h3.geo_to_h3(center_lat, center_lng, 8)
        parent_boundary = h3.h3_to_geo_boundary(parent_hex)
        lats = [p[0] for p in parent_boundary]
        lngs = [p[1] for p in parent_boundary]
        tight_bbox = [min(lngs), min(lats), max(lngs), max(lats)]
        
        children_no_parent, _, _ = H3Aggregator.aggregate_numpy(
            df, 9, bbox=tight_bbox
        )
        
        children_with_parent, _, _ = H3Aggregator.aggregate_numpy(
            df, 9, bbox=tight_bbox, parent_hex=parent_hex
        )
        
        count_no_parent = sum(h["count"] for h in children_no_parent)
        count_with_parent = sum(h["count"] for h in children_with_parent)
        
        print(f"  ✓ 仅使用 bbox: {count_no_parent} 个点, {len(children_no_parent)} 个六边形")
        print(f"  ✓ bbox + parent_hex: {count_with_parent} 个点, {len(children_with_parent)} 个六边形")
        
        if count_with_parent > count_no_parent:
            improvement = count_with_parent - count_no_parent
            print(f"  ✓ 修复后多找回 {improvement} 个点 ({improvement/count_with_parent*100:.1f}%)")
        elif count_with_parent == count_no_parent:
            print(f"  ✓ 修复前后一致 (本次数据没有边界漏点)")
        
        assert count_with_parent >= count_no_parent, "使用 parent_hex 不应该丢失点"
        tests_passed += 1
    except AssertionError as e:
        print(f"  ✗ 失败: {e}")
        tests_failed += 1
    
    print("\n" + "="*60)
    print(f"测试结果: {tests_passed} 通过, {tests_failed} 失败")
    print("="*60)
    
    if tests_failed == 0:
        print("\n✅ 所有修复验证通过！边界漏点问题已解决。")
        return 0
    else:
        print(f"\n❌ 有 {tests_failed} 个测试失败，请检查修复是否正确。")
        return 1


if __name__ == "__main__":
    sys.exit(test_all())

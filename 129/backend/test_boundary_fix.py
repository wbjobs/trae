"""
Test suite for H3 boundary drill-down fix.

This test verifies that the fix for missing hexagons when drilling down
(resolution 8 -> 9) works correctly.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import numpy as np
import h3
import pytest
from typing import List, Dict, Any

from app.h3_aggregator import H3Aggregator
from app.data_loader import DataLoader


def create_test_data(center_lat: float, center_lng: float, num_points: int = 10000):
    """Create test data clustered around a center point."""
    np.random.seed(42)
    lats = center_lat + np.random.normal(0, 0.02, num_points)
    lngs = center_lng + np.random.normal(0, 0.02, num_points)
    speeds = np.random.uniform(10, 80, num_points)
    
    return pd.DataFrame({
        "lat": lats.round(6),
        "lng": lngs.round(6),
        "speed": speeds.round(2)
    })


def test_dynamic_bbox_padding():
    """Test that bbox padding is correctly calculated based on resolution."""
    print("\n" + "="*60)
    print("TEST 1: Dynamic BBox Padding Calculation")
    print("="*60)
    
    base_bbox = [121.45, 31.21, 121.50, 31.25]
    
    padding_res6 = DataLoader._get_h3_hexagon_diameter(6)
    padding_res8 = DataLoader._get_h3_hexagon_diameter(8)
    padding_res10 = DataLoader._get_h3_hexagon_diameter(10)
    
    print(f"Resolution 6 padding: {padding_res6:.6f} degrees (~{padding_res6*111000:.0f}m)")
    print(f"Resolution 8 padding: {padding_res8:.6f} degrees (~{padding_res8*111000:.0f}m)")
    print(f"Resolution 10 padding: {padding_res10:.6f} degrees (~{padding_res10*111000:.0f}m)")
    
    assert padding_res6 > padding_res8 > padding_res10, "Padding should decrease with higher resolution"
    
    expanded_res6 = DataLoader._expand_bbox(base_bbox, 6)
    expanded_res10 = DataLoader._expand_bbox(base_bbox, 10)
    
    assert expanded_res6[0] < expanded_res10[0], "Res 6 should expand more to the west"
    assert expanded_res6[2] > expanded_res10[2], "Res 6 should expand more to the east"
    
    print("✓ Dynamic bbox padding works correctly")


def test_hex_intersects_bbox():
    """Test H3 polygon intersection with bbox."""
    print("\n" + "="*60)
    print("TEST 2: H3 Polygon Intersection with BBox")
    print("="*60)
    
    center_lat, center_lng = 31.2304, 121.4737
    
    hex_res8 = h3.geo_to_h3(center_lat, center_lng, 8)
    hex_res9_center = h3.geo_to_h3(center_lat, center_lng, 9)
    
    children = list(h3.h3_to_children(hex_res8, 9))
    print(f"Parent hex (res 8): {hex_res8}")
    print(f"Number of children (res 9): {len(children)}")
    
    center = h3.h3_to_geo(hex_res8)
    edge_len = h3.edge_length(8, unit="m")
    
    tight_bbox = [
        center_lng - edge_len / 2000,
        center_lat - edge_len / 2000,
        center_lng + edge_len / 2000,
        center_lat + edge_len / 2000
    ]
    
    children_in_tight_bbox = [
        c for c in children
        if H3Aggregator._hex_intersects_bbox(c, tight_bbox)
    ]
    
    print(f"Children intersecting tight bbox: {len(children_in_tight_bbox)}")
    
    hex_boundary = h3.h3_to_geo_boundary(hex_res8)
    lats = [p[0] for p in hex_boundary]
    lngs = [p[1] for p in hex_boundary]
    hex_bbox = [min(lngs), min(lats), max(lngs), max(lats)]
    
    children_in_hex_bbox = [
        c for c in children
        if H3Aggregator._hex_intersects_bbox(c, hex_bbox)
    ]
    
    print(f"Children intersecting hex bbox: {len(children_in_hex_bbox)}")
    assert len(children_in_hex_bbox) == len(children), "All children should intersect parent's bbox"
    
    print("✓ H3 polygon intersection works correctly")


def test_drill_down_consistency():
    """Test that drill-down maintains point count consistency."""
    print("\n" + "="*60)
    print("TEST 3: Parent-Child Drill-Down Consistency")
    print("="*60)
    
    center_lat, center_lng = 31.2304, 121.4737
    df = create_test_data(center_lat, center_lng, num_points=50000)
    
    hex_res8, total_8, _ = H3Aggregator.aggregate_numpy(df, 8)
    print(f"Resolution 8: {len(hex_res8)} hexagons, {total_8} points")
    
    target_hex = max(hex_res8, key=lambda x: x["count"])
    target_hex_id = target_hex["hex_id"]
    target_count = target_hex["count"]
    print(f"\nTarget hex for drill-down: {target_hex_id}")
    print(f"Parent count: {target_count} points")
    
    children_data, child_total, _ = H3Aggregator.drill_down(
        df, target_hex_id, target_resolution=9
    )
    
    children_count = sum(h["count"] for h in children_data)
    print(f"Resolution 9: {len(children_data)} hexagons")
    print(f"Children total count: {children_count} points")
    print(f"Difference: {children_count - target_count}")
    
    assert abs(children_count - target_count) == 0, (
        f"Drill-down count mismatch: parent={target_count}, "
        f"children={children_count}"
    )
    
    consistency = H3Aggregator.validate_parent_child_consistency(
        [target_hex], children_data, child_resolution=9
    )
    
    print(f"\nConsistency check: {consistency}")
    assert consistency["inconsistency_count"] == 0, (
        f"Found {consistency['inconsistency_count']} inconsistencies"
    )
    
    print("✓ Parent-child drill-down consistency verified")


def test_boundary_edge_case():
    """Test the specific edge case that was causing missing hexagons."""
    print("\n" + "="*60)
    print("TEST 4: Boundary Edge Case Simulation")
    print("="*60)
    
    center_lat, center_lng = 31.2304, 121.4737
    df = create_test_data(center_lat, center_lng, num_points=20000)
    
    parent_hex = h3.geo_to_h3(center_lat, center_lng, 8)
    parent_boundary = h3.h3_to_geo_boundary(parent_hex)
    
    lats = [p[0] for p in parent_boundary]
    lngs = [p[1] for p in parent_boundary]
    parent_bbox = [min(lngs), min(lats), max(lngs), max(lats)]
    
    children_full, _, _ = H3Aggregator.aggregate_numpy(df, 9, bbox=None, parent_hex=parent_hex)
    print(f"Full children count (no bbox): {len(children_full)}")
    
    children_tight_bbox, _, _ = H3Aggregator.aggregate_numpy(
        df, 9, bbox=parent_bbox, parent_hex=parent_hex
    )
    print(f"Children with parent bbox filter: {len(children_tight_bbox)}")
    
    children_ids_full = {h["hex_id"] for h in children_full}
    children_ids_tight = {h["hex_id"] for h in children_tight_bbox}
    
    missing = children_ids_full - children_ids_tight
    extra = children_ids_tight - children_ids_full
    
    if missing:
        print(f"⚠️  Missing hexagons with tight bbox: {len(missing)}")
        for m in missing:
            child_center = h3.h3_to_geo(m)
            print(f"  - {m}: center={child_center}")
    else:
        print("✓ No missing hexagons with tight bbox + parent_hex filter")
    
    assert len(missing) == 0, f"Missing {len(missing)} hexagons"
    
    print("✓ Boundary edge case handled correctly")


def test_bbox_expansion_with_resolution():
    """Test that higher resolution doesn't cause data loss with bbox."""
    print("\n" + "="*60)
    print("TEST 5: BBox Expansion Across Resolutions")
    print("="*60)
    
    center_lat, center_lng = 31.2304, 121.4737
    df = create_test_data(center_lat, center_lng, num_points=100000)
    
    base_bbox = [121.46, 31.22, 121.49, 31.24]
    print(f"Base bbox: {base_bbox}")
    
    results_by_res = {}
    for res in [6, 7, 8, 9, 10]:
        hex_data, total, time_ms = H3Aggregator.aggregate_numpy(df, res, bbox=base_bbox)
        total_count = sum(h["count"] for h in hex_data)
        results_by_res[res] = {
            "hex_count": len(hex_data),
            "total_points": total_count,
            "time_ms": time_ms
        }
        print(f"Res {res}: {len(hex_data):4d} hexes, {total_count:6d} points, {time_ms:6.1f}ms")
    
    for res in range(7, 11):
        prev_count = results_by_res[res-1]["total_points"]
        curr_count = results_by_res[res]["total_points"]
        diff_percent = abs(curr_count - prev_count) / prev_count * 100
        
        print(f"Res {res-1} -> {res}: point count diff = {diff_percent:.2f}%")
        
        assert diff_percent < 5.0, (
            f"Point count differs by {diff_percent:.2f}% between "
            f"res {res-1} and {res}, which exceeds 5% threshold"
        )
    
    print("✓ BBox expansion maintains consistent point counts across resolutions")


def test_parent_hex_filtering():
    """Test that parent_hex parameter correctly filters points."""
    print("\n" + "="*60)
    print("TEST 6: Parent Hex Filtering")
    print("="*60)
    
    center_lat, center_lng = 31.2304, 121.4737
    df = create_test_data(center_lat, center_lng, num_points=30000)
    
    hex_res8_list, _, _ = H3Aggregator.aggregate_numpy(df, 8)
    hex_res8 = {h["hex_id"]: h["count"] for h in hex_res8_list}
    
    top_parents = sorted(hex_res8.items(), key=lambda x: x[1], reverse=True)[:3]
    
    for parent_id, parent_count in top_parents:
        children, children_total, _ = H3Aggregator.aggregate_numpy(
            df, 9, parent_hex=parent_id
        )
        
        children_count = sum(h["count"] for h in children)
        
        print(f"\nParent {parent_id[:12]}...: {parent_count} points")
        print(f"  Children count: {children_count} points")
        print(f"  Match: {children_count == parent_count}")
        
        for child in children:
            assert h3.h3_to_parent(child["hex_id"], 8) == parent_id, (
                f"Child {child['hex_id']} does not belong to parent {parent_id}"
            )
        
        assert children_count == parent_count, (
            f"Count mismatch for {parent_id}: {parent_count} vs {children_count}"
        )
    
    print("✓ Parent hex filtering works correctly")


def run_all_tests():
    """Run all tests."""
    print("\n" + "#"*60)
    print("# H3 Boundary Drill-Down Fix - Test Suite")
    print("#"*60)
    
    tests = [
        test_dynamic_bbox_padding,
        test_hex_intersects_bbox,
        test_drill_down_consistency,
        test_boundary_edge_case,
        test_bbox_expansion_with_resolution,
        test_parent_hex_filtering
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"\n✗ {test.__name__} FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"\n✗ {test.__name__} ERROR: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "="*60)
    print(f"Results: {passed} passed, {failed} failed")
    print("="*60)
    
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)

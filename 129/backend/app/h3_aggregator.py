import numpy as np
import h3
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import defaultdict
import time


class H3Aggregator:
    MIN_RESOLUTION = 6
    MAX_RESOLUTION = 10
    DEFAULT_RESOLUTION = 8

    @staticmethod
    def validate_resolution(resolution: int) -> int:
        if resolution < H3Aggregator.MIN_RESOLUTION:
            return H3Aggregator.MIN_RESOLUTION
        if resolution > H3Aggregator.MAX_RESOLUTION:
            return H3Aggregator.MAX_RESOLUTION
        return resolution

    @staticmethod
    def _bbox_to_polygon(bbox: List[float]) -> List[Tuple[float, float]]:
        min_lng, min_lat, max_lng, max_lat = bbox
        return [
            (min_lat, min_lng),
            (min_lat, max_lng),
            (max_lat, max_lng),
            (max_lng, min_lng),
            (min_lat, min_lng)
        ]

    @staticmethod
    def _hex_intersects_bbox(hex_id: str, bbox: List[float]) -> bool:
        min_lng, min_lat, max_lng, max_lat = bbox
        boundary = h3.h3_to_geo_boundary(hex_id)
        
        for lat, lng in boundary:
            if (min_lat - 1e-6 <= lat <= max_lat + 1e-6 and
                min_lng - 1e-6 <= lng <= max_lng + 1e-6):
                return True
        
        center_lat, center_lng = h3.h3_to_geo(hex_id)
        if (min_lat <= center_lat <= max_lat and
            min_lng <= center_lng <= max_lng):
            return True
        
        for corner_lat, corner_lng in [
            (min_lat, min_lng), (min_lat, max_lng),
            (max_lat, min_lng), (max_lat, max_lng)
        ]:
            if h3.point_dist(
                (center_lat, center_lng), (corner_lat, corner_lng), unit="m"
            ) < h3.edge_length(h3.h3_get_resolution(hex_id), unit="m") * 1.5:
                return True
        
        return False

    @staticmethod
    def _filter_hexagons_by_bbox(
        hexagons: List[Dict[str, Any]],
        bbox: Optional[List[float]]
    ) -> List[Dict[str, Any]]:
        if bbox is None:
            return hexagons
        
        return [
            h for h in hexagons
            if H3Aggregator._hex_intersects_bbox(h["hex_id"], bbox)
        ]

    @staticmethod
    def aggregate(
        df: pd.DataFrame,
        resolution: int,
        bbox: Optional[List[float]] = None,
        parent_hex: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int, float]:
        start_time = time.time()
        
        resolution = H3Aggregator.validate_resolution(resolution)
        
        if df.empty:
            return [], 0, 0.0
        
        total_points = len(df)
        
        lats = df["lat"].to_numpy()
        lngs = df["lng"].to_numpy()
        speeds = df["speed"].to_numpy()
        
        hex_agg = defaultdict(lambda: {"count": 0, "speed_sum": 0.0})
        
        if parent_hex and h3.h3_is_valid(parent_hex):
            parent_res = h3.h3_get_resolution(parent_hex)
            for i in range(total_points):
                try:
                    hex_id = h3.geo_to_h3(lats[i], lngs[i], resolution)
                    point_parent = h3.h3_to_parent(hex_id, parent_res)
                    if point_parent == parent_hex:
                        hex_agg[hex_id]["count"] += 1
                        hex_agg[hex_id]["speed_sum"] += speeds[i]
                except Exception:
                    continue
        else:
            for i in range(total_points):
                try:
                    hex_id = h3.geo_to_h3(lats[i], lngs[i], resolution)
                    hex_agg[hex_id]["count"] += 1
                    hex_agg[hex_id]["speed_sum"] += speeds[i]
                except Exception:
                    continue
        
        result = []
        for hex_id, agg in hex_agg.items():
            result.append({
                "hex_id": hex_id,
                "count": agg["count"],
                "avg_speed": round(agg["speed_sum"] / agg["count"], 2),
                "resolution": resolution
            })
        
        result = H3Aggregator._filter_hexagons_by_bbox(result, bbox)
        
        processing_time = (time.time() - start_time) * 1000
        
        return result, total_points, processing_time

    @staticmethod
    def aggregate_numpy(
        df: pd.DataFrame,
        resolution: int,
        bbox: Optional[List[float]] = None,
        parent_hex: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int, float]:
        start_time = time.time()
        
        resolution = H3Aggregator.validate_resolution(resolution)
        
        if df.empty:
            return [], 0, 0.0
        
        total_points = len(df)
        
        lats = df["lat"].to_numpy()
        lngs = df["lng"].to_numpy()
        speeds = df["speed"].to_numpy()
        
        hex_ids = np.array([
            h3.geo_to_h3(lats[i], lngs[i], resolution)
            for i in range(total_points)
        ])
        
        if parent_hex and h3.h3_is_valid(parent_hex):
            parent_res = h3.h3_get_resolution(parent_hex)
            expected_children: Set[str] = set(h3.h3_to_children(parent_hex, resolution))
            
            mask = np.array([h in expected_children for h in hex_ids])
            hex_ids = hex_ids[mask]
            speeds = speeds[mask]
            total_points = len(hex_ids)
        
        df_agg = pd.DataFrame({
            "hex_id": hex_ids,
            "speed": speeds
        })
        
        agg_result = df_agg.groupby("hex_id").agg(
            count=("hex_id", "size"),
            avg_speed=("speed", "mean")
        ).reset_index()
        
        result = []
        for _, row in agg_result.iterrows():
            result.append({
                "hex_id": row["hex_id"],
                "count": int(row["count"]),
                "avg_speed": round(float(row["avg_speed"]), 2),
                "resolution": resolution
            })
        
        result = H3Aggregator._filter_hexagons_by_bbox(result, bbox)
        
        processing_time = (time.time() - start_time) * 1000
        
        return result, total_points, processing_time

    @staticmethod
    def validate_parent_child_consistency(
        parent_hexagons: List[Dict[str, Any]],
        child_hexagons: List[Dict[str, Any]],
        child_resolution: int
    ) -> Dict[str, Any]:
        parent_map = {h["hex_id"]: h for h in parent_hexagons}
        
        child_to_parent = {}
        for child in child_hexagons:
            parent_id = h3.h3_to_parent(child["hex_id"], child_resolution - 1)
            child_to_parent[child["hex_id"]] = parent_id
        
        parent_children = defaultdict(list)
        for child_id, parent_id in child_to_parent.items():
            parent_children[parent_id].append(child_id)
        
        inconsistencies = []
        child_map = {h["hex_id"]: h for h in child_hexagons}
        
        for parent_id, children_ids in parent_children.items():
            parent_count = parent_map.get(parent_id, {}).get("count", 0)
            children_count = sum(
                child_map.get(cid, {}).get("count", 0)
                for cid in children_ids
            )
            
            if parent_count > 0 and abs(children_count - parent_count) > 0:
                inconsistencies.append({
                    "parent_id": parent_id,
                    "parent_count": parent_count,
                    "children_count": children_count,
                    "difference": children_count - parent_count,
                    "missing_children": []
                })
        
        return {
            "total_parents": len(parent_map),
            "total_children": len(child_hexagons),
            "inconsistencies": inconsistencies,
            "inconsistency_count": len(inconsistencies)
        }

    @staticmethod
    def drill_down(
        df: pd.DataFrame,
        parent_hex_id: str,
        target_resolution: int,
        bbox: Optional[List[float]] = None
    ) -> Tuple[List[Dict[str, Any]], int, float]:
        if not h3.h3_is_valid(parent_hex_id):
            raise ValueError(f"Invalid H3 hex ID: {parent_hex_id}")
        
        current_res = h3.h3_get_resolution(parent_hex_id)
        if target_resolution <= current_res:
            raise ValueError(
                f"Target resolution {target_resolution} must be higher than "
                f"current resolution {current_res}"
            )
        
        return H3Aggregator.aggregate_numpy(
            df, target_resolution, bbox, parent_hex=parent_hex_id
        )

    @staticmethod
    def get_parent_hex(hex_id: str, target_resolution: int) -> str:
        current_res = h3.h3_get_resolution(hex_id)
        if target_resolution >= current_res:
            return hex_id
        return h3.h3_to_parent(hex_id, target_resolution)

    @staticmethod
    def get_children_hex(hex_id: str, target_resolution: int) -> List[str]:
        current_res = h3.h3_get_resolution(hex_id)
        if target_resolution <= current_res:
            return [hex_id]
        return list(h3.h3_to_children(hex_id, target_resolution))

    @staticmethod
    def hex_to_boundary(hex_id: str) -> List[List[float]]:
        boundary = h3.h3_to_geo_boundary(hex_id, geo_json=True)
        return [[coord[1], coord[0]] for coord in boundary]

    @staticmethod
    def hex_to_center(hex_id: str) -> List[float]:
        lat, lng = h3.h3_to_geo(hex_id)
        return [lng, lat]

    @staticmethod
    def aggregate_24h(
        df: pd.DataFrame,
        resolution: int,
        bbox: Optional[List[float]] = None,
        parent_hex: Optional[str] = None,
        hours: List[int] = None
    ) -> Dict[int, List[Dict[str, Any]]]:
        """
        批量聚合24小时的数据，返回每小时的聚合结果。
        返回 {hour: [hexagons]} 的字典。
        """
        if hours is None:
            hours = list(range(24))
        
        if 'hour' not in df.columns:
            if 'timestamp' in df.columns:
                df = df.copy()
                df['hour'] = df['timestamp'].dt.hour
            else:
                return {}
        
        results = {}
        for hour in hours:
            hour_df = df[df['hour'] == hour]
            hexagons, total, _ = H3Aggregator.aggregate_numpy(
                hour_df, resolution, bbox, parent_hex
            )
            results[hour] = {
                'hexagons': hexagons,
                'total_points': total,
                'hour': hour
            }
        
        return results

    @staticmethod
    def interpolate_hourly_data(
        df: pd.DataFrame,
        hour_start: int,
        hour_end: int,
        resolution: int,
        fraction: float = 0.5,
        bbox: Optional[List[float]] = None,
        parent_hex: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]]:
        """
        插值计算两个小时之间的平滑过渡数据。
        fraction: 0.0 = 完全使用 hour_start 的数据, 1.0 = 完全使用 hour_end 的数据
        """
        df_start = df[df['hour'] == hour_start]
        df_end = df[df['hour'] == hour_end]
        
        hex_start, total_start, _ = H3Aggregator.aggregate_numpy(
            df_start, resolution, bbox, parent_hex
        )
        hex_end, total_end, _ = H3Aggregator.aggregate_numpy(
            df_end, resolution, bbox, parent_hex
        )
        
        start_map = {h['hex_id']: h for h in hex_start}
        end_map = {h['hex_id']: h for h in hex_end}
        
        all_hex_ids = set(start_map.keys()) | set(end_map.keys())
        
        result = []
        for hex_id in all_hex_ids:
            start_data = start_map.get(hex_id, {'count': 0, 'avg_speed': 0, 'resolution': resolution})
            end_data = end_map.get(hex_id, {'count': 0, 'avg_speed': 0, 'resolution': resolution})
            
            count = int(start_data['count'] * (1 - fraction) + int(end_data['count'] * fraction)
            if count == 0:
                continue
            
            if start_data['count'] > 0 and end_data['count'] > 0:
                avg_speed = start_data['avg_speed'] * (1 - fraction) + end_data['avg_speed'] * fraction
            elif start_data['count'] > 0:
                avg_speed = start_data['avg_speed']
            else:
                avg_speed = end_data['avg_speed']
            
            result.append({
                'hex_id': hex_id,
                'count': count,
                'avg_speed': round(avg_speed, 2),
                'resolution': resolution
            })
        
        return result, int(total_start * (1 - fraction) + int(total_end * fraction), 0.0

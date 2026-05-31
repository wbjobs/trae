import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from collections import defaultdict
from sqlalchemy.orm import Session
import json
import time

from app.models import Warehouse, Vehicle, Order, OrderAnomaly, DailyStats
from app.algorithms import STLAnomalyDetector, LSTMAutoencoderDetector, TopKSubgraphMiner
from app.database import get_redis


class AnomalyDetectionService:
    def __init__(self):
        self.stl_detector = STLAnomalyDetector(period=7, seasonal=7)
        self.subgraph_miner = TopKSubgraphMiner(k=5)
        self._lstm_detector = None
        self._redis = None

    @property
    def redis(self):
        if self._redis is None:
            self._redis = get_redis()
        return self._redis

    def _get_lstm_detector(self):
        if self._lstm_detector is None:
            self._lstm_detector = LSTMAutoencoderDetector(
                input_dim=1,
                sequence_length=30,
                hidden_dim=64,
                latent_dim=16,
                epochs=30,
                batch_size=32,
            )
        return self._lstm_detector

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        from math import radians, sin, cos, sqrt, atan2
        
        R = 6371
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c

    def _cache_key(self, prefix: str, **kwargs) -> str:
        sorted_kwargs = sorted(kwargs.items())
        key_parts = [prefix] + [f"{k}={v}" for k, v in sorted_kwargs]
        return ":".join(key_parts)

    def detect_volume_anomalies(
        self,
        db: Session,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        z_threshold: float = 2.5,
    ) -> Dict:
        cache_key = self._cache_key(
            "volume_anomalies",
            start=start_date.isoformat() if start_date else "none",
            end=end_date.isoformat() if end_date else "none",
            z=z_threshold,
        )
        
        cached = self.redis.get(cache_key)
        if cached:
            return json.loads(cached)
        
        if start_date is None:
            start_date = datetime.now() - timedelta(days=90)
        if end_date is None:
            end_date = datetime.now()
        
        orders = db.query(
            Order.id,
            Order.scheduled_pickup_time,
            Order.weight,
        ).filter(
            Order.scheduled_pickup_time >= start_date,
            Order.scheduled_pickup_time <= end_date,
        ).all()
        
        if len(orders) == 0:
            return {"anomalies": [], "stats": {"total": 0, "anomaly_count": 0}}
        
        df = pd.DataFrame([{
            "id": o.id,
            "timestamp": o.scheduled_pickup_time,
            "weight": o.weight,
        } for o in orders])
        
        df["date"] = df["timestamp"].dt.date
        daily_counts = df.groupby("date").size()
        daily_counts.index = pd.to_datetime(daily_counts.index)
        
        result_df, anomaly_indices = self.stl_detector.detect_volume_anomalies(
            daily_counts,
            z_threshold=z_threshold,
        )
        
        anomalies = []
        for idx in anomaly_indices:
            row = result_df.iloc[idx]
            anomalies.append({
                "date": row["date"].isoformat(),
                "actual": float(row["actual"]),
                "trend": float(row["trend"]),
                "residual": float(row["residual"]),
                "z_score": float(row["z_score"]),
                "anomaly_score": float(row["anomaly_score"]),
                "type": "volume_spike" if row["residual"] > 0 else "volume_drop",
            })
        
        result = {
            "anomalies": anomalies,
            "stats": {
                "total_days": len(daily_counts),
                "anomaly_days": len(anomalies),
                "avg_daily_volume": float(daily_counts.mean()),
                "max_daily_volume": int(daily_counts.max()),
            },
            "daily_data": result_df.to_dict(orient="records") if not result_df.empty else [],
        }
        
        self.redis.setex(cache_key, 3600, json.dumps(result, default=str))
        return result

    def detect_duration_anomalies(
        self,
        db: Session,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        min_duration_variation: float = 0.3,
    ) -> Dict:
        if start_date is None:
            start_date = datetime.now() - timedelta(days=90)
        if end_date is None:
            end_date = datetime.now()
        
        warehouses = db.query(Warehouse).all()
        wh_coords = {w.id: (w.latitude, w.longitude) for w in warehouses}
        
        orders = db.query(
            Order.id,
            Order.origin_warehouse_id,
            Order.destination_warehouse_id,
            Order.scheduled_delivery_time,
            Order.actual_delivery_time,
            Order.weight,
        ).filter(
            Order.actual_delivery_time.isnot(None),
            Order.scheduled_pickup_time >= start_date,
            Order.scheduled_pickup_time <= end_date,
        ).all()
        
        if len(orders) == 0:
            return {"anomalies": [], "stats": {"total": 0}}
        
        order_data = []
        durations = []
        for o in orders:
            origin_id = o.origin_warehouse_id
            dest_id = o.destination_warehouse_id
            
            if origin_id in wh_coords and dest_id in wh_coords:
                lat1, lon1 = wh_coords[origin_id]
                lat2, lon2 = wh_coords[dest_id]
                distance = self._haversine_distance(lat1, lon1, lat2, lon2)
                expected_hours = distance / 60
                
                actual_hours = (o.actual_delivery_time - o.scheduled_delivery_time).total_seconds() / 3600
                variation = abs(actual_hours) / (expected_hours + 1e-10)
                
                durations.append(actual_hours)
                order_data.append({
                    "id": o.id,
                    "origin_id": origin_id,
                    "destination_id": dest_id,
                    "expected_hours": expected_hours,
                    "actual_hours": actual_hours,
                    "variation_ratio": variation,
                    "distance": distance,
                    "weight": o.weight,
                })
        
        if len(durations) < 60:
            return {"anomalies": [], "stats": {"total": len(durations)}}
        
        try:
            detector = self._get_lstm_detector()
            train_data = np.array(durations[:max(200, len(durations)//2)])
            detector.fit(train_data)
            
            scores, lstm_anomalies = detector.detect_anomalies(np.array(durations))
            
            anomalies = []
            for anomaly_info in lstm_anomalies:
                seq_idx = anomaly_info["sequence_index"]
                for offset in range(detector.sequence_length):
                    data_idx = seq_idx + offset
                    if data_idx < len(order_data):
                        order = order_data[data_idx]
                        if order["variation_ratio"] > min_duration_variation:
                            anomaly_score = order["variation_ratio"]
                            
                            anomalies.append({
                                "order_id": order["id"],
                                "expected_hours": order["expected_hours"],
                                "actual_hours": order["actual_hours"],
                                "variation_ratio": order["variation_ratio"],
                                "anomaly_score": anomaly_score,
                                "anomaly_type": "delay" if order["actual_hours"] > 0 else "early",
                                "distance_km": order["distance"],
                            })
        except Exception as e:
            print(f"LSTM detection failed, falling back to simple threshold: {e}")
            anomalies = []
            for order in order_data:
                if order["variation_ratio"] > min_duration_variation:
                    anomalies.append({
                        "order_id": order["id"],
                        "expected_hours": order["expected_hours"],
                        "actual_hours": order["actual_hours"],
                        "variation_ratio": order["variation_ratio"],
                        "anomaly_score": order["variation_ratio"],
                        "anomaly_type": "delay" if order["actual_hours"] > 0 else "early",
                        "distance_km": order["distance"],
                    })
        
        unique_anomalies = {}
        for a in anomalies:
            if a["order_id"] not in unique_anomalies:
                unique_anomalies[a["order_id"]] = a
            else:
                existing = unique_anomalies[a["order_id"]]
                if a["anomaly_score"] > existing["anomaly_score"]:
                    unique_anomalies[a["order_id"]] = a
        
        anomalies_list = list(unique_anomalies.values())
        anomalies_list.sort(key=lambda x: x["anomaly_score"], reverse=True)
        
        return {
            "anomalies": anomalies_list[:1000],
            "stats": {
                "total_analyzed": len(order_data),
                "total_anomalies": len(anomalies_list),
                "avg_variation": float(np.mean([o["variation_ratio"] for o in order_data])),
            },
        }

    def compute_composite_anomaly_score(
        self,
        order_data: Dict,
        historical_context: Dict,
    ) -> Tuple[float, str]:
        volume_score = 0.0
        if historical_context.get("daily_mean", 0) > 0:
            volume_z = (historical_context.get("daily_volume", 0) - historical_context["daily_mean"]) / (historical_context.get("daily_std", 1) + 1e-10)
            volume_score = abs(volume_z)
        
        duration_variation = order_data.get("duration_variation", 0)
        duration_score = abs(duration_variation)
        
        weight_ratio = order_data.get("weight", 0) / 25.0
        weight_score = max(0, weight_ratio - 1.0) * 2
        
        composite = volume_score * 0.3 + duration_score * 0.5 + weight_score * 0.2
        
        if composite >= 3.0:
            level = "critical"
        elif composite >= 1.5:
            level = "high"
        elif composite >= 0.8:
            level = "medium"
        else:
            level = "low"
        
        return float(composite), level

    def save_anomaly_results(
        self,
        db: Session,
        anomalies: List[Dict],
    ):
        for anomaly in anomalies[:5000]:
            if db.query(OrderAnomaly).filter(
                OrderAnomaly.order_id == anomaly.get("order_id")
            ).first():
                continue
            
            order_anomaly = OrderAnomaly(
                order_id=anomaly.get("order_id"),
                anomaly_type=anomaly.get("anomaly_type", "unknown"),
                anomaly_score=anomaly.get("anomaly_score", 0.0),
                anomaly_level=anomaly.get("anomaly_level", "medium"),
                details=json.dumps(anomaly.get("details", {})),
            )
            db.add(order_anomaly)
        
        db.commit()

    def get_spatio_temporal_flows(
        self,
        db: Session,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        min_anomaly_score: float = 0.5,
        limit: int = 5000,
    ) -> List[Dict]:
        if start_date is None:
            start_date = datetime.now() - timedelta(days=30)
        if end_date is None:
            end_date = datetime.now()
        
        warehouses = db.query(Warehouse).all()
        wh_data = {
            w.id: {
                "latitude": w.latitude,
                "longitude": w.longitude,
                "region": w.region,
                "name": w.name,
            }
            for w in warehouses
        }
        
        anomaly_query = db.query(
            OrderAnomaly.order_id,
            OrderAnomaly.anomaly_score,
            OrderAnomaly.anomaly_level,
            OrderAnomaly.anomaly_type,
        ).filter(
            OrderAnomaly.anomaly_score >= min_anomaly_score,
            OrderAnomaly.detected_at >= start_date,
            OrderAnomaly.detected_at <= end_date,
        ).limit(limit).all()
        
        if len(anomaly_query) == 0:
            return []
        
        order_ids = [a.order_id for a in anomaly_query]
        anomaly_map = {
            a.order_id: {
                "score": a.anomaly_score,
                "level": a.anomaly_level,
                "type": a.anomaly_type,
            }
            for a in anomaly_query
        }
        
        orders = db.query(Order).filter(Order.id.in_(order_ids)).all()
        
        flows = []
        for order in orders:
            origin = wh_data.get(order.origin_warehouse_id)
            dest = wh_data.get(order.destination_warehouse_id)
            anomaly = anomaly_map.get(order.id, {})
            
            if origin and dest:
                flows.append({
                    "order_id": order.id,
                    "order_number": order.order_number,
                    "origin_id": order.origin_warehouse_id,
                    "destination_id": order.destination_warehouse_id,
                    "origin_coords": [origin["longitude"], origin["latitude"]],
                    "destination_coords": [dest["longitude"], dest["latitude"]],
                    "origin_name": origin["name"],
                    "destination_name": dest["name"],
                    "origin_region": origin["region"],
                    "destination_region": dest["region"],
                    "weight": order.weight,
                    "scheduled_pickup_time": order.scheduled_pickup_time.isoformat() if order.scheduled_pickup_time else None,
                    "scheduled_delivery_time": order.scheduled_delivery_time.isoformat() if order.scheduled_delivery_time else None,
                    "anomaly_score": anomaly.get("score", 0.0),
                    "anomaly_level": anomaly.get("level", "low"),
                    "anomaly_type": anomaly.get("type"),
                })
        
        return flows

    def get_parallel_coords_data(
        self,
        db: Session,
        order_ids: Optional[List[int]] = None,
        bbox: Optional[Dict] = None,
        limit: int = 2000,
    ) -> List[Dict]:
        warehouses = db.query(Warehouse).all()
        wh_data = {
            w.id: {
                "latitude": w.latitude,
                "longitude": w.longitude,
                "region": w.region,
            }
            for w in warehouses
        }
        
        query = db.query(Order, OrderAnomaly).outerjoin(
            OrderAnomaly, Order.id == OrderAnomaly.order_id
        )
        
        if order_ids:
            query = query.filter(Order.id.in_(order_ids))
        else:
            query = query.filter(OrderAnomaly.id.isnot(None))
        
        query = query.limit(limit)
        results = query.all()
        
        data_points = []
        for order, anomaly in results:
            origin = wh_data.get(order.origin_warehouse_id)
            dest = wh_data.get(order.destination_warehouse_id)
            
            if not origin or not dest:
                continue
            
            if bbox:
                in_origin = (
                    bbox["min_lat"] <= origin["latitude"] <= bbox["max_lat"] and
                    bbox["min_lng"] <= origin["longitude"] <= bbox["max_lng"]
                )
                in_dest = (
                    bbox["min_lat"] <= dest["latitude"] <= bbox["max_lat"] and
                    bbox["min_lng"] <= dest["longitude"] <= bbox["max_lng"]
                )
                if not (in_origin or in_dest):
                    continue
            
            distance = self._haversine_distance(
                origin["latitude"], origin["longitude"],
                dest["latitude"], dest["longitude"],
            )
            
            expected_hours = distance / 60
            
            actual_hours = 0.0
            if order.actual_delivery_time and order.scheduled_pickup_time:
                actual_hours = (order.actual_delivery_time - order.scheduled_pickup_time).total_seconds() / 3600
            
            transit_hours = max(actual_hours, expected_hours)
            
            data_points.append({
                "order_id": order.id,
                "weight": order.weight,
                "transit_hours": transit_hours,
                "expected_transit_hours": expected_hours,
                "anomaly_score": anomaly.anomaly_score if anomaly else 0.0,
                "distance_km": distance,
                "origin_region": origin["region"] or "Unknown",
                "destination_region": dest["region"] or "Unknown",
                "anomaly_level": anomaly.anomaly_level if anomaly else "normal",
            })
        
        return data_points

    def run_full_detection(
        self,
        db: Session,
        days: int = 90,
        k: int = 5,
    ) -> Dict:
        start_time = time.time()
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        print(f"Running full anomaly detection for {days} days...")
        
        volume_result = self.detect_volume_anomalies(db, start_date, end_date)
        duration_result = self.detect_duration_anomalies(db, start_date, end_date)
        
        all_anomalies = []
        anomaly_scores = {}
        
        for anomaly in duration_result["anomalies"]:
            score, level = self.compute_composite_anomaly_score(
                anomaly,
                {"daily_mean": 100, "daily_std": 30, "daily_volume": 150},
            )
            anomaly["anomaly_score"] = score
            anomaly["anomaly_level"] = level
            all_anomalies.append(anomaly)
            anomaly_scores[anomaly["order_id"]] = score
        
        self.save_anomaly_results(db, all_anomalies)
        
        warehouses = db.query(Warehouse).all()
        warehouse_coords = {w.id: (w.latitude, w.longitude) for w in warehouses}
        
        orders_query = db.query(
            Order.id,
            Order.origin_warehouse_id,
            Order.destination_warehouse_id,
            Order.weight,
        ).filter(
            Order.scheduled_pickup_time >= start_date,
            Order.scheduled_pickup_time <= end_date,
        ).limit(50000).all()
        
        orders_data = [
            {
                "id": o.id,
                "origin_warehouse_id": o.origin_warehouse_id,
                "destination_warehouse_id": o.destination_warehouse_id,
                "weight": o.weight,
            }
            for o in orders_query
        ]
        
        top_k_subgraphs = self.subgraph_miner.mine_top_k(
            warehouse_coords=warehouse_coords,
            orders=orders_data,
            anomaly_scores=anomaly_scores,
            k=k,
        )
        
        processing_time = (time.time() - start_time) * 1000
        
        return {
            "total_analyzed": len(orders_query),
            "total_anomalies": len(all_anomalies),
            "stl_volume_anomalies": len(volume_result.get("anomalies", [])),
            "lstm_duration_anomalies": duration_result.get("stats", {}).get("total_anomalies", 0),
            "top_k_subgraphs": [
                {**sg, "rank": i + 1}
                for i, sg in enumerate(top_k_subgraphs)
            ],
            "processing_time_ms": processing_time,
        }


anomaly_service = AnomalyDetectionService()

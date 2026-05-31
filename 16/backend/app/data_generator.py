import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
from collections import defaultdict
from sqlalchemy.orm import Session
import random
import string

from app.models import Warehouse, Vehicle, Order
from app.database import get_db_session


class LogisticsDataGenerator:
    CHINA_CITIES = [
        ("Beijing", 39.9042, 116.4074, "North"),
        ("Shanghai", 31.2304, 121.4737, "East"),
        ("Guangzhou", 23.1291, 113.2644, "South"),
        ("Shenzhen", 22.5431, 114.0579, "South"),
        ("Chengdu", 30.5728, 104.0668, "West"),
        ("Wuhan", 30.5928, 114.3055, "Central"),
        ("Hangzhou", 30.2741, 120.1551, "East"),
        ("Nanjing", 32.0603, 118.7969, "East"),
        ("Xi'an", 34.3416, 108.9398, "Northwest"),
        ("Chongqing", 29.4316, 106.9123, "West"),
        ("Tianjin", 39.0842, 117.2009, "North"),
        ("Suzhou", 31.2989, 120.5853, "East"),
        ("Zhengzhou", 34.7466, 113.6254, "Central"),
        ("Changsha", 28.2282, 112.9388, "Central"),
        ("Dongguan", 23.0207, 113.7518, "South"),
        ("Qingdao", 36.0671, 120.3826, "North"),
        ("Shenyang", 41.8057, 123.4315, "Northeast"),
        ("Jinan", 36.6512, 117.1201, "North"),
        ("Harbin", 45.8038, 126.5350, "Northeast"),
        ("Fuzhou", 26.0745, 119.2965, "East"),
        ("Hefei", 31.8206, 117.2272, "East"),
        ("Kunming", 24.8801, 102.8329, "West"),
        ("Changchun", 43.8171, 125.3235, "Northeast"),
        ("Nanchang", 28.6820, 115.8579, "Central"),
        ("Taiyuan", 37.8706, 112.5489, "North"),
        ("Guiyang", 26.6470, 106.6302, "West"),
        ("Xiamen", 24.4798, 118.0894, "East"),
        ("Wuxi", 31.4912, 120.3119, "East"),
        ("Urumqi", 43.8256, 87.6168, "Northwest"),
        ("Dalian", 38.9140, 121.6147, "Northeast"),
    ]

    VEHICLE_TYPES = ["Light Truck", "Medium Truck", "Heavy Truck", "Refrigerated", "Container"]
    VEHICLE_PREFIXES = ["京A", "沪B", "粤C", "苏A", "浙A", "鲁A", "川A", "鄂A", "粤B", "沪A"]

    def __init__(self):
        self.rng = np.random.RandomState(42)
        random.seed(42)

    def generate_warehouses(self, num_warehouses: int = 30) -> List[Dict]:
        warehouses = []
        
        if num_warehouses <= len(self.CHINA_CITIES):
            cities = self.CHINA_CITIES[:num_warehouses]
        else:
            cities = []
            for i in range(num_warehouses):
                base_city = self.CHINA_CITIES[i % len(self.CHINA_CITIES)]
                cities.append((
                    f"{base_city[0]}_{i // len(self.CHINA_CITIES) + 1}",
                    base_city[1] + np.random.uniform(-0.5, 0.5),
                    base_city[2] + np.random.uniform(-0.5, 0.5),
                    base_city[3],
                ))
        
        for idx, (name, lat, lon, region) in enumerate(cities, 1):
            warehouses.append({
                "id": idx,
                "name": f"{name} Distribution Center",
                "latitude": lat,
                "longitude": lon,
                "capacity": int(self.rng.randint(5000, 30000)),
                "region": region,
            })
        
        return warehouses

    def generate_vehicles(self, num_vehicles: int = 200, warehouse_ids: List[int] = None) -> List[Dict]:
        if warehouse_ids is None:
            warehouse_ids = [1]
        
        vehicles = []
        for idx in range(1, num_vehicles + 1):
            prefix = random.choice(self.VEHICLE_PREFIXES)
            plate = f"{prefix}{''.join(random.choices(string.ascii_uppercase + string.digits, k=5))}"
            
            vehicles.append({
                "id": idx,
                "plate_number": plate,
                "vehicle_type": random.choice(self.VEHICLE_TYPES),
                "max_load": float(self.rng.choice([5, 10, 20, 30, 40])),
                "home_warehouse_id": random.choice(warehouse_ids),
                "status": random.choices(["active", "active", "active", "maintenance"], weights=[3, 3, 3, 1])[0],
            })
        
        return vehicles

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        from math import radians, sin, cos, sqrt, atan2
        
        R = 6371
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c

    def _expected_transit_hours(self, distance_km: float) -> float:
        avg_speed_kmh = 60
        driving_hours_per_day = 8
        hours = distance_km / avg_speed_kmh
        return max(hours, 2)

    def generate_orders(
        self,
        num_orders: int,
        warehouses: List[Dict],
        vehicles: List[Dict],
        start_date: datetime,
        end_date: datetime,
        anomaly_probability: float = 0.05,
    ) -> List[Dict]:
        orders = []
        num_days = (end_date - start_date).days
        
        active_vehicles = [v for v in vehicles if v["status"] == "active"]
        vehicle_ids = [v["id"] for v in active_vehicles] if active_vehicles else [v["id"] for v in vehicles]
        
        warehouse_coords = {w["id"]: (w["latitude"], w["longitude"]) for w in warehouses}
        warehouse_ids = [w["id"] for w in warehouses]
        
        base_daily_rate = num_orders / max(num_days, 1)
        
        anomalies_injected = 0
        
        for order_idx in range(1, num_orders + 1):
            random_days_offset = self.rng.randint(0, max(num_days, 1))
            scheduled_pickup = start_date + timedelta(
                days=int(random_days_offset),
                hours=int(self.rng.uniform(6, 18)),
            )
            
            origin_id = self.rng.choice(warehouse_ids)
            dest_id = self.rng.choice([w for w in warehouse_ids if w != origin_id])
            
            lat1, lon1 = warehouse_coords[origin_id]
            lat2, lon2 = warehouse_coords[dest_id]
            distance = self._haversine_distance(lat1, lon1, lat2, lon2)
            expected_hours = self._expected_transit_hours(distance)
            
            actual_pickup = scheduled_pickup + timedelta(hours=self.rng.uniform(-0.5, 1.0))
            scheduled_delivery = scheduled_pickup + timedelta(hours=expected_hours)
            
            is_anomaly = self.rng.random() < anomaly_probability
            
            if is_anomaly:
                anomalies_injected += 1
                anomaly_type = self.rng.choice(["delay", "early", "extreme_weight", "route_anomaly"])
                
                if anomaly_type == "delay":
                    extra_hours = expected_hours * self.rng.uniform(0.5, 2.0)
                    actual_delivery = scheduled_delivery + timedelta(hours=extra_hours)
                    weight = float(self.rng.uniform(0.5, 25))
                elif anomaly_type == "early":
                    early_hours = expected_hours * self.rng.uniform(0.3, 0.6)
                    actual_delivery = scheduled_delivery - timedelta(hours=early_hours)
                    weight = float(self.rng.uniform(0.5, 25))
                elif anomaly_type == "extreme_weight":
                    weight = float(self.rng.uniform(30, 50))
                    actual_delivery = scheduled_delivery + timedelta(hours=self.rng.uniform(0, 2))
                else:
                    actual_delivery = scheduled_delivery + timedelta(hours=self.rng.uniform(0, 1))
                    weight = float(self.rng.uniform(0.5, 25))
            else:
                variation = self.rng.uniform(-0.1, 0.15)
                actual_delivery = scheduled_delivery + timedelta(hours=expected_hours * variation)
                weight = float(self.rng.uniform(0.5, 25))
            
            orders.append({
                "id": order_idx,
                "order_number": f"ORD-{start_date.year}-{order_idx:08d}",
                "origin_warehouse_id": origin_id,
                "destination_warehouse_id": dest_id,
                "vehicle_id": self.rng.choice(vehicle_ids) if vehicle_ids else None,
                "weight": weight,
                "scheduled_pickup_time": scheduled_pickup,
                "actual_pickup_time": actual_pickup,
                "scheduled_delivery_time": scheduled_delivery,
                "actual_delivery_time": actual_delivery,
                "status": "delivered" if actual_delivery else "in_transit",
                "created_at": scheduled_pickup - timedelta(hours=self.rng.uniform(1, 24)),
                "is_injected_anomaly": is_anomaly,
                "anomaly_type": anomaly_type if is_anomaly else None,
            })
            
            if order_idx % 100000 == 0:
                print(f"Generated {order_idx} orders...")
        
        print(f"Total orders generated: {num_orders}, anomalies injected: {anomalies_injected}")
        return orders

    def save_to_database(
        self,
        warehouses: List[Dict],
        vehicles: List[Dict],
        orders: List[Dict],
        batch_size: int = 5000,
    ):
        with get_db_session() as db:
            print("Clearing existing data...")
            db.query(Order).delete()
            db.query(Vehicle).delete()
            db.query(Warehouse).delete()
            db.commit()
            
            print(f"Saving {len(warehouses)} warehouses...")
            for wh in warehouses:
                db.add(Warehouse(**{k: v for k, v in wh.items() if k != "id"}))
            db.commit()
            
            saved_warehouses = db.query(Warehouse).all()
            wh_id_map = {w.name: w.id for w in saved_warehouses}
            print(f"Warehouse count: {len(saved_warehouses)}")
            
            print(f"Saving {len(vehicles)} vehicles...")
            for v in vehicles:
                db.add(Vehicle(**{k: v for k, v in v.items() if k != "id"}))
            db.commit()
            
            saved_vehicles = db.query(Vehicle).all()
            vehicle_id_map = {v.plate_number: v.id for v in saved_vehicles}
            print(f"Vehicle count: {len(saved_vehicles)}")
            
            print(f"Saving {len(orders)} orders in batches...")
            
            for i in range(0, len(orders), batch_size):
                batch = orders[i:i + batch_size]
                order_objs = []
                
                for order_data in batch:
                    order_dict = {k: v for k, v in order_data.items() 
                                  if k not in ["id", "is_injected_anomaly", "anomaly_type"]}
                    order_objs.append(Order(**order_dict))
                
                db.bulk_save_objects(order_objs)
                
                if (i // batch_size) % 10 == 0:
                    db.commit()
                    print(f"  Saved {i + len(batch)} orders...")
            
            db.commit()
            print(f"Total orders saved: {len(orders)}")

    def generate_and_save_all(
        self,
        num_warehouses: int = 30,
        num_vehicles: int = 500,
        num_orders: int = 1000000,
        days: int = 90,
        anomaly_prob: float = 0.05,
    ):
        end_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        start_date = end_date - timedelta(days=days)
        
        print("=" * 60)
        print(f"Generating logistics data for {days} days")
        print(f"  Warehouses: {num_warehouses}")
        print(f"  Vehicles: {num_vehicles}")
        print(f"  Orders: {num_orders}")
        print(f"  Anomaly rate: {anomaly_prob:.1%}")
        print("=" * 60)
        
        warehouses = self.generate_warehouses(num_warehouses)
        vehicles = self.generate_vehicles(num_vehicles, [w["id"] for w in warehouses])
        orders = self.generate_orders(
            num_orders=num_orders,
            warehouses=warehouses,
            vehicles=vehicles,
            start_date=start_date,
            end_date=end_date,
            anomaly_probability=anomaly_prob,
        )
        
        self.save_to_database(warehouses, vehicles, orders)
        
        print("\nData generation complete!")
        return warehouses, vehicles, orders

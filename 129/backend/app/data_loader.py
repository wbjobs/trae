import pandas as pd
import numpy as np
import h3
import os
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

load_dotenv()


class DataLoader:
    def __init__(self):
        self.data_path = os.getenv("DATA_PATH", "./data/taxi_data.csv")
        self.df: Optional[pd.DataFrame] = None
        self._load_data()

    def _load_data(self):
        if os.path.exists(self.data_path):
            print(f"Loading data from {self.data_path}...")
            self.df = pd.read_csv(self.data_path)
            print(f"Loaded {len(self.df)} points")
        else:
            print(f"Data file not found: {self.data_path}")
            print("Please run 'python generate_data.py' first")
            self.df = pd.DataFrame(columns=["lat", "lng", "speed"])

    @staticmethod
    def _get_h3_hexagon_diameter(resolution: int) -> float:
        edge_lengths = {
            0: 1107712.591, 1: 418675.827, 2: 158244.656, 3: 59810.848,
            4: 22606.379, 5: 8544.408, 6: 3229.489, 7: 1220.894,
            8: 461.354, 9: 174.376, 10: 65.907, 11: 24.910,
            12: 9.415, 13: 3.559, 14: 1.348, 15: 0.509
        }
        edge_m = edge_lengths.get(resolution, edge_lengths[8])
        return edge_m * 2.5 / 111000.0

    @staticmethod
    def _expand_bbox(bbox: List[float], resolution: int) -> List[float]:
        padding = DataLoader._get_h3_hexagon_diameter(resolution)
        min_lng, min_lat, max_lng, max_lat = bbox
        return [
            min_lng - padding,
            min_lat - padding,
            max_lng + padding,
            max_lat + padding
        ]

    def get_data(
        self, 
        bbox: Optional[List[float]] = None, 
        resolution: Optional[int] = None,
        start_hour: Optional[int] = None,
        end_hour: Optional[int] = None
    ) -> pd.DataFrame:
        if self.df is None or self.df.empty:
            return pd.DataFrame()
        
        df = self.df
        
        if bbox and len(bbox) == 4:
            if resolution is not None:
                bbox = self._expand_bbox(bbox, resolution)
            
            min_lng, min_lat, max_lng, max_lat = bbox
            mask = (
                (df["lng"] >= min_lng) &
                (df["lng"] <= max_lng) &
                (df["lat"] >= min_lat) &
                (df["lat"] <= max_lat)
            )
            df = df[mask]
        
        if start_hour is not None or end_hour is not None:
            if "timestamp" in df.columns:
                hours = df["timestamp"].dt.hour
                if start_hour is not None and end_hour is not None:
                    if start_hour <= end_hour:
                        time_mask = (hours >= start_hour) & (hours < end_hour)
                    else:
                        time_mask = (hours >= start_hour) | (hours < end_hour)
                    df = df[time_mask]
                elif start_hour is not None:
                    df = df[hours >= start_hour]
                else:
                    df = df[hours < end_hour]
            elif "hour" in df.columns:
                if start_hour is not None and end_hour is not None:
                    if start_hour <= end_hour:
                        time_mask = (df["hour"] >= start_hour) & (df["hour"] < end_hour)
                    else:
                        time_mask = (df["hour"] >= start_hour) | (df["hour"] < end_hour)
                    df = df[time_mask]
                elif start_hour is not None:
                    df = df[df["hour"] >= start_hour]
                else:
                    df = df[df["hour"] < end_hour]
        
        return df.copy()

    def get_hourly_data(self, hour: int) -> pd.DataFrame:
        return self.get_data(start_hour=hour, end_hour=hour + 1)

    def get_stats(self) -> Dict[str, float]:
        if self.df is None or self.df.empty:
            return {
                "total_points": 0,
                "min_lat": 0, "max_lat": 0,
                "min_lng": 0, "max_lng": 0,
                "speed_min": 0, "speed_max": 0, "speed_avg": 0
            }
        
        return {
            "total_points": int(len(self.df)),
            "min_lat": float(self.df["lat"].min()),
            "max_lat": float(self.df["lat"].max()),
            "min_lng": float(self.df["lng"].min()),
            "max_lng": float(self.df["lng"].max()),
            "speed_min": float(self.df["speed"].min()),
            "speed_max": float(self.df["speed"].max()),
            "speed_avg": float(self.df["speed"].mean())
        }

    def reload(self):
        self._load_data()


data_loader = DataLoader()

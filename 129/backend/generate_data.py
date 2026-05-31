import numpy as np
import pandas as pd
import os
import argparse
from typing import Tuple


def get_hourly_traffic_distribution() -> np.ndarray:
    """
    返回24小时的出租车流量分布（模拟真实城市交通模式）
    """
    hours = np.arange(24)
    
    base = 0.15
    morning_peak = 0.7 * np.exp(-((hours - 8) ** 2) / 2)
    midday = 0.35 * np.exp(-((hours - 12.5) ** 2) / 8)
    evening_peak = 0.75 * np.exp(-((hours - 18) ** 2) / 2.5)
    late_night = 0.2 * np.exp(-((hours - 22) ** 2) / 5)
    
    distribution = base + morning_peak + midday + evening_peak + late_night
    distribution = distribution / distribution.sum()
    
    return distribution


def generate_spatial_pattern(hour: float, center_lat: float, center_lng: float, 
                            spread: float, num_points: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    根据小时生成空间分布模式：
    - 早高峰 (7-10点): 从郊区向市中心聚集
    - 晚高峰 (17-20点): 从市中心向郊区扩散
    - 其他时间: 相对均匀分布
    """
    if 7 <= hour < 10:
        center_bias = (hour - 7) / 3
        lat_spread = spread * (1 - 0.3 * center_bias)
        lng_spread = spread * (1 - 0.3 * center_bias)
    elif 17 <= hour < 20:
        center_bias = (hour - 17) / 3
        lat_spread = spread * (0.7 + 0.3 * center_bias)
        lng_spread = spread * (0.7 + 0.3 * center_bias)
    elif 0 <= hour < 6:
        lat_spread = spread * 0.5
        lng_spread = spread * 0.5
    else:
        lat_spread = spread * 0.8
        lng_spread = spread * 0.8
    
    lat = center_lat + np.random.normal(0, lat_spread / 3, num_points)
    lng = center_lng + np.random.normal(0, lng_spread / 3, num_points)
    
    return lat, lng


def get_speed_by_hour(hour: np.ndarray, base_speed: np.ndarray) -> np.ndarray:
    """
    根据小时调整速度：
    - 早晚高峰速度慢
    - 凌晨速度快
    """
    speed_factors = np.ones_like(hour, dtype=float)
    
    morning_rush = (hour >= 7) & (hour <= 9)
    evening_rush = (hour >= 17) & (hour <= 19)
    night = (hour >= 0) & (hour <= 5)
    midday = (hour >= 11) & (hour <= 14)
    
    speed_factors[morning_rush] = 0.45
    speed_factors[evening_rush] = 0.4
    speed_factors[night] = 1.3
    speed_factors[midday] = 0.85
    
    return base_speed * speed_factors


def generate_taxi_data(
    num_points: int = 1_000_000,
    center: Tuple[float, float] = (31.2304, 121.4737),
    spread: float = 0.15,
    seed: int = 42
) -> pd.DataFrame:
    """
    Generate simulated taxi GPS data with realistic temporal patterns.
    
    Args:
        num_points: Number of data points to generate (default: 1,000,000)
        center: Center coordinates (lat, lng) - default: Shanghai
        spread: Spatial spread in degrees (default: 0.15 ~ 16km)
        seed: Random seed for reproducibility
    """
    np.random.seed(seed)
    
    print(f"Generating {num_points:,} taxi GPS points with 24-hour patterns...")
    
    center_lat, center_lng = center
    
    hourly_dist = get_hourly_traffic_distribution()
    points_per_hour = np.round(hourly_dist * num_points).astype(int)
    points_per_hour[-1] += num_points - points_per_hour.sum()
    
    all_data = []
    
    for hour in range(24):
        n_points = points_per_hour[hour]
        if n_points == 0:
            continue
        
        lat, lng = generate_spatial_pattern(hour, center_lat, center_lng, spread, n_points)
        
        lat = np.clip(lat, center_lat - spread, center_lat + spread)
        lng = np.clip(lng, center_lng - spread, center_lng + spread)
        
        num_taxis = min(5000, n_points // 50)
        taxi_ids = np.random.randint(0, num_taxis, n_points)
        
        base_speeds = np.random.exponential(35, n_points) + 15
        hours_arr = np.full(n_points, hour, dtype=float)
        speeds = get_speed_by_hour(hours_arr, base_speeds)
        speeds = np.clip(speeds, 0, 120)
        
        base_time = pd.Timestamp(f"2024-01-01 {hour:02d}:00:00")
        offsets = pd.to_timedelta(np.random.uniform(0, 3600, n_points), unit='s')
        timestamps = base_time + offsets
        
        all_data.append(pd.DataFrame({
            "taxi_id": taxi_ids,
            "timestamp": timestamps,
            "lat": lat.round(6),
            "lng": lng.round(6),
            "speed": speeds.round(2),
            "hour": hour
        }))
    
    df = pd.concat(all_data, ignore_index=True)
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)
    
    print(f"Data generated successfully!")
    print(f"  - Total points: {len(df):,}")
    print(f"  - Latitude range: [{df['lat'].min():.4f}, {df['lat'].max():.4f}]")
    print(f"  - Longitude range: [{df['lng'].min():.4f}, {df['lng'].max():.4f}]")
    print(f"  - Speed range: [{df['speed'].min():.2f}, {df['speed'].max():.2f}] km/h")
    print(f"  - Speed average: {df['speed'].mean():.2f} km/h")
    print(f"  - Unique taxis: {df['taxi_id'].nunique()}")
    print(f"  - Time range: {df['timestamp'].min()} to {df['timestamp'].max()}")
    
    hourly_counts = df.groupby(df['timestamp'].dt.hour).size()
    print(f"\n  Hourly distribution:")
    for h in range(24):
        count = hourly_counts.get(h, 0)
        bar = "█" * int(count / hourly_counts.max() * 30)
        print(f"    {h:02d}:00 | {bar} {count:,}")
    
    return df


def add_traffic_patterns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add realistic traffic patterns based on location.
    """
    print("\nAdding location-based traffic patterns...")
    
    df = df.copy()
    
    center_lat, center_lng = df["lat"].mean(), df["lng"].mean()
    
    dist_from_center = np.sqrt(
        (df["lat"] - center_lat) ** 2 +
        (df["lng"] - center_lng) ** 2
    )
    
    traffic_factor = 1 - 0.5 * np.exp(-dist_from_center / 0.03)
    df["speed"] = df["speed"] * traffic_factor
    
    df["speed"] = np.clip(df["speed"], 0, 120).round(2)
    
    print(f"  - New speed average: {df['speed'].mean():.2f} km/h")
    
    return df


def main():
    parser = argparse.ArgumentParser(description="Generate simulated taxi GPS data")
    parser.add_argument("--points", type=int, default=1_000_000,
                        help="Number of data points to generate (default: 1,000,000)")
    parser.add_argument("--city", type=str, default="shanghai",
                        choices=["shanghai", "beijing", "newyork", "london", "tokyo"],
                        help="City center coordinates")
    parser.add_argument("--output", type=str, default="./data/taxi_data.csv",
                        help="Output file path")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed")
    
    args = parser.parse_args()
    
    cities = {
        "shanghai": (31.2304, 121.4737),
        "beijing": (39.9042, 116.4074),
        "newyork": (40.7128, -74.0060),
        "london": (51.5074, -0.1278),
        "tokyo": (35.6762, 139.6503)
    }
    
    center = cities[args.city]
    
    df = generate_taxi_data(
        num_points=args.points,
        center=center,
        seed=args.seed
    )
    
    df = add_traffic_patterns(df)
    
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    
    print(f"Saving to {args.output}...")
    df.to_csv(args.output, index=False)
    
    file_size = os.path.getsize(args.output) / (1024 * 1024)
    print(f"File saved successfully! Size: {file_size:.2f} MB")
    
    print("\n" + "="*60)
    print("Sample data:")
    print(df.head(10).to_string(index=False))
    print("="*60)


if __name__ == "__main__":
    main()

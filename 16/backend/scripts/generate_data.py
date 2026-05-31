import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import argparse
from app.data_generator import LogisticsDataGenerator


def main():
    parser = argparse.ArgumentParser(description="Generate logistics simulation data")
    parser.add_argument("--warehouses", type=int, default=30, help="Number of warehouses")
    parser.add_argument("--vehicles", type=int, default=500, help="Number of vehicles")
    parser.add_argument("--orders", type=int, default=1000000, help="Number of orders (millions scale)")
    parser.add_argument("--days", type=int, default=90, help="Time period in days")
    parser.add_argument("--anomaly-prob", type=float, default=0.05, help="Anomaly probability (0-1)")
    
    args = parser.parse_args()
    
    generator = LogisticsDataGenerator()
    generator.generate_and_save_all(
        num_warehouses=args.warehouses,
        num_vehicles=args.vehicles,
        num_orders=args.orders,
        days=args.days,
        anomaly_prob=args.anomaly_prob,
    )


if __name__ == "__main__":
    main()

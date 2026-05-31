#!/usr/bin/env python3
"""
生成示例 CSV/Parquet 测试数据
"""

import csv
import os
import random
from datetime import datetime, timedelta
from typing import List, Dict


class SampleDataGenerator:
    """示例数据生成器"""

    REGIONS = ["East", "West", "North", "South", "Central"]
    STATUSES = ["completed", "pending", "cancelled", "refunded"]
    CATEGORIES = ["Electronics", "Clothing", "Books", "Home", "Sports", "Toys"]

    def __init__(self, output_dir: str = "data"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_orders(self, count: int = 10000, start_date: str = "2024-01-01"):
        """生成订单数据"""
        start = datetime.strptime(start_date, "%Y-%m-%d")
        rows = []

        for i in range(1, count + 1):
            order_date = start + timedelta(days=random.randint(0, 365))
            customer_id = random.randint(1, 1000)
            product_id = random.randint(1, 500)
            amount = round(random.uniform(10, 1000), 2)
            status = random.choice(self.STATUSES)
            hoodie_key = f"order_{i}_{order_date.strftime('%Y%m%d')}"
            commit_time = order_date.strftime("%Y%m%d%H%M%S")

            rows.append({
                "order_id": i,
                "customer_id": customer_id,
                "product_id": product_id,
                "order_date": order_date.strftime("%Y-%m-%d"),
                "amount": amount,
                "status": status,
                "_hoodie_record_key": hoodie_key,
                "_hoodie_commit_time": commit_time,
            })

        filepath = os.path.join(self.output_dir, "orders.csv")
        self._write_csv(filepath, rows)
        print(f"✓ 生成订单数据: {filepath} ({count} 条)")
        return filepath

    def generate_customers(self, count: int = 1000, start_date: str = "2023-01-01"):
        """生成客户数据"""
        start = datetime.strptime(start_date, "%Y-%m-%d")
        rows = []

        for i in range(1, count + 1):
            signup_date = start + timedelta(days=random.randint(0, 365))
            region = random.choice(self.REGIONS)
            hoodie_key = f"customer_{i}"
            commit_time = signup_date.strftime("%Y%m%d%H%M%S")

            rows.append({
                "customer_id": i,
                "name": f"Customer_{i}",
                "email": f"customer_{i}@example.com",
                "region": region,
                "signup_date": signup_date.strftime("%Y-%m-%d"),
                "_hoodie_record_key": hoodie_key,
                "_hoodie_commit_time": commit_time,
            })

        filepath = os.path.join(self.output_dir, "customers.csv")
        self._write_csv(filepath, rows)
        print(f"✓ 生成客户数据: {filepath} ({count} 条)")
        return filepath

    def generate_products(self, count: int = 500):
        """生成产品数据"""
        rows = []

        for i in range(1, count + 1):
            category = random.choice(self.CATEGORIES)
            price = round(random.uniform(5, 500), 2)
            hoodie_key = f"product_{i}"
            commit_time = datetime.now().strftime("%Y%m%d%H%M%S")

            rows.append({
                "product_id": i,
                "name": f"Product_{i}",
                "category": category,
                "price": price,
                "_hoodie_record_key": hoodie_key,
                "_hoodie_commit_time": commit_time,
            })

        filepath = os.path.join(self.output_dir, "products.csv")
        self._write_csv(filepath, rows)
        print(f"✓ 生成产品数据: {filepath} ({count} 条)")
        return filepath

    def generate_with_duplicates(self, base_count: int = 1000,
                                  duplicate_ratio: float = 0.1):
        """生成包含重复数据的订单数据"""
        rows = []
        unique_count = int(base_count * (1 - duplicate_ratio))
        duplicate_count = base_count - unique_count

        start = datetime.strptime("2024-01-01", "%Y-%m-%d")

        for i in range(1, unique_count + 1):
            order_date = start + timedelta(days=random.randint(0, 365))
            hoodie_key = f"order_{i}_{order_date.strftime('%Y%m%d')}"
            commit_time = order_date.strftime("%Y%m%d%H%M%S")

            rows.append({
                "order_id": i,
                "customer_id": random.randint(1, 1000),
                "product_id": random.randint(1, 500),
                "order_date": order_date.strftime("%Y-%m-%d"),
                "amount": round(random.uniform(10, 1000), 2),
                "status": random.choice(self.STATUSES),
                "_hoodie_record_key": hoodie_key,
                "_hoodie_commit_time": commit_time,
            })

        for i in range(duplicate_count):
            source_idx = random.randint(0, unique_count - 1)
            source = rows[source_idx]
            new_date = start + timedelta(days=random.randint(0, 365))

            rows.append({
                "order_id": unique_count + i + 1,
                "customer_id": source["customer_id"],
                "product_id": source["product_id"],
                "order_date": new_date.strftime("%Y-%m-%d"),
                "amount": source["amount"],
                "status": source["status"],
                "_hoodie_record_key": source["_hoodie_record_key"],
                "_hoodie_commit_time": new_date.strftime("%Y%m%d%H%M%S"),
            })

        random.shuffle(rows)

        filepath = os.path.join(self.output_dir, "orders_with_duplicates.csv")
        self._write_csv(filepath, rows)
        print(f"✓ 生成含重复数据: {filepath} ({len(rows)} 条, 重复率: {duplicate_ratio:.0%})")
        return filepath

    @staticmethod
    def _write_csv(filepath: str, rows: List[Dict]):
        """写入 CSV 文件"""
        if not rows:
            return

        fieldnames = list(rows[0].keys())
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description="生成示例数据")
    parser.add_argument("--orders", type=int, default=10000, help="订单数量")
    parser.add_argument("--customers", type=int, default=1000, help="客户数量")
    parser.add_argument("--products", type=int, default=500, help="产品数量")
    parser.add_argument("--output-dir", default="data", help="输出目录")
    parser.add_argument("--with-duplicates", action="store_true", help="生成含重复数据")

    args = parser.parse_args()

    generator = SampleDataGenerator(args.output_dir)

    print("=" * 50)
    print("📦 生成示例数据")
    print("=" * 50)

    generator.generate_customers(args.customers)
    generator.generate_products(args.products)
    generator.generate_orders(args.orders)

    if args.with_duplicates:
        generator.generate_with_duplicates(args.orders, duplicate_ratio=0.1)

    print("\n✅ 数据生成完成!")
    print(f"📁 输出目录: {os.path.abspath(args.output_dir)}")


if __name__ == "__main__":
    main()

import csv
import random
from datetime import datetime, timedelta

def generate_large_csv(file_path, total_rows=300000):
    categories = ["electronics", "accessories", "furniture", "software", "books"]
    statuses = ["shipped", "pending", "processing", "returned"]
    products = [
        ("MacBook Pro", 1599.99),
        ("iPhone 15", 899.00),
        ("Wireless Mouse", 29.99),
        ("USB-C Cable", 15.50),
        ("Mechanical Keyboard", 129.99),
        ("Monitor 27", 349.00),
        ("Desk Mat", 25.00),
        ("Webcam HD", 79.99),
        ("Laptop Stand", 45.00),
        ("Headphones Pro", 299.99),
    ]

    start_date = datetime(2024, 1, 1)
    batch_2_start = total_rows // 3
    batch_3_start = 2 * total_rows // 3

    with open(file_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "product_name", "price", "quantity", "order_date", "status", "score", "category"])

        for i in range(1, total_rows + 1):
            product_name, price = random.choice(products)
            category = random.choice(categories)
            status = random.choice(statuses)
            score = round(random.uniform(3.0, 5.0), 1)

            if i < batch_2_start:
                quantity = random.randint(1, 100)
                order_date = (start_date + timedelta(days=random.randint(0, 30))).strftime("%Y-%m-%d")
                row_id = i
            elif i < batch_3_start:
                if random.random() < 0.15:
                    quantity = "N/A"
                else:
                    quantity = random.randint(1, 100)
                order_date = (start_date + timedelta(days=random.randint(30, 60))).strftime("%m/%d/%Y")
                row_id = i
            else:
                if random.random() < 0.3:
                    quantity = "Out of Stock"
                elif random.random() < 0.1:
                    quantity = "N/A"
                else:
                    quantity = random.randint(1, 100)
                if random.random() < 0.2:
                    order_date = (start_date + timedelta(days=random.randint(60, 90))).strftime("%b %d %Y")
                elif random.random() < 0.1:
                    order_date = "Pending"
                else:
                    order_date = (start_date + timedelta(days=random.randint(60, 90))).strftime("%Y-%m-%d")
                if random.random() < 0.05:
                    row_id = f"PRE-{i}"
                else:
                    row_id = i

            writer.writerow([row_id, product_name, price, quantity, order_date, status, score, category])

    print(f"生成完成: {file_path} (共 {total_rows} 行)")
    print(f"  批次 1 (0-{batch_2_start}): quantity = 纯整数, order_date = YYYY-MM-DD, id = 纯数字")
    print(f"  批次 2 ({batch_2_start}-{batch_3_start}): 15% quantity = N/A, order_date = MM/DD/YYYY")
    print(f"  批次 3 ({batch_3_start}-{total_rows}): 35% quantity = 字符串, 部分 order_date = 英文格式/Pending, 5% id = 带前缀")

if __name__ == "__main__":
    generate_large_csv("e:/trae/127/large_sample_with_drift.csv", total_rows=300000)

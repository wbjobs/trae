KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"
KAFKA_TICK_TOPIC = "stock_ticks"
KAFKA_ANOMALY_TOPIC = "stock_anomalies"
KAFKA_TICK_PARTITIONS = 8
KAFKA_CONSUMER_WORKERS = 4

TICKS_PER_SECOND = 5000

PERFORMANCE = {
    "producer_batch_size": 131072,
    "producer_linger_ms": 5,
    "producer_compression_type": "snappy",
    "consumer_max_poll_records": 2000,
    "consumer_max_poll_interval_ms": 30000,
    "consumer_fetch_min_bytes": 102400,
    "consumer_fetch_max_wait_ms": 100,
    "detection_batch_size": 500,
    "detection_threads": 4,
    "websocket_bulk_interval": 0.1,
}


STOCKS = [
    {"symbol": "AAPL", "name": "苹果公司", "base_price": 178.50, "region": "北京"},
    {"symbol": "GOOGL", "name": "谷歌", "base_price": 141.80, "region": "上海"},
    {"symbol": "MSFT", "name": "微软", "base_price": 378.90, "region": "深圳"},
    {"symbol": "AMZN", "name": "亚马逊", "base_price": 178.25, "region": "杭州"},
    {"symbol": "TSLA", "name": "特斯拉", "base_price": 248.50, "region": "广州"},
    {"symbol": "META", "name": "Meta", "base_price": 505.75, "region": "成都"},
    {"symbol": "NVDA", "name": "英伟达", "base_price": 875.30, "region": "武汉"},
    {"symbol": "BABA", "name": "阿里巴巴", "base_price": 85.60, "region": "南京"},
    {"symbol": "JD", "name": "京东", "base_price": 28.45, "region": "西安"},
    {"symbol": "PDD", "name": "拼多多", "base_price": 145.20, "region": "重庆"},
]

REGION_COORDS = {
    "北京": [116.4074, 39.9042],
    "上海": [121.4737, 31.2304],
    "深圳": [114.0579, 22.5431],
    "杭州": [120.1551, 30.2741],
    "广州": [113.2644, 23.1291],
    "成都": [104.0668, 30.5728],
    "武汉": [114.3055, 30.5928],
    "南京": [118.7969, 32.0603],
    "西安": [108.9398, 34.3416],
    "重庆": [106.5516, 29.5630],
}

ANOMALY_THRESHOLDS = {
    "flash_crash_pct": 2.0,
    "flash_crash_window": 5,
    "cancel_rate_threshold": 60.0,
    "cancel_rate_window": 10,
    "large_order_multiple": 10,
}

WEBSOCKET_HOST = "localhost"
WEBSOCKET_PORT = 8765

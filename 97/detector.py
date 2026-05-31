import json
import time
import threading
import queue
from collections import defaultdict, deque
from datetime import datetime
from kafka import KafkaConsumer, KafkaProducer, TopicPartition
from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TICK_TOPIC,
    KAFKA_ANOMALY_TOPIC,
    KAFKA_TICK_PARTITIONS,
    KAFKA_CONSUMER_WORKERS,
    ANOMALY_THRESHOLDS,
    PERFORMANCE,
    STOCKS,
)


class SlidingWindowMax:
    def __init__(self, window_ms):
        self.window_ms = window_ms
        self.data = deque()
        self.max_deque = deque()

    def add(self, timestamp, value):
        while self.data and self.data[0][0] <= timestamp - self.window_ms:
            old_ts, old_val = self.data.popleft()
            if self.max_deque and self.max_deque[0] == old_val:
                self.max_deque.popleft()

        self.data.append((timestamp, value))

        while self.max_deque and self.max_deque[-1] < value:
            self.max_deque.pop()
        self.max_deque.append(value)

    def get_max(self):
        return self.max_deque[0] if self.max_deque else None

    def size(self):
        return len(self.data)


class OrderWindow:
    def __init__(self, window_ms):
        self.window_ms = window_ms
        self.data = deque()
        self.cancel_count = 0
        self.total_count = 0

    def add(self, timestamp, order_type):
        while self.data and self.data[0][0] <= timestamp - self.window_ms:
            old_ts, old_type = self.data.popleft()
            self.total_count -= 1
            if old_type == "cancel":
                self.cancel_count -= 1

        self.data.append((timestamp, order_type))
        self.total_count += 1
        if order_type == "cancel":
            self.cancel_count += 1

    def get_cancel_rate(self):
        if self.total_count < 10:
            return 0
        return (self.cancel_count / self.total_count) * 100

    def size(self):
        return self.total_count


class AnomalyDetectorWorker:
    def __init__(self, worker_id, result_queue):
        self.worker_id = worker_id
        self.result_queue = result_queue
        self.consumer = None
        self.running = False

        flash_window = ANOMALY_THRESHOLDS["flash_crash_window"] * 1000
        cancel_window = ANOMALY_THRESHOLDS["cancel_rate_window"] * 1000

        self.price_windows = defaultdict(lambda: SlidingWindowMax(flash_window))
        self.order_windows = defaultdict(lambda: OrderWindow(cancel_window))
        self.last_anomaly_time = defaultdict(lambda: 0)
        self.anomaly_cooldown = 2

        self.flash_threshold = ANOMALY_THRESHOLDS["flash_crash_pct"]
        self.cancel_threshold = ANOMALY_THRESHOLDS["cancel_rate_threshold"]
        self.large_order_multiple = ANOMALY_THRESHOLDS["large_order_multiple"]

    def _create_consumer(self):
        self.consumer = KafkaConsumer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="latest",
            enable_auto_commit=True,
            group_id="anomaly_detector",
            max_poll_records=PERFORMANCE["consumer_max_poll_records"],
            max_poll_interval_ms=PERFORMANCE["consumer_max_poll_interval_ms"],
            fetch_min_bytes=PERFORMANCE["consumer_fetch_min_bytes"],
            fetch_max_wait_ms=PERFORMANCE["consumer_fetch_max_wait_ms"],
            receive_buffer_bytes=262144,
        )

        partitions = []
        for i in range(self.worker_id, KAFKA_TICK_PARTITIONS, KAFKA_CONSUMER_WORKERS):
            partitions.append(TopicPartition(KAFKA_TICK_TOPIC, i))

        if partitions:
            self.consumer.assign(partitions)
            print(f"[Worker-{self.worker_id}] 分配分区: {[p.partition for p in partitions]}")

    def _check_flash_crash(self, symbol, price, timestamp):
        self.price_windows[symbol].add(timestamp, price)
        window = self.price_windows[symbol]

        if window.size() < 2:
            return None

        highest = window.get_max()
        if highest is None or highest <= 0:
            return None

        drop_pct = ((highest - price) / highest) * 100
        if drop_pct > self.flash_threshold:
            return {
                "type": "flash_crash",
                "severity": "high",
                "description": f"闪崩警报: 5秒内下跌 {drop_pct:.2f}%",
                "details": {
                    "highest_price": highest,
                    "current_price": price,
                    "drop_pct": round(drop_pct, 2),
                },
            }
        return None

    def _check_cancel_rate(self, symbol, order_type, timestamp):
        self.order_windows[symbol].add(timestamp, order_type)
        cancel_rate = self.order_windows[symbol].get_cancel_rate()

        if cancel_rate > self.cancel_threshold:
            return {
                "type": "high_cancel_rate",
                "severity": "medium",
                "description": f"频繁撤单警报: 撤单率 {cancel_rate:.1f}%",
                "details": {
                    "cancel_rate": round(cancel_rate, 2),
                },
            }
        return None

    def _check_large_order(self, volume, avg_volume, order_type):
        if volume > avg_volume * self.large_order_multiple:
            ratio = volume / avg_volume
            return {
                "type": "large_order",
                "severity": "high" if ratio > 15 else "medium",
                "description": f"大单警报: 成交量 {volume} 是日均 {avg_volume} 的 {ratio:.1f} 倍",
                "details": {
                    "volume": volume,
                    "daily_avg_volume": avg_volume,
                    "ratio": round(ratio, 2),
                    "order_type": order_type,
                },
            }
        return None

    def _process_tick(self, tick):
        symbol = tick.get("s")
        if not symbol:
            return

        price = tick["p"]
        timestamp = tick["ts"]
        order_type = tick["ot"]
        avg_volume = tick["avg"]
        name = tick["n"]
        region = tick["r"]

        anomalies = []

        flash = self._check_flash_crash(symbol, price, timestamp)
        if flash:
            anomalies.append(flash)

        cancel = self._check_cancel_rate(symbol, order_type, timestamp)
        if cancel:
            anomalies.append(cancel)

        large = self._check_large_order(tick["v"], avg_volume, order_type)
        if large:
            anomalies.append(large)

        current_time = time.time()
        for anomaly in anomalies:
            key = (symbol, anomaly["type"])
            if current_time - self.last_anomaly_time[key] >= self.anomaly_cooldown:
                self.last_anomaly_time[key] = current_time

                event = {
                    **anomaly,
                    "symbol": symbol,
                    "name": name,
                    "region": region,
                    "price": price,
                    "timestamp": datetime.fromtimestamp(current_time).isoformat(),
                    "timestamp_ms": int(current_time * 1000),
                }
                self.result_queue.put(event)

    def start(self):
        self._create_consumer()
        if not self.consumer:
            return

        self.running = True
        batch_size = PERFORMANCE["detection_batch_size"]
        batch = []

        try:
            while self.running:
                records = self.consumer.poll(timeout_ms=100)

                for _, messages in records.items():
                    for msg in messages:
                        batch.append(msg.value)
                        if len(batch) >= batch_size:
                            for tick in batch:
                                self._process_tick(tick)
                            batch = []

                if batch:
                    for tick in batch:
                        self._process_tick(tick)
                    batch = []

        except Exception as e:
            print(f"[Worker-{self.worker_id}] 错误: {e}")
        finally:
            self.running = False
            if self.consumer:
                self.consumer.close()


class AnomalyResultSender:
    def __init__(self, result_queue):
        self.result_queue = result_queue
        self.producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
            acks=0,
            linger_ms=10,
            batch_size=65536,
            compression_type="snappy",
        )
        self.running = False
        self.anomaly_count = 0
        self.last_report = time.time()

    def start(self):
        self.running = True
        batch = []
        last_send = time.time()

        while self.running:
            try:
                event = self.result_queue.get(timeout=0.05)
                batch.append(event)

                if len(batch) >= 100 or (time.time() - last_send) > 0.1:
                    for e in batch:
                        self.producer.send(KAFKA_ANOMALY_TOPIC, value=e)
                    self.producer.flush()
                    self.anomaly_count += len(batch)
                    batch = []
                    last_send = time.time()
            except queue.Empty:
                if batch:
                    for e in batch:
                        self.producer.send(KAFKA_ANOMALY_TOPIC, value=e)
                    self.producer.flush()
                    self.anomaly_count += len(batch)
                    batch = []
                    last_send = time.time()

            now = time.time()
            if now - self.last_report >= 1:
                print(f"[Sender] 已发送异常: {self.anomaly_count} | 队列: {self.result_queue.qsize()}")
                self.last_report = now

        if batch:
            for e in batch:
                self.producer.send(KAFKA_ANOMALY_TOPIC, value=e)
            self.producer.flush()

        self.producer.close()

    def stop(self):
        self.running = False


class AnomalyDetector:
    def __init__(self):
        self.workers = []
        self.result_queue = queue.Queue(maxsize=100000)
        self.sender = AnomalyResultSender(self.result_queue)
        self.running = False

    def start(self):
        self.running = True
        print(f"启动 {KAFKA_CONSUMER_WORKERS} 个检测工作线程...")

        sender_thread = threading.Thread(target=self.sender.start, daemon=True, name="sender")
        sender_thread.start()

        for i in range(KAFKA_CONSUMER_WORKERS):
            worker = AnomalyDetectorWorker(i, self.result_queue)
            self.workers.append(worker)
            t = threading.Thread(target=worker.start, daemon=True, name=f"worker-{i}")
            t.start()

        print("异常检测引擎启动完成！")
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n正在停止...")
            self.stop()

    def stop(self):
        self.running = False
        self.sender.stop()
        print("异常检测引擎已停止")


if __name__ == "__main__":
    detector = AnomalyDetector()
    detector.start()

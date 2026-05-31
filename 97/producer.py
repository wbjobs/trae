import json
import random
import time
import threading
import queue
from datetime import datetime
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable
from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TICK_TOPIC,
    TICKS_PER_SECOND,
    STOCKS,
    PERFORMANCE,
)


class StockTickProducer:
    def __init__(self):
        self.producer = None
        self.running = False
        self.stock_prices = {s["symbol"]: s["base_price"] for s in STOCKS}
        self.stock_info = {s["symbol"]: s for s in STOCKS}
        self.daily_avg_volume = {s["symbol"]: random.randint(500, 2000) for s in STOCKS}
        self._tick_buffer = queue.Queue(maxsize=100000)
        self._price_lock = threading.Lock()
        self._connect()

    def _connect(self):
        max_retries = 5
        retry_count = 0
        while retry_count < max_retries:
            try:
                self.producer = KafkaProducer(
                    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                    value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
                    acks=0,
                    linger_ms=PERFORMANCE["producer_linger_ms"],
                    batch_size=PERFORMANCE["producer_batch_size"],
                    compression_type=PERFORMANCE["producer_compression_type"],
                    max_request_size=2097152,
                    send_buffer_bytes=131072,
                )
                print(f"已连接到 Kafka: {KAFKA_BOOTSTRAP_SERVERS}")
                return
            except NoBrokersAvailable:
                retry_count += 1
                wait_time = min(2 ** retry_count, 10)
                print(f"Kafka 连接失败，{wait_time} 秒后重试 ({retry_count}/{max_retries})...")
                time.sleep(wait_time)
        raise Exception("无法连接到 Kafka 服务器")

    def _generate_tick(self):
        stock = random.choice(STOCKS)
        symbol = stock["symbol"]

        with self._price_lock:
            current_price = self.stock_prices[symbol]
            change_pct = random.uniform(-0.015, 0.015)
            if random.random() < 0.015:
                change_pct = random.uniform(-0.06, 0.06)

            new_price = round(current_price * (1 + change_pct), 2)
            self.stock_prices[symbol] = new_price

        order_type = random.choice(["buy", "sell", "cancel"])
        if random.random() < 0.08:
            order_type = "cancel"

        avg_vol = self.daily_avg_volume[symbol]
        if random.random() < 0.015:
            volume = random.randint(avg_vol * 12, avg_vol * 30)
        else:
            volume = random.randint(max(1, avg_vol // 10), avg_vol * 2)

        now_ms = int(time.time() * 1000)
        tick = {
            "s": symbol,
            "n": stock["name"],
            "r": stock["region"],
            "p": new_price,
            "pp": current_price,
            "cp": round(change_pct * 100, 2),
            "v": volume,
            "ot": order_type,
            "ts": now_ms,
            "avg": avg_vol,
        }
        return tick

    def _sender_thread(self):
        batch = []
        last_send = time.time()

        while self.running or not self._tick_buffer.empty():
            try:
                tick = self._tick_buffer.get(timeout=0.001)
                batch.append(tick)

                if len(batch) >= 2000 or (time.time() - last_send) > 0.01:
                    for t in batch:
                        self.producer.send(KAFKA_TICK_TOPIC, value=t)
                    self.producer.flush()
                    batch = []
                    last_send = time.time()
            except queue.Empty:
                if batch:
                    for t in batch:
                        self.producer.send(KAFKA_TICK_TOPIC, value=t)
                    self.producer.flush()
                    batch = []
                    last_send = time.time()
            except Exception as e:
                print(f"发送消息失败: {e}")
                batch = []

        if batch:
            for t in batch:
                self.producer.send(KAFKA_TICK_TOPIC, value=t)
            self.producer.flush()

    def _generator_thread(self):
        interval = 1.0 / TICKS_PER_SECOND
        target = time.perf_counter()

        while self.running:
            tick = self._generate_tick()
            try:
                self._tick_buffer.put_nowait(tick)
            except queue.Full:
                pass

            target += interval
            sleep_time = target - time.perf_counter()
            if sleep_time > 0:
                time.sleep(sleep_time)

    def _monitor_thread(self):
        last_count = 0
        last_time = time.time()

        while self.running:
            time.sleep(1)
            current_count = self._tick_buffer.qsize()
            now = time.time()
            elapsed = now - last_time
            sent = last_count - current_count if last_count >= current_count else 0
            rate = sent / elapsed if elapsed > 0 else 0

            print(f"[Producer] 速率: {rate:.0f}/s | 队列: {current_count} | 积压: {current_count > 10000}")

            last_count = current_count
            last_time = now

    def start(self):
        self.running = True
        print(f"开始生成 tick 数据，速率: {TICKS_PER_SECOND} 条/秒")

        generator_threads = []
        num_generators = max(1, TICKS_PER_SECOND // 2000)
        for i in range(num_generators):
            t = threading.Thread(target=self._generator_thread, daemon=True, name=f"generator-{i}")
            generator_threads.append(t)
            t.start()

        sender_thread = threading.Thread(target=self._sender_thread, daemon=True, name="sender")
        sender_thread.start()

        monitor_thread = threading.Thread(target=self._monitor_thread, daemon=True, name="monitor")
        monitor_thread.start()

        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()

    def stop(self):
        self.running = False
        print("正在停止生产者，等待队列清空...")
        time.sleep(2)
        if self.producer:
            self.producer.flush()
            self.producer.close()
        print("生产者已停止")


if __name__ == "__main__":
    producer = StockTickProducer()
    producer.start()

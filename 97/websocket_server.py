import asyncio
import json
import threading
import time
import queue
import websockets
from kafka import KafkaConsumer
from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_ANOMALY_TOPIC,
    WEBSOCKET_HOST,
    WEBSOCKET_PORT,
    PERFORMANCE,
)


class WebSocketServer:
    def __init__(self):
        self.clients = set()
        self.anomalies = []
        self.max_history = 200
        self._anomaly_queue = queue.Queue(maxsize=10000)
        self.stats = {
            "total_anomalies": 0,
            "by_type": {"flash_crash": 0, "high_cancel_rate": 0, "large_order": 0},
            "by_region": {},
            "by_symbol": {},
        }
        self._stats_lock = threading.Lock()
        self._clients_lock = asyncio.Lock()

    async def register(self, websocket):
        async with self._clients_lock:
            self.clients.add(websocket)
        print(f"客户端已连接，当前连接数: {len(self.clients)}")

        try:
            if self.anomalies:
                history_msg = json.dumps({
                    "type": "history",
                    "data": self.anomalies[-50:],
                    "stats": self.stats,
                }, ensure_ascii=False)
                await websocket.send(history_msg)

            async for _ in websocket:
                pass
        finally:
            async with self._clients_lock:
                self.clients.discard(websocket)
            print(f"客户端已断开，当前连接数: {len(self.clients)}")

    async def broadcast(self, message):
        if not self.clients:
            return

        disconnected = set()
        async with self._clients_lock:
            for client in list(self.clients):
                try:
                    await client.send(message)
                except Exception:
                    disconnected.add(client)
            for client in disconnected:
                self.clients.discard(client)

    def _update_stats_batch(self, anomalies):
        with self._stats_lock:
            for anomaly in anomalies:
                self.stats["total_anomalies"] += 1
                atype = anomaly["type"]
                self.stats["by_type"][atype] = self.stats["by_type"].get(atype, 0) + 1

                region = anomaly["region"]
                self.stats["by_region"][region] = self.stats["by_region"].get(region, 0) + 1

                symbol = anomaly["symbol"]
                self.stats["by_symbol"][symbol] = self.stats["by_symbol"].get(symbol, 0) + 1

    def kafka_listener(self):
        consumer = KafkaConsumer(
            KAFKA_ANOMALY_TOPIC,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="latest",
            group_id="websocket_server",
            max_poll_records=1000,
            fetch_min_bytes=10240,
            fetch_max_wait_ms=50,
        )

        print(f"WebSocket 服务器已启动，监听 Kafka 主题: {KAFKA_ANOMALY_TOPIC}")

        batch = []
        last_flush = time.time()
        flush_interval = 0.05

        try:
            while True:
                records = consumer.poll(timeout_ms=100)

                for _, messages in records.items():
                    for msg in messages:
                        batch.append(msg.value)

                        if len(batch) >= 100 or (time.time() - last_flush) >= flush_interval:
                            self._process_batch(batch)
                            batch = []
                            last_flush = time.time()

                if batch and (time.time() - last_flush) >= flush_interval:
                    self._process_batch(batch)
                    batch = []
                    last_flush = time.time()
        except Exception as e:
            print(f"Kafka 监听错误: {e}")
        finally:
            consumer.close()

    def _process_batch(self, batch):
        if not batch:
            return

        self.anomalies.extend(batch)
        if len(self.anomalies) > self.max_history:
            del self.anomalies[:len(self.anomalies) - self.max_history]

        self._update_stats_batch(batch)

        try:
            self._anomaly_queue.put_nowait(batch)
        except queue.Full:
            pass

    async def broadcast_worker(self):
        while True:
            try:
                batch = self._anomaly_queue.get(timeout=0.1)

                ws_message = json.dumps({
                    "type": "batch",
                    "data": batch,
                    "stats": self.stats,
                }, ensure_ascii=False)

                await self.broadcast(ws_message)
            except queue.Empty:
                await asyncio.sleep(0.05)
            except Exception as e:
                print(f"广播错误: {e}")

    async def start_server(self):
        kafka_thread = threading.Thread(target=self.kafka_listener, daemon=True)
        kafka_thread.start()

        asyncio.create_task(self.broadcast_worker())

        async with websockets.serve(self.register, WEBSOCKET_HOST, WEBSOCKET_PORT):
            print(f"WebSocket 服务运行在 ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
            await asyncio.Future()


if __name__ == "__main__":
    server = WebSocketServer()
    asyncio.run(server.start_server())

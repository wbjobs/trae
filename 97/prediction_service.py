import json
import time
import threading
import queue
from kafka import KafkaConsumer, KafkaProducer, TopicPartition
from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TICK_TOPIC,
    KAFKA_TICK_PARTITIONS,
    PERFORMANCE,
)
from predictor import PredictionManager


class PredictionService:
    def __init__(self):
        self.prediction_manager = PredictionManager()
        self.result_queue = queue.Queue(maxsize=1000)
        self.running = False
        self.consumer = None
        self.producer = None

    def _create_consumer(self):
        self.consumer = KafkaConsumer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="latest",
            enable_auto_commit=True,
            group_id="prediction_service",
            max_poll_records=1000,
            fetch_min_bytes=10240,
            fetch_max_wait_ms=50,
        )

        partitions = []
        for i in range(KAFKA_TICK_PARTITIONS):
            partitions.append(TopicPartition(KAFKA_TICK_TOPIC, i))
        self.consumer.assign(partitions)
        print("[Prediction] 消费者已初始化")

    def _create_producer(self):
        self.producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
            acks=0,
            linger_ms=10,
            batch_size=32768,
            compression_type="snappy",
        )

    def start(self):
        self.running = True
        self._create_consumer()
        self._create_producer()

        sender_thread = threading.Thread(target=self._sender_loop, daemon=True, name="pred-sender")
        sender_thread.start()

        print("预测服务启动，每秒生成闪崩概率预测...")

        batch = []
        last_predict = time.time()
        predict_interval = 1.0

        try:
            while self.running:
                records = self.consumer.poll(timeout_ms=100)

                for _, messages in records.items():
                    for msg in messages:
                        tick = msg.value
                        self.prediction_manager.update_with_tick(tick)

                        batch.append(tick)
                        if len(batch) >= 500:
                            batch = []

                current_time = time.time()
                if current_time - last_predict >= predict_interval:
                    predictions = self.prediction_manager.get_all_predictions(current_time)
                    if predictions:
                        self.result_queue.put({
                            "type": "prediction",
                            "timestamp": current_time,
                            "predictions": predictions,
                        })
                        high_risk = {s: p for s, p in predictions.items() if p["probability"] > 0.7}
                        if high_risk:
                            print(f"[Prediction] 高风险股票: {list(high_risk.keys())}")
                    last_predict = current_time

        except Exception as e:
            print(f"[Prediction] 错误: {e}")
        finally:
            self.running = False
            if self.consumer:
                self.consumer.close()
            if self.producer:
                self.producer.close()

    def _sender_loop(self):
        import asyncio
        from config import WEBSOCKET_HOST, WEBSOCKET_PORT
        import websockets

        async def broadcast_server():
            clients = set()

            async def register(websocket):
                clients.add(websocket)
                print(f"[Prediction WS] 客户端连接，当前: {len(clients)}")
                try:
                    async for _ in websocket:
                        pass
                finally:
                    clients.discard(websocket)
                    print(f"[Prediction WS] 客户端断开，当前: {len(clients)}")

            async def handle_client(websocket):
                await register(websocket)

            async def broadcast_worker():
                while self.running:
                    try:
                        data = self.result_queue.get(timeout=0.1)
                        msg = json.dumps(data, ensure_ascii=False)

                        disconnected = set()
                        for client in list(clients):
                            try:
                                await client.send(msg)
                            except Exception:
                                disconnected.add(client)
                        for client in disconnected:
                            clients.discard(client)

                    except queue.Empty:
                        await asyncio.sleep(0.05)
                    except Exception as e:
                        print(f"[Prediction WS] 广播错误: {e}")

            asyncio.create_task(broadcast_worker())
            async with websockets.serve(handle_client, "localhost", 8766):
                print("[Prediction WS] 运行在 ws://localhost:8766")
                await asyncio.Future()

        asyncio.run(broadcast_server())

    def stop(self):
        self.running = False


if __name__ == "__main__":
    service = PredictionService()
    try:
        service.start()
    except KeyboardInterrupt:
        service.stop()

import json
import time
import threading
import redis
from config import (
    REDIS_HOST,
    REDIS_PORT,
    REDIS_DB,
    STREAM_NAME,
    RESULT_CHANNEL,
    SIGMA_CHANNEL,
    BATCH_SIZE,
    WINDOW_SIZE,
    DEFAULT_SIGMA
)
from anomaly_detector import AnomalyDetector
from sigma_manager import get_current_sigma


def sigma_listener(r: redis.Redis, detector: AnomalyDetector):
    pubsub = r.pubsub()
    pubsub.subscribe(SIGMA_CHANNEL)
    
    print(f"[Worker] Sigma监听器已启动")
    
    for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"].decode())
                new_sigma = data["sigma"]
                detector.sigma = new_sigma
                print(f"[Worker] Sigma阈值已更新为: {new_sigma}")
            except (json.JSONDecodeError, KeyError) as e:
                print(f"[Worker] Sigma更新解析失败: {e}")


def run_worker():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    
    initial_sigma = get_current_sigma()
    detector = AnomalyDetector(window_size=WINDOW_SIZE, sigma=initial_sigma)
    
    print(f"[Worker] 已启动，初始Sigma: {initial_sigma}, 批量大小: {BATCH_SIZE}")
    
    listener_thread = threading.Thread(target=sigma_listener, args=(r, detector), daemon=True)
    listener_thread.start()
    
    consumer_group = "anomaly_workers"
    consumer_name = "worker_1"
    
    try:
        r.xgroup_create(STREAM_NAME, consumer_group, id="0", mkstream=True)
    except redis.exceptions.ResponseError:
        pass
    
    while True:
        try:
            streams = r.xreadgroup(
                groupname=consumer_group,
                consumername=consumer_name,
                streams={STREAM_NAME: ">"},
                count=BATCH_SIZE,
                block=100
            )
            
            if not streams:
                time.sleep(0.01)
                continue
            
            for stream_name, messages in streams:
                if not messages:
                    continue
                
                batch_data = []
                message_ids = []
                
                for msg_id, fields in messages:
                    try:
                        data = json.loads(fields[b"data"].decode())
                        batch_data.append(data)
                        message_ids.append(msg_id)
                    except (json.JSONDecodeError, KeyError) as e:
                        print(f"[Worker] 解析消息失败: {e}")
                        continue
                
                if not batch_data:
                    continue
                
                prices = [item["price"] for item in batch_data]
                results = detector.detect_batch(prices)
                
                pipeline = r.pipeline()
                
                for data, (is_anomaly, mean, std, z_score) in zip(batch_data, results):
                    message = {
                        "type": "tick",
                        "data": data,
                        "anomaly": is_anomaly,
                        "current_sigma": detector.sigma
                    }
                    if is_anomaly:
                        message["anomaly_info"] = {
                            "mean": round(mean, 2),
                            "std": round(std, 2),
                            "z_score": round(z_score, 2)
                        }
                    
                    pipeline.publish(RESULT_CHANNEL, json.dumps(message))
                
                for msg_id in message_ids:
                    pipeline.xack(STREAM_NAME, consumer_group, msg_id)
                
                pipeline.execute()
                
        except Exception as e:
            print(f"[Worker] 错误: {e}")
            time.sleep(1)


if __name__ == "__main__":
    run_worker()

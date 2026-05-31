import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "multimodal_search",
    broker=redis_url,
    backend=redis_url,
    include=["services.celery_tasks"]
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    task_soft_time_limit=240,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    worker_concurrency=int(os.getenv("CELERY_WORKERS", "1")),
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
    result_expires=3600,
)

if __name__ == "__main__":
    app.start()

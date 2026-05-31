import os
import sys
import time
import requests
import threading
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

SCHEDULER_URL = os.getenv('SCHEDULER_URL', 'http://localhost:8080')
EXECUTOR_ID = os.getenv('EXECUTOR_ID', 'executor-001')
HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '10'))

def heartbeat():
    while True:
        try:
            url = f'{SCHEDULER_URL}/api/executors/heartbeat'
            payload = {'executorId': EXECUTOR_ID}
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('task'):
                    logger.info(f"Received task from scheduler: {data['task']}")
            else:
                logger.warning(f"Heartbeat failed with status: {response.status_code}")
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
        
        time.sleep(HEARTBEAT_INTERVAL)

def start_heartbeat():
    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()
    logger.info("Heartbeat thread started")

def register_executor():
    try:
        from celery_app.tasks.base_tasks import register_executor_task
        result = register_executor_task.delay().get(timeout=10)
        logger.info(f"Executor registration result: {result}")
    except Exception as e:
        logger.error(f"Failed to register executor: {e}")

if __name__ == '__main__':
    logger.info("Starting task executor worker...")
    
    register_executor()
    start_heartbeat()
    
    from celery_app.celery_config import app
    
    worker = app.Worker(
        hostname=EXECUTOR_ID,
        concurrency=int(os.getenv('CELERY_CONCURRENCY', '4')),
        loglevel=os.getenv('CELERY_LOG_LEVEL', 'INFO')
    )
    worker.start()

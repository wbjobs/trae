import os
import json
import time
import threading
import logging
import requests
from dotenv import load_dotenv
import redis

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

SCHEDULER_URL = os.getenv('SCHEDULER_URL', 'http://localhost:8080')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '')
EXECUTOR_ID = os.getenv('EXECUTOR_ID', 'executor-001')
EXECUTOR_NAME = os.getenv('EXECUTOR_NAME', 'default-executor')
EXECUTOR_HOST = os.getenv('EXECUTOR_HOST', 'localhost')
EXECUTOR_PORT = int(os.getenv('EXECUTOR_PORT', '5555'))
HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '10'))
QUEUE_PREFIX = os.getenv('QUEUE_PREFIX', 'task:queue:')
PRIORITY_QUEUE_PREFIX = os.getenv('PRIORITY_QUEUE_PREFIX', 'task:priority-queue:')
USE_PRIORITY_QUEUE = os.getenv('USE_PRIORITY_QUEUE', 'true').lower() == 'true'
SUSPEND_SIGNAL_PREFIX = os.getenv('SUSPEND_SIGNAL_PREFIX', 'task:suspend:')

from celery_app.tasks.base_tasks import execute_task

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True
)

running_tasks = {}
running_tasks_lock = threading.Lock()

def register_executor():
    try:
        task_types = get_available_task_types()
        url = f'{SCHEDULER_URL}/api/executors/register'
        payload = {
            'executorId': EXECUTOR_ID,
            'executorName': EXECUTOR_NAME,
            'host': EXECUTOR_HOST,
            'port': EXECUTOR_PORT,
            'taskTypes': task_types
        }
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            logger.info("Executor registered successfully")
            return True
        logger.error(f"Failed to register executor: %s", response.status_code)
        return False
    except Exception as e:
        logger.error(f"Error registering executor: {e}")
        return False

def get_available_task_types():
    import pkgutil
    import os
    task_types = []
    try:
        handlers_path = os.path.join(os.path.dirname(__file__), 'celery_app', 'handlers')
        if os.path.exists(handlers_path):
            for _, name, _ in pkgutil.iter_modules([handlers_path]):
                if name.endswith('_handler'):
                    task_type = name[:-8]
                    task_types.append(task_type)
    except Exception as e:
        logger.warning(f"Error scanning handlers: {e}")
    if not task_types:
        task_types = ['default']
    return task_types

def check_suspend_signals():
    while True:
        try:
            signal_key = f'{SUSPEND_SIGNAL_PREFIX}{EXECUTOR_ID}'
            task_instance_id = redis_client.rpop(signal_key)
            
            if task_instance_id:
                logger.info(f"Received suspend signal for task: {task_instance_id}")
                handle_suspend_signal(task_instance_id)
            else:
                time.sleep(1)
        except Exception as e:
            logger.error(f"Error checking suspend signals: {e}")
            time.sleep(5)

def handle_suspend_signal(task_instance_id):
    with running_tasks_lock:
        if task_instance_id in running_tasks:
            async_result = running_tasks[task_instance_id]
            try:
                async_result.revoke(terminate=True, signal='SIGTERM')
                logger.info(f"Revoked Celery task: {async_result.id}")
                
                try:
                    checkpoint_data = async_result.result if async_result.ready() else None
                    url = f'{SCHEDULER_URL}/api/task-instances/{task_instance_id}/suspend'
                    payload = {'checkpointData': str(checkpoint_data) if checkpoint_data else None}
                    requests.post(url, json=payload, timeout=10)
                    logger.info(f"Reported suspension for task: {task_instance_id}")
                except Exception as e:
                    logger.error(f"Failed to report suspension: {e}")
                
                del running_tasks[task_instance_id]
            except Exception as e:
                logger.error(f"Error revoking task: {e}")
        else:
            logger.warning(f"Task {task_instance_id} not found in running tasks")

def heartbeat():
    while True:
        try:
            url = f'{SCHEDULER_URL}/api/executors/heartbeat'
            payload = {'executorId': EXECUTOR_ID}
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code != 200:
                logger.warning(f"Heartbeat failed: {response.status_code}")
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
        time.sleep(HEARTBEAT_INTERVAL)

def consume_tasks():
    queue_name = f'{PRIORITY_QUEUE_PREFIX}{EXECUTOR_ID}' if USE_PRIORITY_QUEUE else f'{QUEUE_PREFIX}{EXECUTOR_ID}'
    logger.info(f"Starting task consumer for queue: {queue_name}, priority queue: {USE_PRIORITY_QUEUE}")
    
    while True:
        try:
            task = get_next_task(queue_name)
            if task:
                try:
                    task_data = json.loads(task) if isinstance(task, str) else task
                    priority = task_data.get('priority', 5)
                    task_name = task_data.get('taskName', 'unknown')
                    logger.info(f"Received task: {task_name}, priority: {priority}")
                    process_task(task_data)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse task: {e}")
            else:
                time.sleep(1)
        except Exception as e:
            logger.error(f"Error consuming task: {e}")
            time.sleep(5)

def get_next_task(queue_name):
    if USE_PRIORITY_QUEUE:
        tasks = redis_client.zrange(queue_name, 0, 0)
        if tasks:
            task = tasks[0]
            redis_client.zrem(queue_name, task)
            logger.debug(f"Dequeued task from priority queue")
            return task
        return None
    else:
        return redis_client.rpop(queue_name)

def process_task(task_data):
    try:
        task_instance_id = task_data.get('taskInstanceId')
        task_type = task_data.get('taskType')
        params = task_data.get('params')
        trace_id = task_data.get('traceId')
        checkpoint_data = task_data.get('checkpointData')
        
        logger.info(f"Processing task instance: {task_instance_id}, type: {task_type}")
        
        if checkpoint_data:
            logger.info(f"Resuming task with checkpoint data")
            if params is None:
                params = {}
            params['_checkpoint'] = checkpoint_data
        
        async_result = execute_task.delay(
            task_type=task_type,
            task_params=params,
            task_instance_id=task_instance_id,
            trace_id=trace_id
        )
        
        with running_tasks_lock:
            running_tasks[str(task_instance_id)] = async_result
        
        def on_task_ready():
            try:
                result = async_result.get(timeout=3600)
                logger.info(f"Task {task_instance_id} completed: {result}")
            except Exception as e:
                logger.error(f"Task {task_instance_id} failed: {e}")
            finally:
                with running_tasks_lock:
                    running_tasks.pop(str(task_instance_id), None)
        
        threading.Thread(target=on_task_ready, daemon=True).start()
        
        logger.info(f"Task {task_instance_id} submitted to Celery: {async_result.id}")
        
    except Exception as e:
        logger.error(f"Error processing task: {e}")
        try:
            url = f'{SCHEDULER_URL}/api/task-instances/result'
            payload = {
                'taskInstanceId': task_data.get('taskInstanceId'),
                'status': 'FAILED',
                'errorMessage': str(e)
            }
            requests.post(url, json=payload, timeout=10)
        except Exception as e2:
            logger.error(f"Failed to report error: {e2}")

def main():
    logger.info("Starting task executor service...")
    logger.info(f"Priority queue enabled: {USE_PRIORITY_QUEUE}")
    
    if not register_executor():
        logger.error("Failed to register executor, exiting")
        return
    
    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()
    logger.info("Heartbeat thread started")
    
    suspend_thread = threading.Thread(target=check_suspend_signals, daemon=True)
    suspend_thread.start()
    logger.info("Suspend signal listener started")
    
    try:
        consume_tasks()
    except KeyboardInterrupt:
        logger.info("Shutting down...")

if __name__ == '__main__':
    main()

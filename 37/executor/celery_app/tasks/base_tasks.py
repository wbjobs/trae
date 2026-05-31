import os
import json
import time
import importlib
import requests
from celery import Task
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from ..celery_config import app

SCHEDULER_URL = os.getenv('SCHEDULER_URL', 'http://localhost:8080')
EXECUTOR_ID = os.getenv('EXECUTOR_ID', 'executor-001')
EXECUTOR_NAME = os.getenv('EXECUTOR_NAME', 'default-executor')
EXECUTOR_HOST = os.getenv('EXECUTOR_HOST', 'localhost')
EXECUTOR_PORT = int(os.getenv('EXECUTOR_PORT', '5555'))

tracer = trace.get_tracer(__name__)

class TaskExecutor(Task):
    abstract = True
    
    def on_success(self, retval, task_id, args, kwargs):
        task_instance_id = kwargs.get('task_instance_id')
        if task_instance_id:
            report_task_result(task_instance_id, 'SUCCESS', str(retval), None)
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        task_instance_id = kwargs.get('task_instance_id')
        if task_instance_id:
            report_task_result(task_instance_id, 'FAILED', None, str(exc))

@app.task(base=TaskExecutor, bind=True, name='execute_task')
def execute_task(self, task_type, task_params, task_instance_id=None, trace_id=None, **kwargs):
    with tracer.start_as_current_span("execute_task") as span:
        span.set_attribute("task.type", task_type)
        span.set_attribute("task.instance_id", str(task_instance_id))
        if trace_id:
            span.set_attribute("trace.id", trace_id)
        
        try:
            handler = get_task_handler(task_type)
            if handler is None:
                raise ValueError(f"No handler registered for task type: {task_type}")
            
            result = handler(task_params)
            span.set_status(Status(StatusCode.OK))
            
            return {
                'status': 'SUCCESS',
                'result': result,
                'task_instance_id': task_instance_id
            }
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise

def get_task_handler(task_type):
    try:
        module_name = f'celery_app.handlers.{task_type}_handler'
        module = importlib.import_module(module_name)
        return getattr(module, 'handle')
    except (ImportError, AttributeError):
        return default_handler

def default_handler(params):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Executing default handler with params: {params}")
    time.sleep(1)
    return f"Default execution completed with params: {params}"

def report_task_result(task_instance_id, status, result, error_message):
    try:
        url = f'{SCHEDULER_URL}/api/task-instances/result'
        payload = {
            'taskInstanceId': task_instance_id,
            'status': status,
            'result': result,
            'errorMessage': error_message
        }
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to report task result: {e}")

@app.task(name='register_executor')
def register_executor_task():
    task_types = get_available_task_types()
    try:
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
            return {'status': 'success', 'message': 'Executor registered successfully'}
        return {'status': 'error', 'message': f'Failed to register: {response.status_code}'}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

def get_available_task_types():
    import pkgutil
    task_types = []
    try:
        handlers_path = os.path.join(os.path.dirname(__file__), '..', 'handlers')
        if os.path.exists(handlers_path):
            for _, name, _ in pkgutil.iter_modules([handlers_path]):
                if name.endswith('_handler'):
                    task_type = name[:-8]
                    task_types.append(task_type)
    except Exception:
        pass
    if not task_types:
        task_types = ['default']
    return task_types

import time
import logging

logger = logging.getLogger(__name__)

def handle(params):
    logger.info(f"Executing default task with params: {params}")
    
    sleep_time = params.get('sleep_time', 1) if params else 1
    time.sleep(sleep_time)
    
    result = {
        'message': 'Default task executed successfully',
        'params': params,
        'timestamp': time.time()
    }
    
    logger.info(f"Default task completed: {result}")
    return result

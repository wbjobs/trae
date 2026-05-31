import time
import logging

logger = logging.getLogger(__name__)

def handle(params):
    logger.info(f"Executing example task with params: {params}")
    
    message = params.get('message', 'Hello World') if params else 'Hello World'
    iterations = params.get('iterations', 3) if params else 3
    
    for i in range(iterations):
        logger.info(f"Example task iteration {i+1}/{iterations}: {message}")
        time.sleep(0.5)
    
    result = {
        'message': message,
        'iterations': iterations,
        'status': 'completed'
    }
    
    logger.info(f"Example task completed: {result}")
    return result

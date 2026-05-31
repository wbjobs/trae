import os

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))

STREAM_NAME = "stock_data_stream"
RESULT_CHANNEL = "stock_results_channel"
SIGMA_CHANNEL = "sigma_update_channel"
SIGMA_KEY = "current_sigma_threshold"

WINDOW_SIZE = 100
DEFAULT_SIGMA = 3
MIN_SIGMA = 1
MAX_SIGMA = 5
DATA_PER_SECOND = 10
BATCH_SIZE = 100

MAX_QUEUE_SIZE = 10000
HISTORY_MAX_LEN = 500

import time
import logging
import threading
import signal
from typing import Optional, Dict, Any, List, Callable, Tuple
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, Future, as_completed, TimeoutError
from queue import Queue, Empty
from functools import wraps

from .model_manager import ModelManager

logger = logging.getLogger(__name__)


class TimeoutException(Exception):
    pass


def with_timeout(timeout_seconds: int):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = [None]
            exception = [None]

            def target():
                try:
                    result[0] = func(*args, **kwargs)
                except Exception as e:
                    exception[0] = e

            thread = threading.Thread(target=target, daemon=True)
            thread.start()
            thread.join(timeout=timeout_seconds)

            if thread.is_alive():
                raise TimeoutException(
                    f"Function '{func.__name__}' timed out after {timeout_seconds} seconds"
                )

            if exception[0] is not None:
                raise exception[0]

            return result[0]
        return wrapper
    return decorator


class RetryHandler:
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
        backoff_factor: float = 2.0,
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_factor = backoff_factor

    def execute(self, func, *args, **kwargs) -> Tuple[Any, int]:
        last_exception = None
        for attempt in range(self.max_retries):
            try:
                result = func(*args, **kwargs)
                return result, attempt
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    delay = min(
                        self.base_delay * (self.backoff_factor ** attempt),
                        self.max_delay
                    )
                    logger.warning(
                        f"Attempt {attempt + 1}/{self.max_retries} failed: {e}. "
                        f"Retrying in {delay:.1f} seconds..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        f"All {self.max_retries} attempts failed. Last error: {e}"
                    )

        raise last_exception


@dataclass
class InferenceRequest:
    prompt: str
    request_id: str = ""
    priority: int = 5
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    callback: Optional[Callable] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


@dataclass
class InferenceResponse:
    request_id: str
    success: bool
    result: str = ""
    error: Optional[str] = None
    latency: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    completed_at: float = field(default_factory=time.time)


@dataclass
class SchedulerStats:
    total_requests: int = 0
    completed_requests: int = 0
    failed_requests: int = 0
    timeout_requests: int = 0
    total_retries: int = 0
    avg_latency: float = 0.0
    total_latency: float = 0.0
    min_latency: float = 0.0
    max_latency: float = 0.0
    queue_size: int = 0


class InferenceScheduler:
    def __init__(self, config: Any = None, model_manager: Optional[ModelManager] = None):
        self.config = config
        self.model_manager = model_manager or ModelManager(config)
        self.request_queue: "Queue[InferenceRequest]" = Queue()
        self._stats = SchedulerStats()
        self._lock = threading.Lock()
        self._executor: Optional[ThreadPoolExecutor] = None
        self._running = False
        self._worker_thread: Optional[threading.Thread] = None
        self._active_futures: List[Future] = []

        max_workers = getattr(config, "concurrency", 2) if config else 2
        self._max_workers = max_workers
        self._timeout = getattr(config, "timeout", 300) if config else 300

        self.retry_handler = RetryHandler(
            max_retries=getattr(config, "max_retries", 3) if config else 3,
            base_delay=getattr(config, "retry_base_delay", 1.0) if config else 1.0,
        )
        self._generation_lock = threading.Lock()

    def start(self) -> None:
        if self._running:
            logger.warning("Scheduler already running")
            return

        self._running = True
        self._executor = ThreadPoolExecutor(max_workers=self._max_workers)
        self._worker_thread = threading.Thread(target=self._process_queue, daemon=True)
        self._worker_thread.start()
        logger.info("Inference scheduler started")

    def stop(self) -> None:
        if not self._running:
            return

        self._running = False

        for future in self._active_futures:
            future.cancel()

        if self._executor:
            self._executor.shutdown(wait=True)

        if self._worker_thread:
            self._worker_thread.join(timeout=5)

        self.model_manager.unload()
        logger.info("Inference scheduler stopped")

    def submit(self, request: InferenceRequest) -> InferenceResponse:
        if not self._running:
            logger.warning("Scheduler not running, starting automatically")
            self.start()

        if not self.model_manager.is_ready():
            logger.warning("Model not ready, initializing with mock backend")
            self.model_manager.initialize_backend("mock")

        if not request.request_id:
            request.request_id = f"req_{int(time.time() * 1000)}"

        with self._lock:
            self._stats.total_requests += 1

        logger.debug(f"Submitting request {request.request_id}")

        try:
            response = self._execute_request(request)

            with self._lock:
                if response.success:
                    self._stats.completed_requests += 1
                else:
                    self._stats.failed_requests += 1
                    if "Timeout" in str(response.error):
                        self._stats.timeout_requests += 1

                self._stats.total_latency += response.latency
                if self._stats.min_latency == 0 or response.latency < self._stats.min_latency:
                    self._stats.min_latency = response.latency
                if response.latency > self._stats.max_latency:
                    self._stats.max_latency = response.latency

                self._stats.avg_latency = (
                    self._stats.total_latency / self._stats.completed_requests
                    if self._stats.completed_requests > 0
                    else 0.0
                )

                retry_count = response.metadata.get("retry_count", 0)
                self._stats.total_retries += retry_count

            if request.callback:
                try:
                    request.callback(response)
                except Exception as e:
                    logger.error(f"Callback error: {e}")

            return response

        except Exception as e:
            logger.error(f"Request failed: {e}")
            with self._lock:
                self._stats.failed_requests += 1
            return InferenceResponse(
                request_id=request.request_id,
                success=False,
                error=str(e),
                latency=time.time() - request.created_at,
            )

    def generate(self, prompt: str, **kwargs) -> str:
        request = InferenceRequest(
            prompt=prompt,
            max_tokens=kwargs.get("max_tokens"),
            temperature=kwargs.get("temperature"),
            top_p=kwargs.get("top_p"),
        )
        response = self.submit(request)
        if not response.success:
            raise RuntimeError(f"Inference failed: {response.error}")
        return response.result

    def batch_generate(self, prompts: List[str], **kwargs) -> List[InferenceResponse]:
        if not self._running:
            self.start()

        futures = []
        for prompt in prompts:
            request = InferenceRequest(
                prompt=prompt,
                max_tokens=kwargs.get("max_tokens"),
                temperature=kwargs.get("temperature"),
                top_p=kwargs.get("top_p"),
            )
            future = self._executor.submit(self._execute_request, request)
            futures.append(future)

        results = []
        for future in as_completed(futures, timeout=self._timeout):
            try:
                results.append(future.result())
            except Exception as e:
                logger.error(f"Batch request failed: {e}")

        return results

    def _execute_request(self, request: InferenceRequest) -> InferenceResponse:
        start_time = time.time()
        request_timeout = getattr(request.metadata, "timeout", self._timeout) if request.metadata else self._timeout

        generate_kwargs = {}
        if request.max_tokens is not None:
            generate_kwargs["max_tokens"] = request.max_tokens
        if request.temperature is not None:
            generate_kwargs["temperature"] = request.temperature
        if request.top_p is not None:
            generate_kwargs["top_p"] = request.top_p

        def _do_generate():
            with self._generation_lock:
                return self.model_manager.generate(request.prompt, **generate_kwargs)

        def _do_generate_with_timeout():
            @with_timeout(request_timeout)
            def _wrapped_generate():
                return _do_generate()
            return _wrapped_generate()

        try:
            result, retry_count = self.retry_handler.execute(_do_generate_with_timeout)
            latency = time.time() - start_time

            response = InferenceResponse(
                request_id=request.request_id,
                success=True,
                result=result,
                latency=latency,
                metadata={
                    **request.metadata,
                    "retry_count": retry_count,
                },
            )

            logger.info(
                f"Request {request.request_id} completed in {latency:.2f}s "
                f"(retries: {retry_count})"
            )
            return response

        except TimeoutException as e:
            latency = time.time() - start_time
            logger.error(f"Request {request.request_id} timed out after {latency:.2f}s: {e}")
            return InferenceResponse(
                request_id=request.request_id,
                success=False,
                error=f"Timeout after {latency:.1f}s",
                latency=latency,
                metadata=request.metadata,
            )

        except Exception as e:
            latency = time.time() - start_time
            logger.error(f"Request {request.request_id} failed after {latency:.2f}s: {e}")
            return InferenceResponse(
                request_id=request.request_id,
                success=False,
                error=str(e),
                latency=latency,
                metadata=request.metadata,
            )

    def _process_queue(self) -> None:
        while self._running:
            try:
                request = self.request_queue.get(timeout=1)
                if self._executor:
                    future = self._executor.submit(self._execute_request, request)
                    self._active_futures.append(future)
                    future.add_done_callback(self._cleanup_future)
            except Empty:
                continue
            except Exception as e:
                logger.error(f"Queue processing error: {e}")

    def _cleanup_future(self, future: Future) -> None:
        with self._lock:
            if future in self._active_futures:
                self._active_futures.remove(future)

    def get_stats(self) -> SchedulerStats:
        with self._lock:
            self._stats.queue_size = self.request_queue.qsize()
            return self._stats

    def reset_stats(self) -> None:
        with self._lock:
            self._stats = SchedulerStats()

    def initialize_model(self, backend_type: str = "mock") -> bool:
        return self.model_manager.initialize_backend(backend_type)

    def is_ready(self) -> bool:
        return self._running and self.model_manager.is_ready()

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()

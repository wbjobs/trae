import time
import queue
import threading
import logging
import numpy as np
from typing import Optional

import cv2
from config import RTMPConfig, QueueConfig

logger = logging.getLogger(__name__)


class FramePacket:
    __slots__ = ("frame", "timestamp", "frame_id")

    def __init__(self, frame: np.ndarray, timestamp: float, frame_id: int):
        self.frame = frame
        self.timestamp = timestamp
        self.frame_id = frame_id


class VideoSource:
    def __init__(
        self,
        rtmp_config: RTMPConfig,
        queue_config: QueueConfig,
        metrics_collector=None,
    ):
        self._rtmp_config = rtmp_config
        self._queue_config = queue_config
        self._metrics = metrics_collector
        self._capture: Optional[cv2.VideoCapture] = None
        self._frame_queue: Optional[queue.Queue] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._frame_count = 0
        self._lock = threading.Lock()

    @property
    def frame_queue(self) -> queue.Queue:
        return self._frame_queue

    def _create_capture(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(self._rtmp_config.input_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_PROBE_SIZE, self._rtmp_config.input_probe_size * 1024 * 1024)
        cap.set(
            cv2.CAP_PROP_ANALYZE_DURATION_MICROSECONDS,
            self._rtmp_config.input_analyze_duration * 1000,
        )
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open RTMP stream: {self._rtmp_config.input_url}")
        logger.info(
            "RTMP stream opened: %dx%d, %.2f FPS",
            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            cap.get(cv2.CAP_PROP_FPS),
        )
        return cap

    def _reader_loop(self):
        logger.info("Video source reader started")
        consecutive_failures = 0
        max_consecutive_failures = 100

        while self._running:
            try:
                if self._capture is None or not self._capture.isOpened():
                    logger.warning("Capture closed, attempting reconnect...")
                    time.sleep(1.0)
                    self._capture = self._create_capture()
                    consecutive_failures = 0

                ret, frame = self._capture.read()
                if not ret:
                    consecutive_failures += 1
                    if consecutive_failures >= max_consecutive_failures:
                        logger.error("Too many read failures, releasing capture")
                        self._capture.release()
                        self._capture = None
                        consecutive_failures = 0
                    continue

                consecutive_failures = 0

                with self._lock:
                    self._frame_count += 1
                    frame_id = self._frame_count

                packet = FramePacket(
                    frame=frame.copy(),
                    timestamp=time.perf_counter(),
                    frame_id=frame_id,
                )

                try:
                    self._frame_queue.put_nowait(packet)
                except queue.Full:
                    if self._metrics:
                        self._metrics.increment_dropped_frames(1)
                    logger.debug("Input queue full, dropping frame %d", frame_id)

                if self._metrics:
                    self._metrics.set_input_queue_size(self._frame_queue.qsize())

            except Exception as e:
                logger.error("Error in video reader: %s", e, exc_info=True)
                time.sleep(0.1)

        logger.info("Video source reader stopped")

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._frame_queue = queue.Queue(maxsize=self._queue_config.input_queue_size)
        self._capture = self._create_capture()
        self._thread = threading.Thread(target=self._reader_loop, daemon=True, name="video-source")
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._capture is not None:
            self._capture.release()
            self._capture = None
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        logger.info("Video source stopped")

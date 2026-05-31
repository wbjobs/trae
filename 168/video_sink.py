import time
import queue
import threading
import logging
import subprocess
import numpy as np
from typing import Optional

from config import RTMPConfig, QueueConfig

logger = logging.getLogger(__name__)


class VideoSink:
    def __init__(
        self,
        rtmp_config: RTMPConfig,
        queue_config: QueueConfig,
        output_width: int = 1920,
        output_height: int = 1080,
        output_fps: int = 60,
        metrics_collector=None,
    ):
        self._rtmp_config = rtmp_config
        self._queue_config = queue_config
        self._output_width = output_width
        self._output_height = output_height
        self._output_fps = output_fps
        self._metrics = metrics_collector
        self._output_queue: Optional[queue.Queue] = None
        self._process: Optional[subprocess.Popen] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_frame_time = time.perf_counter()
        self._fps_counter = 0
        self._fps_lock = threading.Lock()

    @property
    def output_queue(self) -> queue.Queue:
        return self._output_queue

    def _build_ffmpeg_command(self) -> list:
        return [
            "ffmpeg",
            "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{self._output_width}x{self._output_height}",
            "-r", str(self._output_fps),
            "-i", "-",
            "-c:v", "libx264",
            "-preset", self._rtmp_config.output_preset,
            "-tune", "zerolatency",
            "-b:v", self._rtmp_config.output_bitrate,
            "-g", str(self._rtmp_config.output_gop),
            "-pix_fmt", "yuv420p",
            "-f", "flv",
            self._rtmp_config.output_url,
        ]

    def _start_ffmpeg(self):
        cmd = self._build_ffmpeg_command()
        logger.info("Starting ffmpeg: %s", " ".join(cmd))
        self._process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            bufsize=10**8,
        )

    def _writer_loop(self):
        logger.info("Video sink writer started")
        while self._running:
            try:
                packet = self._output_queue.get(timeout=0.1)
                if packet is None:
                    continue

                frame = packet.frame

                if frame.shape[1] != self._output_width or frame.shape[0] != self._output_height:
                    import cv2
                    frame = cv2.resize(
                        frame,
                        (self._output_width, self._output_height),
                        interpolation=cv2.INTER_LINEAR,
                    )

                if self._process is None or self._process.poll() is not None:
                    logger.warning("FFmpeg process not running, restarting...")
                    self._start_ffmpeg()

                try:
                    self._process.stdin.write(frame.tobytes())
                except (BrokenPipeError, OSError) as e:
                    logger.error("FFmpeg pipe broken: %s", e)
                    if self._process:
                        self._process.kill()
                        self._process = None
                    continue

                with self._fps_lock:
                    self._fps_counter += 1
                    now = time.perf_counter()
                    if now - self._last_frame_time >= 1.0:
                        fps = self._fps_counter / (now - self._last_frame_time)
                        if self._metrics:
                            self._metrics.set_fps(fps)
                        self._fps_counter = 0
                        self._last_frame_time = now

                if self._metrics:
                    self._metrics.set_output_queue_size(self._output_queue.qsize())
                    pipeline_latency = time.perf_counter() - packet.timestamp
                    self._metrics.observe_pipeline_latency(pipeline_latency)
                    self._metrics.increment_frames_total(1)

            except queue.Empty:
                continue
            except Exception as e:
                logger.error("Error in video writer: %s", e, exc_info=True)

        logger.info("Video sink writer stopped")

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._output_queue = queue.Queue(maxsize=self._queue_config.output_queue_size)
        self._start_ffmpeg()
        self._thread = threading.Thread(target=self._writer_loop, daemon=True, name="video-sink")
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._process is not None:
            try:
                self._process.stdin.close()
            except Exception:
                pass
            self._process.wait(timeout=5.0)
            self._process = None
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        logger.info("Video sink stopped")

import time
import threading
from collections import deque
from typing import Optional

import numpy as np
from prometheus_client import start_http_server, Gauge, Histogram, Counter, REGISTRY


class MetricsCollector:
    _instance: Optional["MetricsCollector"] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self, host: str = "0.0.0.0", port: int = 9090, enabled: bool = True):
        if self._initialized:
            return
        self._initialized = True
        self._enabled = enabled
        self._psnr_window = deque(maxlen=100)
        self._psnr_lock = threading.Lock()

        if not enabled:
            return

        self._psnr_gauge = Gauge(
            "video_super_resolution_psnr_db",
            "PSNR of super-resolved frames in dB",
        )

        self._inference_duration = Histogram(
            "video_super_resolution_inference_duration_seconds",
            "Time spent on ESRGAN inference",
            buckets=(0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0),
        )

        self._batch_size_gauge = Gauge(
            "video_super_resolution_batch_size",
            "Current batch size being processed",
        )

        self._input_queue_size = Gauge(
            "video_super_resolution_input_queue_size",
            "Number of frames in the input queue",
        )

        self._output_queue_size = Gauge(
            "video_super_resolution_output_queue_size",
            "Number of frames in the output queue",
        )

        self._fps_throughput = Gauge(
            "video_super_resolution_fps",
            "Frames processed per second",
        )

        self._frames_total = Counter(
            "video_super_resolution_frames_total",
            "Total number of frames processed",
        )

        self._dropped_frames_total = Counter(
            "video_super_resolution_dropped_frames_total",
            "Total number of frames dropped due to queue overflow",
        )

        self._pipeline_latency = Histogram(
            "video_super_resolution_pipeline_latency_seconds",
            "End-to-end latency from frame capture to output",
            buckets=(0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0),
        )

        self._batch_wait_duration = Histogram(
            "video_super_resolution_batch_wait_seconds",
            "Time spent waiting to form a batch",
            buckets=(0.001, 0.005, 0.01, 0.02, 0.05, 0.1),
        )

        self._stabilization_duration = Histogram(
            "video_super_resolution_stabilization_duration_seconds",
            "Time spent on temporal stabilization",
            buckets=(0.001, 0.002, 0.005, 0.01, 0.02, 0.05),
        )

        self._l_channel_delta = Gauge(
            "video_super_resolution_l_channel_delta",
            "Mean absolute difference in L channel between original and stabilized frames",
        )

        self._brightness_variation = Gauge(
            "video_super_resolution_brightness_variation",
            "Standard deviation of mean brightness across recent frames",
        )

        self._stabilization_window = deque(maxlen=30)
        self._stabilization_lock = threading.Lock()

        self._model_level_gauge = Gauge(
            "video_super_resolution_model_level",
            "Current model level in use (0=light, 1=standard, 2=heavy)",
        )

        self._model_inference_duration = Histogram(
            "video_super_resolution_model_inference_duration_seconds",
            "Inference time per model level",
            labelnames=("model_level",),
            buckets=(0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0),
        )

        self._model_selection_counter = Counter(
            "video_super_resolution_model_selection_total",
            "Number of frames processed per model level",
            labelnames=("model_level",),
        )

        self._scene_complexity_gauge = Gauge(
            "video_super_resolution_scene_complexity",
            "Combined scene complexity score (0-1)",
        )

        self._scene_edge_density_gauge = Gauge(
            "video_super_resolution_scene_edge_density",
            "Edge density of current scene",
        )

        self._scene_motion_gauge = Gauge(
            "video_super_resolution_scene_motion_magnitude",
            "Average motion magnitude of current scene",
        )

        self._host = host
        self._port = port
        self._server_thread = None

    def start_server(self):
        if not self._enabled:
            return
        self._server_thread = threading.Thread(
            target=start_http_server,
            args=(self._port, self._host),
            daemon=True,
        )
        self._server_thread.start()

    def stop_server(self):
        pass

    def observe_inference_duration(self, duration: float):
        if self._enabled:
            self._inference_duration.observe(duration)

    def set_batch_size(self, size: int):
        if self._enabled:
            self._batch_size_gauge.set(size)

    def set_input_queue_size(self, size: int):
        if self._enabled:
            self._input_queue_size.set(size)

    def set_output_queue_size(self, size: int):
        if self._enabled:
            self._output_queue_size.set(size)

    def set_fps(self, fps: float):
        if self._enabled:
            self._fps_throughput.set(fps)

    def increment_frames_total(self, count: int = 1):
        if self._enabled:
            self._frames_total.inc(count)

    def increment_dropped_frames(self, count: int = 1):
        if self._enabled:
            self._dropped_frames_total.inc(count)

    def observe_pipeline_latency(self, latency: float):
        if self._enabled:
            self._pipeline_latency.observe(latency)

    def observe_batch_wait_duration(self, duration: float):
        if self._enabled:
            self._batch_wait_duration.observe(duration)

    def update_psnr(self, psnr_value: float):
        if not self._enabled:
            return
        with self._psnr_lock:
            self._psnr_window.append(psnr_value)
            avg_psnr = sum(self._psnr_window) / len(self._psnr_window)
            self._psnr_gauge.set(avg_psnr)

    def observe_stabilization_duration(self, duration: float):
        if self._enabled:
            self._stabilization_duration.observe(duration)

    def set_l_channel_delta(self, delta: float):
        if self._enabled:
            self._l_channel_delta.set(delta)

    def update_brightness_variation(self, mean_brightness: float):
        if not self._enabled:
            return
        with self._stabilization_lock:
            self._stabilization_window.append(mean_brightness)
            if len(self._stabilization_window) >= 2:
                std = float(np.std(list(self._stabilization_window)))
                self._brightness_variation.set(std)

    def set_model_level(self, level: str):
        if self._enabled:
            level_map = {"light": 0, "standard": 1, "heavy": 2}
            self._model_level_gauge.set(level_map.get(level, 1))

    def observe_model_inference_duration(self, level: str, duration: float):
        if self._enabled:
            self._model_inference_duration.labels(model_level=level).observe(duration)
            self._model_selection_counter.labels(model_level=level).inc()

    def set_scene_complexity(self, combined: float, edge_density: float, motion: float):
        if self._enabled:
            self._scene_complexity_gauge.set(combined)
            self._scene_edge_density_gauge.set(edge_density)
            self._scene_motion_gauge.set(motion)

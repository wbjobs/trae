import time
import signal
import logging
import argparse
import threading
from typing import List, Optional

import cv2
import numpy as np

from config import AppConfig
from metrics import MetricsCollector
from inference_engine import InferenceEngine
from video_source import VideoSource, FramePacket
from video_sink import VideoSink
from temporal_stabilizer import TemporalStabilizer
from scene_analyzer import SceneAnalyzer
from model_registry import ModelRegistry

logger = logging.getLogger(__name__)


class SuperResolutionService:
    def __init__(self, config: AppConfig):
        self._config = config
        self._running = False
        self._stop_event = threading.Event()

        self._metrics = MetricsCollector(
            host=config.metrics.host,
            port=config.metrics.port,
            enabled=config.metrics.enabled,
        )

        self._dynamic_enabled = config.dynamic_model.enabled
        self._scene_analyzer: Optional[SceneAnalyzer] = None
        self._model_registry: Optional[ModelRegistry] = None
        self._inference_engine: Optional[InferenceEngine] = None

        if self._dynamic_enabled:
            self._scene_analyzer = SceneAnalyzer()
            self._model_registry = ModelRegistry(
                base_config=config.model,
                dynamic_config=config.dynamic_model,
                metrics_collector=self._metrics,
            )
            self._inference_engine = self._model_registry._engines.get(
                config.dynamic_model.default_level
            )
            logger.info("Dynamic model selection enabled, levels: %s",
                        self._model_registry.available_levels)
        else:
            self._inference_engine = InferenceEngine(
                config=config.model,
                metrics_collector=self._metrics,
            )

        self._video_source = VideoSource(
            rtmp_config=config.rtmp,
            queue_config=config.queue,
            metrics_collector=self._metrics,
        )

        self._video_sink = VideoSink(
            rtmp_config=config.rtmp,
            queue_config=config.queue,
            output_width=config.model.output_width,
            output_height=config.model.output_height,
            output_fps=config.rtmp.output_fps,
            metrics_collector=self._metrics,
        )

        self._batch_size = config.model.batch_size
        self._batch_timeout = config.queue.batch_queue_timeout
        self._input_height = config.model.input_height
        self._input_width = config.model.input_width

        self._stabilizer = TemporalStabilizer(
            enabled=config.stabilizer.enabled,
            alpha=config.stabilizer.alpha,
            strength=config.stabilizer.strength,
            chroma_alpha=config.stabilizer.chroma_alpha,
            chroma_strength=config.stabilizer.chroma_strength,
            reference_history=config.stabilizer.reference_history,
        )

        self._psnr_downsample = cv2.resize
        self._shutdown_lock = threading.Lock()

    def _preprocess_frame(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        if w != self._input_width or h != self._input_height:
            frame = cv2.resize(
                frame,
                (self._input_width, self._input_height),
                interpolation=cv2.INTER_LINEAR,
            )
        return frame

    def _collect_batch(self) -> Optional[List[FramePacket]]:
        batch = []
        batch_start = time.perf_counter()

        while len(batch) < self._batch_size:
            elapsed = time.perf_counter() - batch_start
            remaining = self._batch_timeout - elapsed

            if remaining <= 0 and len(batch) > 0:
                break

            try:
                timeout = remaining if len(batch) > 0 else 0.5
                packet = self._video_source.frame_queue.get(timeout=timeout)
                processed_frame = self._preprocess_frame(packet.frame)
                batch.append(FramePacket(
                    frame=processed_frame,
                    timestamp=packet.timestamp,
                    frame_id=packet.frame_id,
                ))
            except Exception:
                if len(batch) > 0:
                    break
                if self._stop_event.is_set():
                    return None

        if self._metrics and len(batch) > 0:
            wait_time = time.perf_counter() - batch_start
            self._metrics.observe_batch_wait_duration(wait_time)

        return batch if batch else None

    def _process_batch(self, batch: List[FramePacket]):
        frames = [p.frame for p in batch]

        complexity_level = "standard"
        if self._dynamic_enabled and self._scene_analyzer:
            complexity_level = self._scene_analyzer.get_batch_level(frames)
            last_score = self._scene_analyzer.last_score
            if last_score and self._config.metrics.enabled:
                self._metrics.set_scene_complexity(
                    combined=last_score.combined,
                    edge_density=last_score.edge_density,
                    motion=last_score.motion_magnitude,
                )

        if self._dynamic_enabled and self._model_registry:
            output_frames, inference_time, model_level = self._model_registry.infer_batch(
                frames, complexity_level
            )
        else:
            output_frames, inference_time = self._inference_engine.infer_batch(frames)

        for i, (packet, output_frame) in enumerate(zip(batch, output_frames)):
            if self._config.metrics.enabled:
                reference = cv2.resize(
                    packet.frame,
                    (output_frame.shape[1], output_frame.shape[0]),
                    interpolation=cv2.INTER_CUBIC,
                )
                psnr = self._inference_engine.compute_psnr(reference, output_frame)
                if self._metrics:
                    self._metrics.update_psnr(psnr)

            stab_start = time.perf_counter()
            stabilized_frame = self._stabilizer.stabilize(output_frame)
            stab_time = time.perf_counter() - stab_start

            if self._config.metrics.enabled:
                self._metrics.observe_stabilization_duration(stab_time)
                mean_brightness = float(np.mean(stabilized_frame))
                self._metrics.update_brightness_variation(mean_brightness)

                if not np.array_equal(output_frame, stabilized_frame):
                    l_orig = cv2.cvtColor(output_frame, cv2.COLOR_BGR2LAB)[:, :, 0]
                    l_stab = cv2.cvtColor(stabilized_frame, cv2.COLOR_BGR2LAB)[:, :, 0]
                    l_delta = float(np.mean(np.abs(l_orig.astype(np.float32) - l_stab.astype(np.float32))))
                    self._metrics.set_l_channel_delta(l_delta)

            output_packet = FramePacket(
                frame=stabilized_frame,
                timestamp=packet.timestamp,
                frame_id=packet.frame_id,
            )

            try:
                self._video_sink.output_queue.put_nowait(output_packet)
            except Exception:
                if self._metrics:
                    self._metrics.increment_dropped_frames(1)

    def _processing_loop(self):
        logger.info("Processing loop started")
        while not self._stop_event.is_set():
            try:
                batch = self._collect_batch()
                if batch is None:
                    if self._stop_event.is_set():
                        break
                    continue

                self._process_batch(batch)

            except Exception as e:
                logger.error("Error in processing loop: %s", e, exc_info=True)
                time.sleep(0.01)

        logger.info("Processing loop stopped")

    def start(self):
        if self._running:
            return
        self._running = True
        self._stop_event.clear()

        logger.info("Starting video super-resolution service...")
        logger.info("Input RTMP: %s", self._config.rtmp.input_url)
        logger.info("Output RTMP: %s", self._config.rtmp.output_url)
        logger.info("Model: %s", self._config.model.model_path)
        logger.info("Batch size: %d", self._config.model.batch_size)
        logger.info("Scale: %dx", self._config.model.scale_factor)
        logger.info("Temporal stabilizer: enabled=%s, alpha=%.2f, strength=%.2f",
                    self._config.stabilizer.enabled,
                    self._config.stabilizer.alpha,
                    self._config.stabilizer.strength)
        if self._dynamic_enabled:
            logger.info("Dynamic model: enabled=True, default=%s, levels=%s",
                        self._config.dynamic_model.default_level,
                        self._config.dynamic_model.complexity_mapping)
        else:
            logger.info("Dynamic model: disabled (single model)")

        if self._config.metrics.enabled:
            self._metrics.start_server()
            logger.info("Prometheus metrics server: http://%s:%d/metrics",
                        self._config.metrics.host, self._config.metrics.port)

        self._video_source.start()
        self._video_sink.start()

        processing_thread = threading.Thread(
            target=self._processing_loop,
            daemon=True,
            name="processing-loop",
        )
        processing_thread.start()

        logger.info("Service started successfully")

        try:
            while self._running and not self._stop_event.is_set():
                time.sleep(0.1)
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        finally:
            self.stop()

    def stop(self):
        with self._shutdown_lock:
            if not self._running:
                return
            logger.info("Stopping service...")
            self._stop_event.set()
            self._running = False

            logger.info("Stopping video source...")
            self._video_source.stop()

            logger.info("Stopping video sink...")
            self._video_sink.stop()

            logger.info("Service stopped")

    def _handle_signal(self, signum, frame):
        logger.info("Received signal %d", signum)
        self.stop()


def setup_logging(level: str = "INFO"):
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Video Super-Resolution Real-time Service"
    )
    parser.add_argument(
        "--config",
        type=str,
        default="config.yaml",
        help="Path to configuration file",
    )
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Input RTMP URL",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output RTMP URL",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Path to ESRGAN ONNX model",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help="Batch size for inference",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default=None,
        help="Logging level",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    config = AppConfig.from_yaml(args.config)

    if args.input:
        config.rtmp.input_url = args.input
    if args.output:
        config.rtmp.output_url = args.output
    if args.model:
        config.model.model_path = args.model
    if args.batch_size:
        config.model.batch_size = args.batch_size
    if args.log_level:
        config.log_level = args.log_level

    setup_logging(config.log_level)

    service = SuperResolutionService(config)

    signal.signal(signal.SIGINT, service._handle_signal)
    signal.signal(signal.SIGTERM, service._handle_signal)

    service.start()


if __name__ == "__main__":
    main()

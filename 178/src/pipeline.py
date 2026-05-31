"""
DeepStream Traffic Analytics Pipeline with Low-Light Enhancement.

Pipeline architecture:
  rtsp_src(×8) → h264parse → nvv4l2decoder → nvstreammux
    → [LowLightEnhancer pre-processing] → nvinfer(PGIE vehicle)
    → nvtracker → nvinfer(SGIE license plate) → nvinfer(SGIE OCR)
    → [SpeedEstimator line-crossing] → nvvideoconvert → nvdsosd → nveglglessink
    → [KafkaProducer structured events]

The low-light enhancer operates as a pre-processing step inside the
pipeline via a probe callback on the streammux src pad. It extracts
frames from the GPU surface, enhances them on CPU, and writes back.

Adaptive detection re-filters PGIE output metadata in a separate
probe callback, adjusting confidence/NMS per-class based on current
brightness (smoothed over a temporal window).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("traffic-pipeline")


# ---------------------------------------------------------------------------
# Configuration loading
# ---------------------------------------------------------------------------


@dataclass
class StreamConfig:
    id: str
    name: str
    uri: str
    roi: List[int]
    speed_line: Dict[str, Any]


@dataclass
class PipelineConfig:
    streams: List[StreamConfig]
    streammux: Dict[str, Any]
    pgie: Dict[str, Any]
    sgie_lp: Dict[str, Any]
    sgie_ocr: Dict[str, Any]
    tracker: Dict[str, Any]
    osd: Dict[str, Any]
    kafka: Dict[str, Any]
    influxdb: Dict[str, Any]
    lowlight: Dict[str, Any]
    adaptive_detection: Dict[str, Any]
    model: Dict[str, Any]


def load_config(path: str) -> PipelineConfig:
    """Load YAML config file into a PipelineConfig dataclass."""
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    streams = [
        StreamConfig(
            id=s["id"],
            name=s["name"],
            uri=s["uri"],
            roi=s.get("roi", [0, 0, 1920, 1080]),
            speed_line=s.get("speed_line", {}),
        )
        for s in raw["streams"]
    ]

    return PipelineConfig(
        streams=streams,
        streammux=raw["streammux"],
        pgie=raw["pgie"],
        sgie_lp=raw["sgie_lp"],
        sgie_ocr=raw["sgie_ocr"],
        tracker=raw["tracker"],
        osd=raw["osd"],
        kafka=raw["kafka"],
        influxdb=raw["influxdb"],
        lowlight=raw.get("lowlight", {}),
        adaptive_detection=raw.get("adaptive_detection", {}),
        model=raw["model"],
    )


# ---------------------------------------------------------------------------
# DeepStream imports (lazy to allow testing without pyds)
# ---------------------------------------------------------------------------

GST_IMPORTED = False
PYDS_IMPORTED = False


def _ensure_gstreamer():
    global GST_IMPORTED
    if not GST_IMPORTED:
        import gi

        gi.require_version("Gst", "1.0")
        from gi.repository import Gst

        Gst.init(None)
        GST_IMPORTED = True
    return True


def _ensure_pyds():
    global PYDS_IMPORTED
    if not PYDS_IMPORTED:
        import pyds

        PYDS_IMPORTED = True
    return True


# ---------------------------------------------------------------------------
# Low-Light Enhancement Integration
# ---------------------------------------------------------------------------

from src.lowlight_enhancer import EnhancementConfig, LowLightEnhancer
from src.adaptive_detector import (
    AdaptivePostProcessor,
    AdaptiveThresholdConfig,
    AdaptiveThresholdManager,
    DetectionCandidate,
)


def build_lowlight_enhancer(cfg: Dict[str, Any]) -> Optional[LowLightEnhancer]:
    """Build a LowLightEnhancer from the YAML config section."""
    if not cfg.get("enabled", False):
        logger.info("Low-light enhancement disabled in config")
        return None

    enh_cfg = EnhancementConfig(
        enable_clahe=cfg.get("enable_clahe", True),
        clahe_clip_limit=cfg.get("clahe_clip_limit", 2.0),
        clahe_tile_grid_size=tuple(cfg.get("clahe_tile_grid_size", [8, 8])),
        enable_gamma=cfg.get("enable_gamma", True),
        gamma_min=cfg.get("gamma_min", 0.6),
        gamma_max=cfg.get("gamma_max", 3.5),
        target_luminance=cfg.get("target_luminance", 120.0),
        brightness_threshold_low=cfg.get("brightness_threshold_low", 60.0),
        brightness_threshold_high=cfg.get("brightness_threshold_high", 180.0),
        enable_color_correction=cfg.get("enable_color_correction", True),
        color_saturation_gain=cfg.get("color_saturation_gain", 1.3),
        color_temperature_compensation=cfg.get(
            "color_temperature_compensation", 0.9
        ),
        denoise_strength=cfg.get("denoise_strength", 5),
        enable_metrics=cfg.get("enable_metrics", True),
    )
    logger.info(
        "Low-light enhancer enabled: gamma=[%.1f, %.1f], target_lum=%.0f",
        enh_cfg.gamma_min,
        enh_cfg.gamma_max,
        enh_cfg.target_luminance,
    )
    return LowLightEnhancer(enh_cfg)


def build_adaptive_detector(
    cfg: Dict[str, Any],
) -> Optional[AdaptivePostProcessor]:
    """Build an AdaptivePostProcessor from the YAML config section."""
    if not cfg.get("enabled", False):
        logger.info("Adaptive detection disabled in config")
        return None

    thresh_cfg = AdaptiveThresholdConfig(
        class_thresholds={
            cls: {"min": v["min"], "max": v["max"]}
            for cls, v in cfg.get("class_confidence", {}).items()
        },
        nms_iou_thresholds={
            cls: {"min": v["min"], "max": v["max"]}
            for cls, v in cfg.get("class_nms_iou", {}).items()
        },
        brightness_day_threshold=cfg.get("brightness_day_threshold", 120.0),
        brightness_night_threshold=cfg.get("brightness_night_threshold", 60.0),
        min_bbox_size_ratio={
            cls: v for cls, v in cfg.get("min_bbox_size_ratio", {}).items()
        },
        temporal_smoothing_window=cfg.get("temporal_smoothing_window", 10),
        min_area_pixels=cfg.get("min_area_pixels", 200),
    )
    manager = AdaptiveThresholdManager(thresh_cfg)
    processor = AdaptivePostProcessor(threshold_manager=manager)
    logger.info("Adaptive detector enabled with per-class thresholds")
    return processor


# ---------------------------------------------------------------------------
# Speed Estimation (virtual line cross)
# ---------------------------------------------------------------------------


@dataclass
class VehicleTrackState:
    track_id: int
    class_name: str
    last_bbox: List[float]
    last_timestamp: float
    crossed_line: bool = False
    speed_kmh: float = 0.0
    line_cross_time: float = 0.0
    bbox_history: List[Tuple[float, float, float]] = field(
        default_factory=list
    )


class SpeedEstimator:
    """
    Estimate vehicle speed via virtual line crossing.

    Uses two parallel lines or a single line with known pixel-to-meter
    calibration. For single-line mode, speed is estimated from the
    time the bounding box takes to cross the line, combined with the
    known vehicle size (by class).
    """

    def __init__(self, speed_line_config: Dict[str, Any]):
        self.line_p1 = np.array(speed_line_config.get("p1", [0, 540]))
        self.line_p2 = np.array(speed_line_config.get("p2", [1920, 540]))
        self.pixel_to_meter = speed_line_config.get("pixel_to_meter", 0.08)
        self.direction = speed_line_config.get("direction", "vertical")

        self._line_vec = self.line_p2 - self.line_p1
        self._line_len = np.linalg.norm(self._line_vec)

        self._tracks: Dict[int, VehicleTrackState] = {}

        self._avg_vehicle_length = {
            "car": 4.5,
            "truck": 12.0,
            "bus": 10.0,
            "motorcycle": 2.0,
        }

    def _point_signed_distance(self, point: np.ndarray) -> float:
        """
        Signed distance from point to the infinite line defined by p1, p2.
        Positive = on one side, negative = on the other.
        """
        rel = point - self.line_p1
        cross = np.cross(self._line_vec, rel)
        return cross / self._line_len

    def update_track(
        self,
        track_id: int,
        class_name: str,
        bbox: List[float],
        timestamp: float,
    ) -> Optional[float]:
        """
        Update a tracked vehicle and check for line crossing.

        Args:
            track_id: DeepStream tracker ID
            class_name: Vehicle class label
            bbox: [x1, y1, x2, y2] in frame coordinates
            timestamp: Frame timestamp in seconds

        Returns:
            Estimated speed in km/h if line just crossed, else None
        """
        cx = (bbox[0] + bbox[2]) / 2.0
        cy = (bbox[1] + bbox[3]) / 2.0
        center = np.array([cx, cy])

        current_dist = self._point_signed_distance(center)

        if track_id not in self._tracks:
            self._tracks[track_id] = VehicleTrackState(
                track_id=track_id,
                class_name=class_name,
                last_bbox=list(bbox),
                last_timestamp=timestamp,
            )
            self._tracks[track_id].bbox_history.append(
                (cx, cy, timestamp)
            )
            return None

        state = self._tracks[track_id]
        state.bbox_history.append((cx, cy, timestamp))
        if len(state.bbox_history) > 30:
            state.bbox_history = state.bbox_history[-30:]

        prev_dist = state.last_bbox[0] if state.last_bbox else 0.0

        if (
            not state.crossed_line
            and current_dist * prev_dist < 0
        ):
            state.crossed_line = True
            state.line_cross_time = timestamp

            speed = self._estimate_speed_from_bbox(
                state, class_name, timestamp
            )
            state.speed_kmh = speed

            state.last_bbox = list(bbox)
            state.last_timestamp = timestamp
            return speed

        state.last_bbox = list(bbox)
        state.last_timestamp = timestamp
        return None

    def _estimate_speed_from_bbox(
        self,
        state: VehicleTrackState,
        class_name: str,
        current_time: float,
    ) -> float:
        """
        Estimate speed using the vehicle's bounding box height as a
        reference for real-world distance traveled.
        """
        if len(state.bbox_history) < 2:
            return 0.0

        avg_len = self._avg_vehicle_length.get(class_name, 4.5)

        recent = state.bbox_history[-5:]
        first_pt = np.array(recent[0][:2])
        last_pt = np.array(recent[-1][:2])
        dt = recent[-1][2] - recent[0][2]

        if dt <= 0:
            return 0.0

        pixel_dist = np.linalg.norm(last_pt - first_pt)
        meters = pixel_dist * self.pixel_to_meter
        speed_ms = meters / dt
        speed_kmh = speed_ms * 3.6

        bbox_height = state.last_bbox[3] - state.last_bbox[1]
        if bbox_height > 0:
            pixel_per_meter = bbox_height / avg_len
            meters_from_bbox = pixel_dist / pixel_per_meter
            speed_kmh = meters_from_bbox / dt * 3.6

        return max(0.0, min(speed_kmh, 200.0))

    def get_speed(self, track_id: int) -> float:
        """Get cached speed for a track."""
        if track_id in self._tracks:
            return self._tracks[track_id].speed_kmh
        return 0.0


# ---------------------------------------------------------------------------
# Kafka Producer
# ---------------------------------------------------------------------------


class KafkaEventProducer:
    """
    Produce structured traffic events to Kafka topics.

    Event schema (traffic.events):
      {
        "timestamp": "2024-01-01T12:00:00Z",
        "camera_id": "cam_001",
        "camera_name": "east_gate_1",
        "event_type": "vehicle_detected" | "license_plate" | "speed_measured",
        "vehicle": {
          "class": "car",
          "confidence": 0.92,
          "track_id": 42,
          "bbox": [x1, y1, x2, y2],
          "speed_kmh": 65.3,
          "license_plate": "京A12345",
          "lp_confidence": 0.88
        },
        "lighting": {
          "mode": "night",
          "brightness": 45.2,
          "enhancement_applied": true,
          "gamma": 2.3
        }
      }

    Flow aggregation (traffic.flows):
      {
        "timestamp": "...",
        "camera_id": "cam_001",
        "window_seconds": 60,
        "vehicle_count": 127,
        "avg_speed_kmh": 58.4,
        "by_class": {"car": 90, "truck": 15, "bus": 8, "motorcycle": 14}
      }
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._producer = None
        self._topic_events = config.get("topic_events", "traffic.events")
        self._topic_flows = config.get("topic_flows", "traffic.flows")
        self._flush_interval_ms = config.get("flush_interval_ms", 100)
        self._last_flush = time.time()
        self._delivery_count = 0
        self._error_count = 0

    def _get_producer(self):
        if self._producer is None:
            from confluent_kafka import Producer

            self._producer = Producer(
                {
                    "bootstrap.servers": self.config.get(
                        "bootstrap_servers", "kafka:9092"
                    ),
                    "message.max.bytes": 1048576,
                    "compression.type": "lz4",
                    "queue.buffering.max.messages": 100000,
                }
            )
            logger.info(
                "Kafka producer connected to %s",
                self.config.get("bootstrap_servers"),
            )
        return self._producer

    def _delivery_report(self, err, msg):
        if err:
            self._error_count += 1
            logger.debug("Kafka delivery failed: %s", err)
        else:
            self._delivery_count += 1

    def send_event(self, event: Dict[str, Any]) -> None:
        """Send a single structured event to Kafka."""
        try:
            producer = self._get_producer()
            producer.produce(
                self._topic_events,
                key=event.get("camera_id", "").encode(),
                value=json.dumps(event, ensure_ascii=False).encode("utf-8"),
                on_delivery=self._delivery_report,
            )
            self._maybe_flush()
        except Exception as e:
            logger.error("Failed to send Kafka event: %s", e)
            self._error_count += 1

    def send_flow(self, flow: Dict[str, Any]) -> None:
        """Send a flow aggregation record."""
        try:
            producer = self._get_producer()
            producer.produce(
                self._topic_flows,
                key=flow.get("camera_id", "").encode(),
                value=json.dumps(flow, ensure_ascii=False).encode("utf-8"),
                on_delivery=self._delivery_report,
            )
            self._maybe_flush()
        except Exception as e:
            logger.error("Failed to send Kafka flow: %s", e)
            self._error_count += 1

    def _maybe_flush(self) -> None:
        now = time.time()
        if now - self._last_flush >= self._flush_interval_ms / 1000.0:
            self._producer.flush(0.1)
            self._last_flush = now

    def flush(self) -> None:
        """Force flush all pending messages."""
        if self._producer:
            self._producer.flush(2.0)


# ---------------------------------------------------------------------------
# Per-Camera Analytics State
# ---------------------------------------------------------------------------


@dataclass
class CameraAnalytics:
    camera_id: str
    camera_name: str
    speed_estimator: SpeedEstimator
    vehicle_counts: Dict[str, int] = field(
        default_factory=lambda: {
            "car": 0,
            "truck": 0,
            "bus": 0,
            "motorcycle": 0,
        }
    )
    speed_sums: Dict[str, float] = field(
        default_factory=lambda: {
            "car": 0.0,
            "truck": 0.0,
            "bus": 0.0,
            "motorcycle": 0.0,
        }
    )
    speed_counts: Dict[str, int] = field(
        default_factory=lambda: {
            "car": 0,
            "truck": 0,
            "bus": 0,
            "motorcycle": 0,
        }
    )
    window_start: float = 0.0
    window_seconds: int = 60


class TrafficPipeline:
    """
    Main DeepStream pipeline orchestrator.

    Handles:
      - Building the GStreamer pipeline with 8 RTSP sources
      - Pre-processing (low-light enhancement) probe
      - Post-processing (adaptive detection re-filter) probe
      - Speed estimation via virtual line
      - Kafka event output
    """

    def __init__(self, config: PipelineConfig):
        self.config = config
        self._pipeline = None
        self._loop = None
        self._enhancer: Optional[LowLightEnhancer] = None
        self._adaptive_processor: Optional[AdaptivePostProcessor] = None
        self._kafka_producer: Optional[KafkaEventProducer] = None
        self._analytics: Dict[str, CameraAnalytics] = {}
        self._label_map: Dict[int, str] = {}
        self._frame_count = 0
        self._start_time = time.time()

    # ------------------------------------------------------------------
    # Pipeline construction
    # ------------------------------------------------------------------

    def build(self) -> "TrafficPipeline":
        """Build the complete DeepStream pipeline."""
        _ensure_gstreamer()
        _ensure_pyds()

        import pyds
        from gi.repository import Gst

        self._label_map = {
            int(k): v for k, v in self.config.model["vehicle"]["label_map"].items()
        }

        self._enhancer = build_lowlight_enhancer(self.config.lowlight)
        self._adaptive_processor = build_adaptive_detector(
            self.config.adaptive_detection
        )
        self._kafka_producer = KafkaEventProducer(self.config.kafka)

        for s in self.config.streams:
            self._analytics[s.id] = CameraAnalytics(
                camera_id=s.id,
                camera_name=s.name,
                speed_estimator=SpeedEstimator(s.speed_line),
                window_start=time.time(),
            )

        pipeline = Gst.Pipeline.new("traffic-pipeline")

        streammux = Gst.ElementFactory.make("nvstreammux", "streammux")
        streammux.set_property("width", self.config.streammux["width"])
        streammux.set_property("height", self.config.streammux["height"])
        streammux.set_property("batch-size", self.config.streammux["batch_size"])
        streammux.set_property(
            "buffer-pool-size", self.config.streammux.get("buffer_pool_size", 10)
        )
        streammux.set_property(
            "enable-padding", self.config.streammux.get("enable_padding", 0)
        )
        streammux.set_property(
            "nvbuf-memory-type",
            self.config.streammux.get("nvbuf_memory_type", 3),
        )
        pipeline.add(streammux)

        for i, stream in enumerate(self.config.streams):
            src = Gst.ElementFactory.make("rtspsrc", f"src_{i}")
            src.set_property("location", stream.uri)
            src.set_property("latency", 100)
            src.set_property("protocols", 4)
            src.set_property("drop-on-latency", True)

            depay = Gst.ElementFactory.make("rtph264depay", f"depay_{i}")
            parser = Gst.ElementFactory.make("h264parse", f"parser_{i}")
            decoder = Gst.ElementFactory.make("nvv4l2decoder", f"decoder_{i}")

            pipeline.add(src)
            pipeline.add(depay)
            pipeline.add(parser)
            pipeline.add(decoder)

            src.link(depay)
            depay.link(parser)
            parser.link(decoder)

            sink_pad = streammux.get_request_pad(f"sink_{i}")
            src_pad = decoder.get_static_pad("src")
            src_pad.link(sink_pad)

            logger.info("Linked stream %d: %s (%s)", i, stream.id, stream.name)

        pgie = Gst.ElementFactory.make("nvinfer", "pgie-vehicle")
        pgie.set_property(
            "config-file-path",
            str(Path(self.config.pgie["config_path"]).resolve()),
        )
        pgie.set_property("interval", self.config.pgie.get("interval", 0))
        pipeline.add(pgie)
        streammux.link(pgie)

        tracker = Gst.ElementFactory.make("nvtracker", "tracker")
        tracker.set_property(
            "ll-lib-file", self.config.tracker["ll_lib_file"]
        )
        tracker.set_property(
            "ll-config-file",
            str(Path(self.config.tracker["ll_config_file"]).resolve()),
        )
        tracker.set_property("tracker-width", 640)
        tracker.set_property("tracker-height", 384)
        pipeline.add(tracker)
        pgie.link(tracker)

        sgie_lp = Gst.ElementFactory.make("nvinfer", "sgie-lp")
        sgie_lp.set_property(
            "config-file-path",
            str(Path(self.config.sgie_lp["config_path"]).resolve()),
        )
        sgie_lp.set_property("process-mode", 2)
        sgie_lp.set_property("operate-mode", 1)
        sgie_lp.set_property("unique-id", 2)
        pipeline.add(sgie_lp)
        tracker.link(sgie_lp)

        sgie_ocr = Gst.ElementFactory.make("nvinfer", "sgie-ocr")
        sgie_ocr.set_property(
            "config-file-path",
            str(Path(self.config.sgie_ocr["config_path"]).resolve()),
        )
        sgie_ocr.set_property("process-mode", 2)
        sgie_ocr.set_property("operate-mode", 2)
        sgie_ocr.set_property("unique-id", 3)
        pipeline.add(sgie_ocr)
        sgie_lp.link(sgie_ocr)

        converter = Gst.ElementFactory.make("nvvideoconvert", "converter")
        pipeline.add(converter)
        sgie_ocr.link(converter)

        osd = Gst.ElementFactory.make("nvdsosd", "osd")
        osd.set_property("process-mode", self.config.osd.get("process_mode", 1))
        osd.set_property("display-text", self.config.osd.get("display_text", 1))
        osd.set_property("display-bbox", self.config.osd.get("display_bbox", 1))
        pipeline.add(osd)
        converter.link(osd)

        sink = Gst.ElementFactory.make("fakesink", "sink")
        sink.set_property("sync", False)
        pipeline.add(sink)
        osd.link(sink)

        pgie_src_pad = pgie.get_static_pad("src")
        if pgie_src_pad:
            pgie_src_pad.add_probe(
                Gst.PadProbeType.BUFFER, self._pgie_probe_callback
            )

        osd_src_pad = osd.get_static_pad("sink")
        if osd_src_pad:
            osd_src_pad.add_probe(
                Gst.PadProbeType.BUFFER, self._osd_probe_callback
            )

        streammux_src_pad = streammux.get_static_pad("src")
        if streammux_src_pad and self._enhancer:
            streammux_src_pad.add_probe(
                Gst.PadProbeType.BUFFER, self._enhancer_probe_callback
            )

        self._pipeline = pipeline
        logger.info("Pipeline built successfully with %d streams", len(self.config.streams))
        return self

    # ------------------------------------------------------------------
    # Probe callbacks
    # ------------------------------------------------------------------

    def _enhancer_probe_callback(self, pad, info, u_data):
        """
        Probe on streammux src pad: extracts frame from GPU surface,
        applies low-light enhancement on CPU, writes back.

        This runs on the batched output of streammux, so we process
        each source's frame separately.
        """
        from gi.repository import Gst

        buf = info.get_buffer()
        if buf is None:
            return Gst.PadProbeReturn.OK

        try:
            import pyds

            batch_meta = pyds.gst_buffer_get_nvds_batch_meta(hash(buf))
            l_frame = batch_meta.frame_meta_list

            while l_frame is not None:
                try:
                    frame_meta = pyds.glist_get_nvds_frame_meta(l_frame.data)
                except StopIteration:
                    break

                source_id = frame_meta.source_id
                if source_id >= len(self.config.streams):
                    l_frame = l_frame.next
                    continue

                stream = self.config.streams[source_id]
                frame = self._extract_frame_from_surface(buf, frame_meta)

                if frame is not None and self._enhancer:
                    enhanced, metrics = self._enhancer.enhance(
                        frame, tuple(stream.roi)
                    )

                    if metrics.enhancement_applied:
                        self._write_frame_to_surface(buf, frame_meta, enhanced)

                    if self._adaptive_processor:
                        self._adaptive_processor.update_brightness(
                            metrics.mean_luminance
                        )

                    if self._kafka_producer and metrics.enhancement_applied:
                        self._kafka_producer.send_event(
                            {
                                "timestamp": time.strftime(
                                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                                ),
                                "camera_id": stream.id,
                                "camera_name": stream.name,
                                "event_type": "lighting_enhancement",
                                "lighting": {
                                    "mode": "night" if metrics.is_low_light else "day",
                                    "brightness": round(metrics.mean_luminance, 1),
                                    "enhancement_applied": True,
                                    "gamma": round(metrics.gamma_value, 2),
                                    "processing_time_ms": round(
                                        metrics.processing_time_ms, 2
                                    ),
                                },
                            }
                        )

                l_frame = l_frame.next

        except Exception as e:
            logger.debug("Enhancer probe error: %s", e)

        return Gst.PadProbeReturn.OK

    def _pgie_probe_callback(self, pad, info, u_data):
        """
        Probe on PGIE src pad: re-filter detections using adaptive
        thresholds. Modifies the object metadata in-place.
        """
        from gi.repository import Gst

        buf = info.get_buffer()
        if buf is None:
            return Gst.PadProbeReturn.OK

        if not self._adaptive_processor:
            return Gst.PadProbeReturn.OK

        try:
            import pyds

            batch_meta = pyds.gst_buffer_get_nvds_batch_meta(hash(buf))
            l_frame = batch_meta.frame_meta_list

            while l_frame is not None:
                try:
                    frame_meta = pyds.glist_get_nvds_frame_meta(l_frame.data)
                except StopIteration:
                    break

                source_id = frame_meta.source_id
                frame_width = frame_meta.source_frame_width
                frame_height = frame_meta.source_frame_height

                l_obj = frame_meta.obj_meta_list
                candidates: List[DetectionCandidate] = []

                while l_obj is not None:
                    try:
                        obj_meta = pyds.glist_get_nvds_object_meta(l_obj.data)
                    except StopIteration:
                        break

                    class_name = self._label_map.get(
                        obj_meta.class_id, f"class_{obj_meta.class_id}"
                    )
                    bbox = [
                        obj_meta.rect_params.left,
                        obj_meta.rect_params.top,
                        obj_meta.rect_params.left + obj_meta.rect_params.width,
                        obj_meta.rect_params.top + obj_meta.rect_params.height,
                    ]
                    candidates.append(
                        DetectionCandidate(
                            class_name=class_name,
                            confidence=float(obj_meta.confidence),
                            bbox=bbox,
                            track_id=int(obj_meta.object_id),
                        )
                    )
                    l_obj = l_obj.next

                filtered = self._adaptive_processor.filter_detections(
                    candidates, frame_width, frame_height
                )

                if len(filtered) < len(candidates):
                    removed_ids = {c.track_id for c in candidates} - {
                        f.track_id for f in filtered
                    }
                    if removed_ids:
                        l_obj = frame_meta.obj_meta_list
                        prev = None
                        while l_obj is not None:
                            try:
                                obj_meta = pyds.glist_get_nvds_object_meta(
                                    l_obj.data
                                )
                            except StopIteration:
                                break

                            if int(obj_meta.object_id) in removed_ids:
                                if prev:
                                    prev.next = l_obj.next
                                else:
                                    frame_meta.obj_meta_list = l_obj.next
                                l_obj = l_obj.next
                                continue
                            prev = l_obj
                            l_obj = l_obj.next

                l_frame = l_frame.next

        except Exception as e:
            logger.debug("PGIE probe error: %s", e)

        return Gst.PadProbeReturn.OK

    def _osd_probe_callback(self, pad, info, u_data):
        """
        Probe on OSD sink pad: extract final detections, estimate
        speeds, and emit Kafka events.
        """
        from gi.repository import Gst

        buf = info.get_buffer()
        if buf is None:
            return Gst.PadProbeReturn.OK

        try:
            import pyds

            batch_meta = pyds.gst_buffer_get_nvds_batch_meta(hash(buf))
            l_frame = batch_meta.frame_meta_list

            while l_frame is not None:
                try:
                    frame_meta = pyds.glist_get_nvds_frame_meta(l_frame.data)
                except StopIteration:
                    break

                source_id = frame_meta.source_id
                if source_id >= len(self.config.streams):
                    l_frame = l_frame.next
                    continue

                stream = self.config.streams[source_id]
                analytics = self._analytics.get(stream.id)
                if analytics is None:
                    l_frame = l_frame.next
                    continue

                timestamp = frame_meta.ntp_timestamp / 1e9

                l_obj = frame_meta.obj_meta_list
                detections = []

                while l_obj is not None:
                    try:
                        obj_meta = pyds.glist_get_nvds_object_meta(l_obj.data)
                    except StopIteration:
                        break

                    if obj_meta.class_id not in self._label_map:
                        l_obj = l_obj.next
                        continue

                    class_name = self._label_map[obj_meta.class_id]
                    track_id = int(obj_meta.object_id)
                    bbox = [
                        obj_meta.rect_params.left,
                        obj_meta.rect_params.top,
                        obj_meta.rect_params.left + obj_meta.rect_params.width,
                        obj_meta.rect_params.top + obj_meta.rect_params.height,
                    ]

                    speed = analytics.speed_estimator.update_track(
                        track_id, class_name, bbox, timestamp
                    )

                    lp_text = ""
                    lp_conf = 0.0
                    l_user = obj_meta.obj_user_meta_list
                    while l_user is not None:
                        try:
                            user_meta = pyds.glist_get_nvds_user_meta(l_user.data)
                        except StopIteration:
                            break
                        if user_meta.base_meta.meta_type == pyds.NvDsUserMetaType.NVDS_USER_META_TYPE_TEXT:
                            text_meta = pyds.cast_user_meta_to_nvds_obj_infer_meta(user_meta)
                            if text_meta and text_meta.classifier_meta_list:
                                cls_meta = text_meta.classifier_meta_list
                                while cls_meta is not None:
                                    try:
                                        c = pyds.glist_get_nvds_classifier_meta(cls_meta.data)
                                    except StopIteration:
                                        break
                                    lp_text = c.label_info[0].result_label
                                    lp_conf = float(c.label_info[0].result_prob)
                                    cls_meta = cls_meta.next
                        l_user = l_user.next

                    if speed is not None:
                        analytics.vehicle_counts[class_name] += 1
                        analytics.speed_sums[class_name] += speed
                        analytics.speed_counts[class_name] += 1

                        if self._kafka_producer:
                            event = {
                                "timestamp": time.strftime(
                                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                                ),
                                "camera_id": stream.id,
                                "camera_name": stream.name,
                                "event_type": "speed_measured",
                                "vehicle": {
                                    "class": class_name,
                                    "confidence": float(obj_meta.confidence),
                                    "track_id": track_id,
                                    "bbox": [round(v, 1) for v in bbox],
                                    "speed_kmh": round(speed, 1),
                                    "license_plate": lp_text,
                                    "lp_confidence": round(lp_conf, 3),
                                },
                            }
                            if self._enhancer:
                                avg_metrics = self._enhancer.get_average_metrics()
                                if avg_metrics:
                                    event["lighting"] = {
                                        "mode": "night" if avg_metrics.is_low_light else "day",
                                        "brightness": round(avg_metrics.mean_luminance, 1),
                                        "enhancement_applied": avg_metrics.enhancement_applied,
                                        "gamma": round(avg_metrics.gamma_value, 2),
                                    }
                            self._kafka_producer.send_event(event)

                    detections.append(
                        {
                            "class": class_name,
                            "confidence": float(obj_meta.confidence),
                            "track_id": track_id,
                            "bbox": bbox,
                        }
                    )
                    l_obj = l_obj.next

                now = time.time()
                if now - analytics.window_start >= analytics.window_seconds:
                    total = sum(analytics.vehicle_counts.values())
                    if total > 0 and self._kafka_producer:
                        avg_speeds = {}
                        for cls in analytics.speed_sums:
                            cnt = analytics.speed_counts[cls]
                            if cnt > 0:
                                avg_speeds[cls] = round(
                                    analytics.speed_sums[cls] / cnt, 1
                                )
                        flow = {
                            "timestamp": time.strftime(
                                "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                            ),
                            "camera_id": stream.id,
                            "camera_name": stream.name,
                            "window_seconds": analytics.window_seconds,
                            "vehicle_count": total,
                            "by_class": dict(analytics.vehicle_counts),
                            "avg_speed_kmh_by_class": avg_speeds,
                        }
                        self._kafka_producer.send_flow(flow)

                    analytics.window_start = now
                    analytics.vehicle_counts = {
                        k: 0 for k in analytics.vehicle_counts
                    }
                    analytics.speed_sums = {
                        k: 0.0 for k in analytics.speed_sums
                    }
                    analytics.speed_counts = {
                        k: 0 for k in analytics.speed_counts
                    }

                l_frame = l_frame.next

            self._frame_count += 1
            if self._frame_count % 300 == 0:
                elapsed = time.time() - self._start_time
                fps = self._frame_count / elapsed if elapsed > 0 else 0
                logger.info("Processed %d frames (%.1f FPS)", self._frame_count, fps)

        except Exception as e:
            logger.debug("OSD probe error: %s", e)

        return Gst.PadProbeReturn.OK

    # ------------------------------------------------------------------
    # GPU surface <-> CPU frame conversion helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_frame_from_surface(buf, frame_meta) -> Optional[np.ndarray]:
        """Extract a single frame from a batched NVMM surface to CPU."""
        try:
            import pyds

            surface = pyds.get_nvds_buf_surface(hash(buf), frame_meta.batch_id)
            if surface is None:
                return None
            frame = np.array(surface, copy=True)
            return frame
        except Exception as e:
            logger.debug("Frame extraction failed: %s", e)
            return None

    @staticmethod
    def _write_frame_to_surface(buf, frame_meta, frame: np.ndarray) -> None:
        """Write an enhanced frame back to the NVMM surface."""
        try:
            import pyds

            surface = pyds.get_nvds_buf_surface(hash(buf), frame_meta.batch_id)
            if surface is not None:
                np.copyto(surface, frame)
        except Exception as e:
            logger.debug("Frame write-back failed: %s", e)

    # ------------------------------------------------------------------
    # Pipeline execution
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the pipeline and run the main loop."""
        if self._pipeline is None:
            raise RuntimeError("Pipeline not built. Call build() first.")

        from gi.repository import GLib

        self._loop = GLib.MainLoop()

        logger.info("Starting pipeline...")
        self._pipeline.set_state(Gst.State.PLAYING)

        try:
            self._loop.run()
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            self.stop()

    def stop(self) -> None:
        """Stop the pipeline and clean up resources."""
        logger.info("Stopping pipeline...")
        if self._pipeline:
            self._pipeline.set_state(Gst.State.NULL)
        if self._loop:
            self._loop.quit()
        if self._kafka_producer:
            self._kafka_producer.flush()
        logger.info("Pipeline stopped")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="DeepStream Traffic Analytics Pipeline with Low-Light Enhancement"
    )
    parser.add_argument(
        "-c",
        "--config",
        type=str,
        default="configs/config.yml",
        help="Path to YAML configuration file",
    )
    parser.add_argument(
        "--no-enhancer",
        action="store_true",
        help="Disable low-light enhancement (override config)",
    )
    parser.add_argument(
        "--no-adaptive",
        action="store_true",
        help="Disable adaptive detection (override config)",
    )
    args = parser.parse_args()

    config = load_config(args.config)

    if args.no_enhancer:
        config.lowlight["enabled"] = False
    if args.no_adaptive:
        config.adaptive_detection["enabled"] = False

    pipeline = TrafficPipeline(config)
    pipeline.build()
    pipeline.start()


if __name__ == "__main__":
    main()

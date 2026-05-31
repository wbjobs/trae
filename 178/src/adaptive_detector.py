"""
Adaptive detection threshold module for low-light conditions.

Dynamically adjusts per-class confidence thresholds and NMS parameters
based on current frame brightness to recover night-time mAP.

Strategy:
  - Low brightness  -> lower confidence threshold + higher NMS IOU
  - Medium brightness -> moderate adjustment
  - High brightness -> standard thresholds (original)
  - Also incorporates temporal smoothing to avoid flicker
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np


@dataclass
class AdaptiveThresholdConfig:
    """
    Adaptive threshold configuration per class.

    Each class has a min and max confidence threshold. The actual
    threshold is linearly interpolated based on brightness:
        threshold = lerp(threshold_min, threshold_max, brightness_factor)
    where brightness_factor = 1.0 at daytime, 0.0 at night.
    """

    class_thresholds: Dict[str, Dict[str, float]] = field(
        default_factory=lambda: {
            "car":         {"min": 0.25, "max": 0.50},
            "truck":       {"min": 0.20, "max": 0.45},
            "bus":         {"min": 0.20, "max": 0.45},
            "motorcycle":  {"min": 0.22, "max": 0.48},
        }
    )

    nms_iou_thresholds: Dict[str, Dict[str, float]] = field(
        default_factory=lambda: {
            "car":         {"min": 0.55, "max": 0.45},
            "truck":       {"min": 0.60, "max": 0.45},
            "bus":         {"min": 0.60, "max": 0.45},
            "motorcycle":  {"min": 0.55, "max": 0.45},
        }
    )

    brightness_day_threshold: float = 120.0
    brightness_night_threshold: float = 60.0

    min_bbox_size_ratio: Dict[str, float] = field(
        default_factory=lambda: {
            "car": 0.01,
            "truck": 0.015,
            "bus": 0.015,
            "motorcycle": 0.005,
        }
    )

    temporal_smoothing_window: int = 10
    min_area_pixels: int = 200


class AdaptiveThresholdManager:
    """
    Manages adaptive detection thresholds.

    Maintains a sliding window of brightness measurements and
    computes per-class thresholds + NMS parameters accordingly.
    """

    def __init__(self, config: Optional[AdaptiveThresholdConfig] = None):
        self.config = config or AdaptiveThresholdConfig()
        self._brightness_history: deque[float] = deque(
            maxlen=self.config.temporal_smoothing_window
        )
        self._smoothed_brightness: float = 128.0

    def update_brightness(self, mean_luminance: float) -> None:
        """Feed a new brightness measurement."""
        self._brightness_history.append(mean_luminance)
        self._smoothed_brightness = float(np.mean(self._brightness_history))

    def _brightness_factor(self) -> float:
        """
        Map brightness to [0, 1] where:
          1.0 = full daytime
          0.0 = full night
        """
        cfg = self.config
        b = self._smoothed_brightness
        if b >= cfg.brightness_day_threshold:
            return 1.0
        if b <= cfg.brightness_night_threshold:
            return 0.0
        return (b - cfg.brightness_night_threshold) / (
            cfg.brightness_day_threshold - cfg.brightness_night_threshold
        )

    def get_class_confidence_threshold(self, class_name: str) -> float:
        """Get adaptive confidence threshold for a class."""
        cfg = self.config
        if class_name not in cfg.class_thresholds:
            return 0.35
        t = cfg.class_thresholds[class_name]
        factor = self._brightness_factor()
        return t["min"] + (t["max"] - t["min"]) * factor

    def get_class_nms_threshold(self, class_name: str) -> float:
        """Get adaptive NMS IOU threshold for a class."""
        cfg = self.config
        if class_name not in cfg.nms_iou_thresholds:
            return 0.45
        t = cfg.nms_iou_thresholds[class_name]
        factor = self._brightness_factor()
        return t["min"] + (t["max"] - t["min"]) * factor

    def get_min_bbox_size(self, class_name: str, frame_area: int) -> int:
        """Get minimum bounding box size in pixels for a class."""
        cfg = self.config
        ratio = cfg.min_bbox_size_ratio.get(class_name, 0.01)
        return max(cfg.min_area_pixels, int(frame_area * ratio))

    def is_night(self) -> bool:
        """Check if current smoothed brightness indicates night."""
        return self._smoothed_brightness < self.config.brightness_night_threshold

    def get_mode(self) -> str:
        """Return current mode string."""
        if self.is_night():
            return "night"
        if self._smoothed_brightness < self.config.brightness_day_threshold:
            return "lowlight"
        return "day"

    def get_status(self) -> dict:
        """Return current status for logging/metrics."""
        return {
            "mode": self.get_mode(),
            "smoothed_brightness": round(self._smoothed_brightness, 2),
            "brightness_factor": round(self._brightness_factor(), 3),
            "class_confidence_thresholds": {
                cls: round(self.get_class_confidence_threshold(cls), 3)
                for cls in self.config.class_thresholds
            },
            "class_nms_thresholds": {
                cls: round(self.get_class_nms_threshold(cls), 3)
                for cls in self.config.nms_iou_thresholds
            },
        }


@dataclass
class DetectionCandidate:
    """A single detection candidate from the model output."""

    class_name: str
    confidence: float
    bbox: List[float]
    track_id: int = -1


class AdaptivePostProcessor:
    """
    Post-processes raw model detections using adaptive thresholds.

    This runs inside the DeepStream pipeline's probe callback on the
    PGIE output metadata. It re-filters detections using adaptive
    thresholds and applies per-class NMS with adjusted IOU.
    """

    def __init__(
        self,
        threshold_manager: Optional[AdaptiveThresholdManager] = None,
        config: Optional[AdaptiveThresholdConfig] = None,
    ):
        self.manager = threshold_manager or AdaptiveThresholdManager(config)
        self._detection_cache: Dict[int, List[DetectionCandidate]] = {}

    def update_brightness(self, mean_luminance: float) -> None:
        """Feed brightness from the enhancer."""
        self.manager.update_brightness(mean_luminance)

    def filter_detections(
        self,
        candidates: List[DetectionCandidate],
        frame_width: int,
        frame_height: int,
    ) -> List[DetectionCandidate]:
        """
        Filter raw detections using adaptive thresholds + NMS.

        Args:
            candidates: Raw detection candidates from PGIE metadata
            frame_width: Frame width in pixels
            frame_height: Frame height in pixels

        Returns:
            Filtered list of detections
        """
        frame_area = frame_width * frame_height
        kept: List[DetectionCandidate] = []

        grouped: Dict[str, List[DetectionCandidate]] = {}
        for det in candidates:
            grouped.setdefault(det.class_name, []).append(det)

        for class_name, dets in grouped.items():
            conf_thresh = self.manager.get_class_confidence_threshold(class_name)
            nms_thresh = self.manager.get_class_nms_threshold(class_name)
            min_size = self.manager.get_min_bbox_size(class_name, frame_area)

            filtered = [
                d
                for d in dets
                if d.confidence >= conf_thresh
                and self._bbox_area(d.bbox) >= min_size
            ]

            if len(filtered) > 1:
                filtered = self._per_class_nms(filtered, nms_thresh)

            kept.extend(filtered)

        kept.sort(key=lambda d: d.confidence, reverse=True)
        return kept

    @staticmethod
    def _bbox_area(bbox: List[float]) -> float:
        """Compute bounding box area."""
        return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])

    @staticmethod
    def _iou(a: List[float], b: List[float]) -> float:
        """Compute intersection over union for two bboxes [x1, y1, x2, y2]."""
        x1 = max(a[0], b[0])
        y1 = max(a[1], b[1])
        x2 = min(a[2], b[2])
        y2 = min(a[3], b[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = (a[2] - a[0]) * (a[3] - a[1])
        area_b = (b[2] - b[0]) * (b[3] - b[1])
        union = area_a + area_b - inter
        return inter / max(union, 1e-6)

    @classmethod
    def _per_class_nms(
        cls, dets: List[DetectionCandidate], iou_threshold: float
    ) -> List[DetectionCandidate]:
        """Apply per-class NMS."""
        if not dets:
            return []
        dets_sorted = sorted(dets, key=lambda d: d.confidence, reverse=True)
        keep: List[DetectionCandidate] = []
        while dets_sorted:
            best = dets_sorted.pop(0)
            keep.append(best)
            dets_sorted = [
                d
                for d in dets_sorted
                if cls._iou(best.bbox, d.bbox) < iou_threshold
            ]
        return keep

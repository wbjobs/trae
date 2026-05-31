import threading
import numpy as np
import cv2
from typing import Tuple, List
from dataclasses import dataclass
from collections import deque


@dataclass
class ComplexityScore:
    edge_density: float
    texture_variance: float
    motion_magnitude: float
    combined: float
    level: str


class SceneAnalyzer:
    def __init__(
        self,
        edge_threshold_low: int = 50,
        edge_threshold_high: int = 150,
        motion_alpha: float = 0.3,
        history_size: int = 5,
    ):
        self._edge_low = edge_threshold_low
        self._edge_high = edge_threshold_high
        self._motion_alpha = motion_alpha
        self._prev_gray: np.ndarray | None = None
        self._history = deque(maxlen=history_size)
        self._lock = threading.Lock()

    def _compute_edge_density(self, gray: np.ndarray) -> float:
        edges = cv2.Canny(gray, self._edge_low, self._edge_high)
        return float(np.count_nonzero(edges) / edges.size

    def _compute_texture_variance(self, gray: np.ndarray) -> float:
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        return float(np.var(laplacian))

    def _compute_motion(self, gray: np.ndarray) -> float:
        if self._prev_gray is None:
            self._prev_gray = gray
            return 0.0
        flow = cv2.calcOpticalFlowFarneback(
            self._prev_gray, gray, None,
            0.5, 3, 15, 3, 5, 1.2, 0,
        )
        magnitude = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)
        self._prev_gray = gray
        return float(np.mean(magnitude))

    def analyze(self, frame: np.ndarray) -> ComplexityScore:
        with self._lock:
            if frame.ndim == 3:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            else:
                gray = frame

            small = cv2.resize(gray, (320, 180))

            edge_density = self._compute_edge_density(small)
            texture_variance = self._compute_texture_variance(small)
            motion_magnitude = self._compute_motion(small)

            edge_norm = min(edge_density / 0.3, 1.0)
            texture_norm = min(texture_variance / 500.0, 1.0)
            motion_norm = min(motion_magnitude / 10.0, 1.0)

            combined = (
                0.4 * edge_norm
                + 0.35 * texture_norm
                + 0.25 * motion_norm
            )

            if combined < 0.25:
                level = "simple"
            elif combined < 0.6:
                level = "standard"
            else:
                level = "complex"

            score = ComplexityScore(
                edge_density=edge_density,
                texture_variance=texture_variance,
                motion_magnitude=motion_magnitude,
                combined=combined,
                level=level,
            )

            self._history.append(score)
            return score

    def analyze_batch(self, frames: List[np.ndarray]) -> List[ComplexityScore]:
        return [self.analyze(f) for f in frames]

    def get_batch_level(self, frames: List[np.ndarray]) -> str:
        if not frames:
            return "standard"
        scores = self.analyze_batch(frames)
        combined_scores = [s.combined for s in scores]
        avg = sum(combined_scores) / len(combined_scores)
        if avg < 0.25:
            return "simple"
        elif avg < 0.6:
            return "standard"
        return "complex"

    @property
    def last_score(self) -> ComplexityScore | None:
        if not self._history:
            return None
        return self._history[-1]

    @property
    def history(self) -> list:
        return list(self._history)

    def reset(self):
        with self._lock:
            self._prev_gray = None
            self._history.clear()
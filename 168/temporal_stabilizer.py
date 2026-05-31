import threading
import numpy as np
import cv2
from typing import Optional


class TemporalStabilizer:
    def __init__(
        self,
        enabled: bool = True,
        alpha: float = 0.92,
        strength: float = 0.85,
        chroma_alpha: float = 0.97,
        chroma_strength: float = 0.5,
        reference_history: int = 5,
    ):
        self._enabled = enabled
        self._alpha = alpha
        self._strength = strength
        self._chroma_alpha = chroma_alpha
        self._chroma_strength = chroma_strength
        self._reference_history = reference_history

        self._l_reference: Optional[np.ndarray] = None
        self._a_reference: Optional[np.ndarray] = None
        self._b_reference: Optional[np.ndarray] = None

        self._l_history: list = []
        self._initialized = False
        self._lock = threading.Lock()

        self._frame_count = 0

    def _compute_cdf(self, channel: np.ndarray) -> np.ndarray:
        hist = cv2.calcHist([channel], [0], None, [256], [0, 256])
        cdf = hist.cumsum()
        cdf_normalized = cdf / cdf.max()
        return cdf_normalized.flatten()

    def _match_histogram(self, source: np.ndarray, reference: np.ndarray) -> np.ndarray:
        src_cdf = self._compute_cdf(source)
        ref_cdf = self._compute_cdf(reference)

        lut = np.zeros(256, dtype=np.uint8)
        ref_gj = 0
        for src_gi in range(256):
            while ref_gj < 255 and ref_cdf[ref_gj] < src_cdf[src_gi]:
                ref_gj += 1
            lut[src_gi] = ref_gj

        return cv2.LUT(source, lut)

    def _blend_with_strength(
        self, original: np.ndarray, matched: np.ndarray, strength: float
    ) -> np.ndarray:
        blended = cv2.addWeighted(matched, strength, original, 1.0 - strength, 0)
        return blended

    def stabilize(self, frame: np.ndarray) -> np.ndarray:
        if not self._enabled:
            return frame

        with self._lock:
            self._frame_count += 1

            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l_channel, a_channel, b_channel = cv2.split(lab)

            if not self._initialized:
                self._l_reference = l_channel.astype(np.float32)
                self._a_reference = a_channel.astype(np.float32)
                self._b_reference = b_channel.astype(np.float32)
                self._l_history = [l_channel.copy()]
                self._initialized = True
                return frame

            l_float = l_channel.astype(np.float32)
            a_float = a_channel.astype(np.float32)
            b_float = b_channel.astype(np.float32)

            self._l_reference = (
                self._alpha * self._l_reference + (1.0 - self._alpha) * l_float
            )
            self._a_reference = (
                self._chroma_alpha * self._a_reference
                + (1.0 - self._chroma_alpha) * a_float
            )
            self._b_reference = (
                self._chroma_alpha * self._b_reference
                + (1.0 - self._chroma_alpha) * b_float
            )

            self._l_history.append(l_channel.copy())
            if len(self._l_history) > self._reference_history:
                self._l_history.pop(0)

            ref_for_match = np.clip(self._l_reference, 0, 255).astype(np.uint8)

            l_matched = self._match_histogram(l_channel, ref_for_match)

            a_ref_uint8 = np.clip(self._a_reference, 0, 255).astype(np.uint8)
            b_ref_uint8 = np.clip(self._b_reference, 0, 255).astype(np.uint8)
            a_matched = self._match_histogram(a_channel, a_ref_uint8)
            b_matched = self._match_histogram(b_channel, b_ref_uint8)

            l_stabilized = self._blend_with_strength(
                l_channel, l_matched, self._strength
            )
            a_stabilized = self._blend_with_strength(
                a_channel, a_matched, self._chroma_strength
            )
            b_stabilized = self._blend_with_strength(
                b_channel, b_matched, self._chroma_strength
            )

            lab_stabilized = cv2.merge([l_stabilized, a_stabilized, b_stabilized])
            result = cv2.cvtColor(lab_stabilized, cv2.COLOR_LAB2BGR)

            return result

    def reset(self):
        with self._lock:
            self._l_reference = None
            self._a_reference = None
            self._b_reference = None
            self._l_history = []
            self._initialized = False
            self._frame_count = 0

    @property
    def frame_count(self) -> int:
        return self._frame_count

    @property
    def enabled(self) -> bool:
        return self._enabled

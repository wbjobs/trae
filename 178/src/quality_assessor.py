"""
Image quality assessment module for low-light enhancement validation.

Provides PSNR, SSIM, and brightness histogram metrics to quantify
the improvement from the low-light enhancer. These metrics are
logged periodically and can be exposed via Grafana dashboards.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np


@dataclass
class QualityMetrics:
    """Image quality assessment results."""

    psnr: float = 0.0
    ssim: float = 0.0
    mean_luminance: float = 0.0
    std_luminance: float = 0.0
    brightness_histogram_bins: List[int] = field(default_factory=list)
    entropy: float = 0.0


class QualityAssessor:
    """
    Compute image quality metrics for evaluating low-light enhancement.

    Usage:
      assessor = QualityAssessor()
      metrics = assessor.assess(original_frame, enhanced_frame)
      # metrics.psnr, metrics.ssim, etc.
    """

    def __init__(self, histogram_bins: int = 8):
        self._histogram_bins = histogram_bins

    def assess(
        self,
        original: np.ndarray,
        enhanced: Optional[np.ndarray] = None,
    ) -> QualityMetrics:
        """
        Compute quality metrics on the (optionally enhanced) frame.

        Args:
            original: Original BGR frame
            enhanced: Enhanced BGR frame (None = only assess original)

        Returns:
            QualityMetrics with PSNR (if enhanced provided), SSIM, etc.
        """
        metrics = QualityMetrics()

        target = enhanced if enhanced is not None else original

        gray = cv2.cvtColor(target, cv2.COLOR_BGR2GRAY)
        metrics.mean_luminance = float(np.mean(gray))
        metrics.std_luminance = float(np.std(gray))

        hist, _ = np.histogram(gray, bins=self._histogram_bins, range=(0, 256))
        metrics.brightness_histogram_bins = hist.tolist()

        hist_norm = hist.astype(np.float64) / hist.sum()
        hist_norm = hist_norm[hist_norm > 0]
        metrics.entropy = float(-np.sum(hist_norm * np.log2(hist_norm)))

        if enhanced is not None and original is not None:
            metrics.psnr = self._compute_psnr(original, enhanced)
            metrics.ssim = self._compute_ssim(
                cv2.cvtColor(original, cv2.COLOR_BGR2GRAY),
                gray,
            )

        return metrics

    @staticmethod
    def _compute_psnr(img1: np.ndarray, img2: np.ndarray) -> float:
        """Compute Peak Signal-to-Noise Ratio between two images."""
        mse = np.mean((img1.astype(np.float64) - img2.astype(np.float64)) ** 2)
        if mse == 0:
            return 100.0
        max_pixel = 255.0
        return float(20 * np.log10(max_pixel / np.sqrt(mse)))

    @staticmethod
    def _compute_ssim(img1: np.ndarray, img2: np.ndarray) -> float:
        """
        Compute Structural Similarity Index (simplified, single-scale).

        Uses OpenCV's built-in implementation via mean/std statistics.
        """
        C1 = (0.01 * 255) ** 2
        C2 = (0.03 * 255) ** 2

        img1 = img1.astype(np.float64)
        img2 = img2.astype(np.float64)

        mu1 = cv2.GaussianBlur(img1, (11, 11), 1.5)
        mu2 = cv2.GaussianBlur(img2, (11, 11), 1.5)

        mu1_sq = mu1 ** 2
        mu2_sq = mu2 ** 2
        mu1_mu2 = mu1 * mu2

        sigma1_sq = cv2.GaussianBlur(img1 ** 2, (11, 11), 1.5) - mu1_sq
        sigma2_sq = cv2.GaussianBlur(img2 ** 2, (11, 11), 1.5) - mu2_sq
        sigma12 = cv2.GaussianBlur(img1 * img2, (11, 11), 1.5) - mu1_mu2

        ssim_map = ((2 * mu1_mu2 + C1) * (2 * sigma12 + C2)) / (
            (mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2)
        )
        return float(np.mean(ssim_map))

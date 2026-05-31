from collections import deque
from typing import Deque, List, Tuple
import numpy as np


class AnomalyDetector:
    def __init__(self, window_size: int = 100, sigma: float = 3):
        self.window_size = window_size
        self.sigma = sigma
        self.price_window: Deque[float] = deque(maxlen=window_size)

    def detect_batch(self, prices: List[float]) -> List[Tuple[bool, float, float, float]]:
        results = []
        for price in prices:
            self.price_window.append(price)
            if len(self.price_window) < 30:
                results.append((False, 0.0, 0.0, 0.0))
                continue
            price_array = np.array(self.price_window)
            mean = float(np.mean(price_array))
            std = float(np.std(price_array))
            if std < 1e-9:
                results.append((False, mean, std, 0.0))
                continue
            z_score = (price - mean) / std
            is_anomaly = abs(z_score) > self.sigma
            results.append((is_anomaly, mean, std, z_score))
        return results

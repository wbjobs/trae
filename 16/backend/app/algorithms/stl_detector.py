import numpy as np
import pandas as pd
from statsmodels.tsa.seasonal import STL
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta


class STLAnomalyDetector:
    def __init__(self, period: int = 7, seasonal: int = 7, robust: bool = True):
        self.period = period
        self.seasonal = seasonal
        self.robust = robust

    def detect_volume_anomalies(
        self,
        time_series: pd.Series,
        z_threshold: float = 3.0,
    ) -> Tuple[pd.DataFrame, List[int]]:
        if len(time_series) < self.period * 2:
            return pd.DataFrame(), []
        
        series = time_series.asfreq("D").fillna(0)
        
        stl = STL(
            series,
            period=self.period,
            seasonal=self.seasonal,
            robust=self.robust,
        )
        result = stl.fit()
        
        residual = result.resid
        trend = result.trend
        seasonal = result.seasonal
        
        resid_std = residual.std()
        resid_mean = residual.mean()
        
        z_scores = (residual - resid_mean) / resid_std
        anomaly_mask = np.abs(z_scores) > z_threshold
        anomaly_indices = list(np.where(anomaly_mask)[0])
        
        anomaly_scores = np.abs(z_scores)
        
        result_df = pd.DataFrame({
            "date": series.index,
            "actual": series.values,
            "trend": trend.values,
            "seasonal": seasonal.values,
            "residual": residual.values,
            "z_score": z_scores.values,
            "anomaly_score": anomaly_scores.values,
            "is_anomaly": anomaly_mask.values,
        })
        
        return result_df, anomaly_indices

    def detect_duration_anomalies(
        self,
        durations: List[float],
        window_size: int = 30,
        threshold_multiplier: float = 3.0,
    ) -> List[Dict]:
        if len(durations) < window_size:
            return []
        
        durations_np = np.array(durations)
        anomalies = []
        
        for i in range(window_size, len(durations)):
            window = durations_np[i - window_size : i]
            median = np.median(window)
            mad = np.median(np.abs(window - median))
            modified_z_score = 0.6745 * (durations_np[i] - median) / (mad + 1e-10)
            
            if np.abs(modified_z_score) > threshold_multiplier:
                anomalies.append({
                    "index": i,
                    "value": float(durations_np[i]),
                    "expected_median": float(median),
                    "z_score": float(modified_z_score),
                    "anomaly_score": float(np.abs(modified_z_score)),
                })
        
        return anomalies

    def compute_anomaly_score(
        self,
        order_count: int,
        historical_mean: float,
        historical_std: float,
        transit_hours: Optional[float] = None,
        expected_transit: Optional[float] = None,
    ) -> float:
        volume_z = 0.0
        if historical_std > 0:
            volume_z = abs((order_count - historical_mean) / historical_std)
        
        duration_z = 0.0
        if transit_hours is not None and expected_transit is not None and expected_transit > 0:
            duration_z = abs((transit_hours - expected_transit) / (expected_transit * 0.3 + 1e-10))
        
        composite_score = volume_z * 0.6 + duration_z * 0.4
        return float(composite_score)

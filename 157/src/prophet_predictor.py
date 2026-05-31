import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass

import numpy as np
import pandas as pd

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    logging.getLogger(__name__).warning("Prophet not available. Prediction features disabled.")

logger = logging.getLogger(__name__)


@dataclass
class PredictionResult:
    timestamp: datetime
    sensor_id: str
    predicted_value: float
    lower_bound: float
    upper_bound: float
    is_anomaly: bool


class ProphetPredictor:
    def __init__(
        self,
        training_window: int = 86400,
        prediction_horizon: int = 3600,
        confidence_interval: float = 0.95,
        retrain_interval: int = 3600,
        seasonality_mode: str = "additive",
    ):
        if not PROPHET_AVAILABLE:
            logger.error("Prophet is not available. Cannot initialize predictor.")
            raise ImportError("prophet package is required for predictions")

        self.training_window = training_window
        self.prediction_horizon = prediction_horizon
        self.confidence_interval = confidence_interval
        self.retrain_interval = retrain_interval
        self.seasonality_mode = seasonality_mode

        self._models: Dict[str, Prophet] = {}
        self._last_training_time: Dict[str, datetime] = {}
        self._sensor_data: Dict[str, List[Tuple[datetime, float]]] = {}

    def add_reading(self, sensor_id: str, timestamp: datetime, temperature: float) -> None:
        if sensor_id not in self._sensor_data:
            self._sensor_data[sensor_id] = []

        self._sensor_data[sensor_id].append((timestamp, temperature))

        cutoff_time = datetime.now() - timedelta(seconds=self.training_window)
        self._sensor_data[sensor_id] = [
            (ts, temp) for ts, temp in self._sensor_data[sensor_id]
            if ts > cutoff_time
        ]

    def _prepare_training_data(self, sensor_id: str) -> Optional[pd.DataFrame]:
        data = self._sensor_data.get(sensor_id, [])
        if len(data) < 100:
            return None

        df = pd.DataFrame(data, columns=["ds", "y"])
        df = df.drop_duplicates(subset="ds")
        df = df.sort_values("ds")

        if len(df) < 100:
            return None

        return df

    def train_model(self, sensor_id: str) -> bool:
        df = self._prepare_training_data(sensor_id)
        if df is None:
            logger.debug(f"Not enough data to train model for {sensor_id}")
            return False

        try:
            model = Prophet(
                interval_width=self.confidence_interval,
                seasonality_mode=self.seasonality_mode,
                daily_seasonality="auto",
                weekly_seasonality="auto",
            )
            model.fit(df)

            self._models[sensor_id] = model
            self._last_training_time[sensor_id] = datetime.now()

            logger.info(f"Model trained for {sensor_id} with {len(df)} data points")
            return True
        except Exception as e:
            logger.error(f"Failed to train model for {sensor_id}: {e}")
            return False

    def should_retrain(self, sensor_id: str) -> bool:
        last_train = self._last_training_time.get(sensor_id)
        if last_train is None:
            return True

        elapsed = (datetime.now() - last_train).total_seconds()
        return elapsed >= self.retrain_interval

    def predict(
        self,
        sensor_id: str,
        current_temp: float,
        current_time: Optional[datetime] = None,
    ) -> Optional[PredictionResult]:
        if current_time is None:
            current_time = datetime.now()

        if self.should_retrain(sensor_id):
            self.train_model(sensor_id)

        model = self._models.get(sensor_id)
        if model is None:
            return None

        try:
            future = pd.DataFrame({"ds": [current_time]})
            forecast = model.predict(future)

            predicted_value = float(forecast["yhat"].iloc[0])
            lower_bound = float(forecast["yhat_lower"].iloc[0])
            upper_bound = float(forecast["yhat_upper"].iloc[0])

            is_anomaly = current_temp < lower_bound or current_temp > upper_bound

            return PredictionResult(
                timestamp=current_time,
                sensor_id=sensor_id,
                predicted_value=predicted_value,
                lower_bound=lower_bound,
                upper_bound=upper_bound,
                is_anomaly=is_anomaly,
            )
        except Exception as e:
            logger.error(f"Prediction failed for {sensor_id}: {e}")
            return None

    def predict_range(
        self,
        sensor_id: str,
        start_time: datetime,
        end_time: datetime,
        freq: str = "1s",
    ) -> Optional[List[PredictionResult]]:
        model = self._models.get(sensor_id)
        if model is None:
            return None

        try:
            future = pd.DataFrame({
                "ds": pd.date_range(start=start_time, end=end_time, freq=freq)
            })
            forecast = model.predict(future)

            results = []
            for _, row in forecast.iterrows():
                results.append(PredictionResult(
                    timestamp=row["ds"].to_pydatetime(),
                    sensor_id=sensor_id,
                    predicted_value=float(row["yhat"]),
                    lower_bound=float(row["yhat_lower"]),
                    upper_bound=float(row["yhat_upper"]),
                    is_anomaly=False,
                ))

            return results
        except Exception as e:
            logger.error(f"Range prediction failed for {sensor_id}: {e}")
            return None

    def is_available(self) -> bool:
        return PROPHET_AVAILABLE

    def get_model_info(self, sensor_id: str) -> Optional[Dict[str, Any]]:
        if sensor_id not in self._models:
            return None
        return {
            "sensor_id": sensor_id,
            "trained_at": self._last_training_time.get(sensor_id),
            "data_points": len(self._sensor_data.get(sensor_id, [])),
        }

    def get_all_models_info(self) -> Dict[str, Dict[str, Any]]:
        return {sid: self.get_model_info(sid) for sid in self._models}

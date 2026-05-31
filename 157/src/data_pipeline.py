import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any
from collections import deque

from .questdb_client import QuestDBConnection
from .sensor_simulator import SensorSimulator, SensorReading
from .anomaly_detector import AnomalyDetector, AnomalyEvent
from .prophet_predictor import ProphetPredictor, PredictionResult

logger = logging.getLogger(__name__)


class DataPipeline:
    def __init__(
        self,
        config: Dict[str, Any],
    ):
        self.config = config
        self._running = False
        self._lock = threading.Lock()

        questdb_config = config.get("questdb", {})
        self.db_client = QuestDBConnection(
            host=questdb_config.get("host", "localhost"),
            port=questdb_config.get("port", 8812),
            user=questdb_config.get("user", "admin"),
            password=questdb_config.get("password", "quest"),
            database=questdb_config.get("database", "qdb"),
        )

        sensors_config = config.get("sensors", {})
        self.simulator = SensorSimulator(
            num_sensors=sensors_config.get("count", 1000),
            base_temperature=sensors_config.get("base_temperature", 25.0),
            temperature_variance=sensors_config.get("temperature_variance", 3.0),
            db_client=self.db_client,
        )

        anomaly_config = config.get("anomaly_detection", {})
        reset_config = anomaly_config.get("sensor_reset", {})
        adaptive_config = anomaly_config.get("adaptive", {})
        self.detector = AnomalyDetector(
            sudden_change_threshold=anomaly_config.get("sudden_change", {}).get("threshold", 5.0),
            sudden_change_window=anomaly_config.get("sudden_change", {}).get("window", 2),
            stuck_window=anomaly_config.get("stuck", {}).get("window", 100),
            oscillation_window=anomaly_config.get("oscillation", {}).get("window", 60),
            oscillation_threshold=anomaly_config.get("oscillation", {}).get("threshold", 10),
            reset_temperature_threshold=reset_config.get("reset_temperature_threshold", 1.0),
            reset_cooldown_seconds=reset_config.get("cooldown_seconds", 30),
            min_baseline_samples=reset_config.get("min_baseline_samples", 50),
            adaptive_enabled=adaptive_config.get("enabled", True),
            adaptive_update_interval=adaptive_config.get("update_interval", 300),
            noise_level_low_threshold=adaptive_config.get("noise_level_low_threshold", 0.5),
            noise_level_high_threshold=adaptive_config.get("noise_level_high_threshold", 2.0),
            relaxation_factor=adaptive_config.get("relaxation_factor", 2.0),
            min_adaptive_threshold=adaptive_config.get("min_adaptive_threshold", 3.0),
            oscillation_relaxation_factor=adaptive_config.get("oscillation_relaxation_factor", 1.5),
        )

        prophet_config = config.get("prophet", {})
        self.predictor: Optional[ProphetPredictor] = None
        if prophet_config.get("enabled", True):
            try:
                self.predictor = ProphetPredictor(
                    training_window=prophet_config.get("training_window", 86400),
                    prediction_horizon=prophet_config.get("prediction_horizon", 3600),
                    confidence_interval=prophet_config.get("confidence_interval", 0.95),
                    retrain_interval=prophet_config.get("retrain_interval", 3600),
                    seasonality_mode=prophet_config.get("seasonality_mode", "additive"),
                )
                logger.info("Prophet predictor initialized")
            except ImportError:
                logger.warning("Prophet not available, prediction disabled")

        self._anomaly_buffer: deque = deque(maxlen=1000)
        self._prediction_buffer: deque = deque(maxlen=1000)
        self._sensor_data_buffer: deque = deque(maxlen=10000)

        self._register_callbacks()

    def _register_callbacks(self) -> None:
        self.simulator.register_batch_callback(self._on_batch_readings)
        self.detector.register_anomaly_callback(self._on_anomaly_detected)

    def _on_batch_readings(self, readings: List[SensorReading]) -> None:
        if not self._running:
            return

        batch_data = []
        for reading in readings:
            anomalies = self.detector.process_reading(
                sensor_id=reading.sensor_id,
                temperature=reading.temperature,
                timestamp=reading.timestamp,
            )

            anomaly_type = anomalies[0].anomaly_type if anomalies else None
            anomaly_score = max((a.severity for a in anomalies), default=0.0)

            batch_data.append({
                "timestamp": reading.timestamp,
                "sensor_id": reading.sensor_id,
                "temperature": reading.temperature,
                "anomaly_type": anomaly_type,
                "anomaly_score": anomaly_score,
            })

            if self.predictor:
                self.predictor.add_reading(
                    sensor_id=reading.sensor_id,
                    timestamp=reading.timestamp,
                    temperature=reading.temperature,
                )

        self._sensor_data_buffer.extend(batch_data)
        self._flush_sensor_data()

    def _on_anomaly_detected(self, anomaly: AnomalyEvent) -> None:
        self._anomaly_buffer.append(anomaly)
        self._flush_anomalies()

    def _flush_sensor_data(self) -> None:
        if len(self._sensor_data_buffer) < 1000:
            return

        with self._lock:
            data_to_flush = list(self._sensor_data_buffer)
            self._sensor_data_buffer.clear()

        try:
            self.db_client.insert_sensor_data_batch(data_to_flush)
            logger.debug(f"Flushed {len(data_to_flush)} sensor readings to database")
        except Exception as e:
            logger.error(f"Failed to flush sensor data: {e}")
            self._sensor_data_buffer.extendleft(reversed(data_to_flush))

    def _flush_anomalies(self) -> None:
        if not self._anomaly_buffer:
            return

        with self._lock:
            anomalies_to_flush = list(self._anomaly_buffer)
            self._anomaly_buffer.clear()

        try:
            for anomaly in anomalies_to_flush:
                self.db_client.insert_anomaly(
                    timestamp=anomaly.timestamp,
                    sensor_id=anomaly.sensor_id,
                    anomaly_type=anomaly.anomaly_type,
                    temperature=anomaly.temperature,
                    description=anomaly.description,
                    severity=anomaly.severity,
                )
            logger.info(f"Flushed {len(anomalies_to_flush)} anomalies to database")
        except Exception as e:
            logger.error(f"Failed to flush anomalies: {e}")
            self._anomaly_buffer.extendleft(reversed(anomalies_to_flush))

    def _flush_predictions(self) -> None:
        if not self._prediction_buffer:
            return

        with self._lock:
            predictions_to_flush = list(self._prediction_buffer)
            self._prediction_buffer.clear()

        try:
            for prediction in predictions_to_flush:
                self.db_client.insert_prediction(
                    timestamp=prediction.timestamp,
                    sensor_id=prediction.sensor_id,
                    predicted_value=prediction.predicted_value,
                    lower_bound=prediction.lower_bound,
                    upper_bound=prediction.upper_bound,
                )
            logger.debug(f"Flushed {len(predictions_to_flush)} predictions to database")
        except Exception as e:
            logger.error(f"Failed to flush predictions: {e}")
            self._prediction_buffer.extendleft(reversed(predictions_to_flush))

    def run_predictions(self, sensor_ids: Optional[List[str]] = None) -> None:
        if not self.predictor:
            return

        if sensor_ids is None:
            sensor_ids = self.simulator.get_sensor_ids()[:100]

        for sensor_id in sensor_ids:
            state = self.detector.get_sensor_status(sensor_id)
            if not state or state["last_value"] is None:
                continue

            result = self.predictor.predict(
                sensor_id=sensor_id,
                current_temp=state["last_value"],
            )

            if result:
                self._prediction_buffer.append(result)

        self._flush_predictions()

    def start(self) -> None:
        logger.info("Starting data pipeline...")

        self.db_client.connect()
        self.db_client.initialize_tables()

        self._running = True
        self.simulator.start()

        logger.info("Data pipeline started successfully")

    def stop(self) -> None:
        logger.info("Stopping data pipeline...")

        self._running = False
        self.simulator.stop()

        self._flush_sensor_data()
        self._flush_anomalies()
        self._flush_predictions()

        self.db_client.disconnect()

        logger.info("Data pipeline stopped")

    def get_status(self) -> Dict[str, Any]:
        return {
            "running": self._running,
            "sensors": {
                "total": self.simulator.num_sensors,
                "active": len(self.simulator.sensors),
            },
            "detector": {
                "tracked_sensors": len(self.detector._sensor_states),
                "anomaly_buffer_size": len(self._anomaly_buffer),
            },
            "predictor": {
                "enabled": self.predictor is not None,
                "models_count": len(self.predictor._models) if self.predictor else 0,
            },
            "buffers": {
                "sensor_data": len(self._sensor_data_buffer),
                "anomalies": len(self._anomaly_buffer),
                "predictions": len(self._prediction_buffer),
            },
        }

    def inject_anomaly(
        self,
        anomaly_type: str,
        sensor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if sensor_id is None:
            sensor_id = random.choice(self.simulator.get_sensor_ids())

        if anomaly_type == "sudden_change":
            self.simulator.inject_sudden_change(sensor_id, random.uniform(6.0, 15.0))
        elif anomaly_type == "stuck":
            self.simulator.inject_stuck(sensor_id)
        elif anomaly_type == "oscillation":
            self.simulator.inject_oscillation(sensor_id)
        else:
            return {"success": False, "message": f"Unknown anomaly type: {anomaly_type}"}

        return {
            "success": True,
            "sensor_id": sensor_id,
            "anomaly_type": anomaly_type,
        }


import random

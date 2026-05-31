import logging
from collections import deque
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class AnomalyEvent:
    timestamp: datetime
    sensor_id: str
    anomaly_type: str
    temperature: float
    description: str
    severity: float
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SensorState:
    sensor_id: str
    recent_readings: deque = field(default_factory=lambda: deque(maxlen=200))
    consecutive_same_count: int = 0
    last_value: float = None
    direction_changes: deque = field(default_factory=lambda: deque(maxlen=120))
    last_direction: int = 0
    baseline_temperature: float = None
    is_in_reset: bool = False
    reset_cooldown_until: datetime = None
    temperature_std: float = None
    temperature_mean: float = None
    adaptive_sudden_change_threshold: float = None
    adaptive_oscillation_threshold: float = None
    last_adaptive_update: datetime = None
    noise_level: str = "unknown"


class AnomalyDetector:
    def __init__(
        self,
        sudden_change_threshold: float = 5.0,
        sudden_change_window: int = 2,
        stuck_window: int = 100,
        oscillation_window: int = 60,
        oscillation_threshold: int = 10,
        reset_temperature_threshold: float = 1.0,
        reset_cooldown_seconds: int = 30,
        min_baseline_samples: int = 50,
        adaptive_enabled: bool = True,
        adaptive_update_interval: int = 300,
        noise_level_low_threshold: float = 0.5,
        noise_level_high_threshold: float = 2.0,
        relaxation_factor: float = 2.0,
        min_adaptive_threshold: float = 3.0,
        oscillation_relaxation_factor: float = 1.5,
    ):
        self.sudden_change_threshold = sudden_change_threshold
        self.sudden_change_window = sudden_change_window
        self.stuck_window = stuck_window
        self.oscillation_window = oscillation_window
        self.oscillation_threshold = oscillation_threshold
        self.reset_temperature_threshold = reset_temperature_threshold
        self.reset_cooldown_seconds = reset_cooldown_seconds
        self.min_baseline_samples = min_baseline_samples
        self.adaptive_enabled = adaptive_enabled
        self.adaptive_update_interval = adaptive_update_interval
        self.noise_level_low_threshold = noise_level_low_threshold
        self.noise_level_high_threshold = noise_level_high_threshold
        self.relaxation_factor = relaxation_factor
        self.min_adaptive_threshold = min_adaptive_threshold
        self.oscillation_relaxation_factor = oscillation_relaxation_factor

        self._sensor_states: Dict[str, SensorState] = {}

        self._anomaly_callbacks: List = []

    def _get_or_create_state(self, sensor_id: str) -> SensorState:
        if sensor_id not in self._sensor_states:
            self._sensor_states[sensor_id] = SensorState(sensor_id=sensor_id)
        return self._sensor_states[sensor_id]

    def register_anomaly_callback(self, callback) -> None:
        self._anomaly_callbacks.append(callback)

    def _notify_callbacks(self, anomaly: AnomalyEvent) -> None:
        for callback in self._anomaly_callbacks:
            try:
                callback(anomaly)
            except Exception as e:
                logger.error(f"Error in anomaly callback: {e}")

    def _update_baseline(self, state: SensorState, temperature: float) -> None:
        if len(state.recent_readings) >= self.min_baseline_samples:
            recent_temps = [t for _, t in list(state.recent_readings)[-self.min_baseline_samples:]]
            state.baseline_temperature = sum(recent_temps) / len(recent_temps)

    def _update_statistics(self, state: SensorState) -> None:
        if len(state.recent_readings) < self.min_baseline_samples:
            return

        recent_temps = [t for _, t in list(state.recent_readings)[-self.min_baseline_samples:]]
        state.temperature_mean = np.mean(recent_temps)
        state.temperature_std = np.std(recent_temps)

    def _calculate_adaptive_thresholds(self, state: SensorState) -> None:
        if state.temperature_std is None:
            return

        if state.temperature_std <= self.noise_level_low_threshold:
            state.noise_level = "low"
            state.adaptive_sudden_change_threshold = self.sudden_change_threshold
            state.adaptive_oscillation_threshold = self.oscillation_threshold
        elif state.temperature_std >= self.noise_level_high_threshold:
            state.noise_level = "high"
            noise_ratio = state.temperature_std / self.noise_level_high_threshold
            state.adaptive_sudden_change_threshold = max(
                self.min_adaptive_threshold,
                self.sudden_change_threshold * (1 + noise_ratio * self.relaxation_factor)
            )
            state.adaptive_oscillation_threshold = max(
                self.oscillation_threshold,
                int(self.oscillation_threshold * (1 + noise_ratio * self.oscillation_relaxation_factor))
            )
        else:
            state.noise_level = "medium"
            noise_ratio = (state.temperature_std - self.noise_level_low_threshold) / \
                          (self.noise_level_high_threshold - self.noise_level_low_threshold)
            state.adaptive_sudden_change_threshold = self.sudden_change_threshold * (1 + noise_ratio * 0.5)
            state.adaptive_oscillation_threshold = self.oscillation_threshold

        state.last_adaptive_update = datetime.now()

    def _should_update_adaptive(self, state: SensorState) -> bool:
        if not self.adaptive_enabled:
            return False

        if state.last_adaptive_update is None:
            return True

        elapsed = (datetime.now() - state.last_adaptive_update).total_seconds()
        return elapsed >= self.adaptive_update_interval

    def _get_sudden_change_threshold(self, state: SensorState) -> float:
        if self.adaptive_enabled and state.adaptive_sudden_change_threshold is not None:
            return state.adaptive_sudden_change_threshold
        return self.sudden_change_threshold

    def _get_oscillation_threshold(self, state: SensorState) -> int:
        if self.adaptive_enabled and state.adaptive_oscillation_threshold is not None:
            return state.adaptive_oscillation_threshold
        return self.oscillation_threshold

    def _is_reset_event(self, state: SensorState, new_temperature: float) -> bool:
        if state.baseline_temperature is None:
            return False

        if new_temperature <= self.reset_temperature_threshold:
            return True

        if state.baseline_temperature - new_temperature > self.sudden_change_threshold * 2:
            if new_temperature <= state.baseline_temperature * 0.1:
                return True

        return False

    def _is_in_reset_cooldown(self, state: SensorState, timestamp: datetime) -> bool:
        if state.reset_cooldown_until is None:
            return False
        return timestamp < state.reset_cooldown_until

    def detect_sensor_reset(
        self,
        sensor_id: str,
        temperature: float,
        timestamp: datetime,
    ) -> Optional[AnomalyEvent]:
        state = self._get_or_create_state(sensor_id)

        if self._is_reset_event(state, temperature):
            if not state.is_in_reset:
                state.is_in_reset = True
                state.reset_cooldown_until = timestamp + timedelta(seconds=self.reset_cooldown_seconds)

                return AnomalyEvent(
                    timestamp=timestamp,
                    sensor_id=sensor_id,
                    anomaly_type="sensor_reset",
                    temperature=temperature,
                    description=f"Sensor reset detected: temperature dropped to {temperature:.2f}°C from baseline {state.baseline_temperature:.2f}°C",
                    severity=0.3,
                    details={
                        "baseline_temperature": state.baseline_temperature,
                        "reset_temperature": temperature,
                        "cooldown_seconds": self.reset_cooldown_seconds,
                    },
                )
        elif state.is_in_reset and not self._is_in_reset_cooldown(state, timestamp):
            if temperature > self.reset_temperature_threshold * 2:
                state.is_in_reset = False
                state.reset_cooldown_until = None
                logger.debug(f"Sensor {sensor_id} recovered from reset")

        return None

    def detect_sudden_change(
        self,
        sensor_id: str,
        temperature: float,
        timestamp: datetime,
    ) -> Optional[AnomalyEvent]:
        state = self._get_or_create_state(sensor_id)

        if self._is_in_reset_cooldown(state, timestamp):
            return None

        if state.is_in_reset:
            return None

        if len(state.recent_readings) < self.sudden_change_window:
            return None

        current_threshold = self._get_sudden_change_threshold(state)

        recent_values = list(state.recent_readings)
        for i in range(len(recent_values) - self.sudden_change_window + 1):
            window_values = recent_values[i:i + self.sudden_change_window]
            if len(window_values) < 2:
                continue

            change = abs(window_values[-1][1] - window_values[0][1])
            if change > current_threshold:
                if self._is_reset_event(state, temperature):
                    return None

                severity = min(1.0, change / current_threshold)
                return AnomalyEvent(
                    timestamp=timestamp,
                    sensor_id=sensor_id,
                    anomaly_type="sudden_change",
                    temperature=temperature,
                    description=f"Temperature changed by {change:.2f}°C in {self.sudden_change_window}s (threshold: {current_threshold:.2f}°C, noise: {state.noise_level})",
                    severity=severity,
                    details={
                        "change": change,
                        "window": self.sudden_change_window,
                        "threshold": current_threshold,
                        "noise_level": state.noise_level,
                        "temperature_std": state.temperature_std,
                    },
                )

        return None

    def detect_stuck(
        self,
        sensor_id: str,
        temperature: float,
        timestamp: datetime,
    ) -> Optional[AnomalyEvent]:
        state = self._get_or_create_state(sensor_id)

        if state.last_value is not None and abs(temperature - state.last_value) < 0.001:
            state.consecutive_same_count += 1
        else:
            state.consecutive_same_count = 1

        state.last_value = temperature

        if state.consecutive_same_count >= self.stuck_window:
            severity = min(1.0, state.consecutive_same_count / self.stuck_window)
            return AnomalyEvent(
                timestamp=timestamp,
                sensor_id=sensor_id,
                anomaly_type="stuck",
                temperature=temperature,
                description=f"Sensor stuck at {temperature:.2f}°C for {state.consecutive_same_count} consecutive readings",
                severity=severity,
                details={
                    "stuck_value": temperature,
                    "consecutive_count": state.consecutive_same_count,
                },
            )

        return None

    def detect_oscillation(
        self,
        sensor_id: str,
        temperature: float,
        timestamp: datetime,
    ) -> Optional[AnomalyEvent]:
        state = self._get_or_create_state(sensor_id)

        if len(state.recent_readings) < 3:
            return None

        recent = list(state.recent_readings)
        if len(recent) >= 2:
            prev_temp = recent[-2][1]
            current_direction = 1 if temperature > prev_temp else (-1 if temperature < prev_temp else 0)

            if current_direction != 0 and current_direction != state.last_direction:
                state.direction_changes.append(timestamp)
                state.last_direction = current_direction

        now = datetime.now()
        recent_changes = [
            t for t in state.direction_changes
            if (now - t).total_seconds() <= self.oscillation_window
        ]

        current_threshold = self._get_oscillation_threshold(state)

        if len(recent_changes) >= current_threshold:
            severity = min(1.0, len(recent_changes) / (current_threshold * 2))
            return AnomalyEvent(
                timestamp=timestamp,
                sensor_id=sensor_id,
                anomaly_type="oscillation",
                temperature=temperature,
                description=f"Rapid oscillation: {len(recent_changes)} changes in {self.oscillation_window}s (threshold: {current_threshold}, noise: {state.noise_level})",
                severity=severity,
                details={
                    "direction_changes": len(recent_changes),
                    "window": self.oscillation_window,
                    "threshold": current_threshold,
                    "noise_level": state.noise_level,
                    "temperature_std": state.temperature_std,
                },
            )

        return None

    def process_reading(
        self,
        sensor_id: str,
        temperature: float,
        timestamp: Optional[datetime] = None,
    ) -> List[AnomalyEvent]:
        if timestamp is None:
            timestamp = datetime.now()

        state = self._get_or_create_state(sensor_id)
        state.recent_readings.append((timestamp, temperature))

        self._update_baseline(state, temperature)

        if self._should_update_adaptive(state):
            self._update_statistics(state)
            self._calculate_adaptive_thresholds(state)

        anomalies = []

        sensor_reset = self.detect_sensor_reset(sensor_id, temperature, timestamp)
        if sensor_reset:
            anomalies.append(sensor_reset)
            self._notify_callbacks(sensor_reset)
            return anomalies

        sudden_change = self.detect_sudden_change(sensor_id, temperature, timestamp)
        if sudden_change:
            anomalies.append(sudden_change)
            self._notify_callbacks(sudden_change)

        stuck = self.detect_stuck(sensor_id, temperature, timestamp)
        if stuck:
            anomalies.append(stuck)
            self._notify_callbacks(stuck)

        oscillation = self.detect_oscillation(sensor_id, temperature, timestamp)
        if oscillation:
            anomalies.append(oscillation)
            self._notify_callbacks(oscillation)

        return anomalies

    def process_batch(
        self,
        readings: List[Tuple[str, float, Optional[datetime]]],
    ) -> Dict[str, List[AnomalyEvent]]:
        results = {}
        for sensor_id, temperature, timestamp in readings:
            anomalies = self.process_reading(sensor_id, temperature, timestamp)
            if anomalies:
                results[sensor_id] = anomalies
        return results

    def get_sensor_status(self, sensor_id: str) -> Optional[Dict[str, Any]]:
        state = self._sensor_states.get(sensor_id)
        if not state:
            return None
        return {
            "sensor_id": sensor_id,
            "recent_readings_count": len(state.recent_readings),
            "consecutive_same_count": state.consecutive_same_count,
            "last_value": state.last_value,
            "recent_direction_changes": len(state.direction_changes),
            "baseline_temperature": state.baseline_temperature,
            "is_in_reset": state.is_in_reset,
            "reset_cooldown_until": state.reset_cooldown_until,
            "temperature_std": state.temperature_std,
            "temperature_mean": state.temperature_mean,
            "adaptive_sudden_change_threshold": state.adaptive_sudden_change_threshold,
            "adaptive_oscillation_threshold": state.adaptive_oscillation_threshold,
            "noise_level": state.noise_level,
            "last_adaptive_update": state.last_adaptive_update,
        }

    def reset_sensor(self, sensor_id: str) -> None:
        if sensor_id in self._sensor_states:
            del self._sensor_states[sensor_id]

    def get_all_status(self) -> Dict[str, Dict[str, Any]]:
        return {sid: self.get_sensor_status(sid) for sid in self._sensor_states}

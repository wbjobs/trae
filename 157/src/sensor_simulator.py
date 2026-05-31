import random
import time
import threading
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass

import numpy as np

from .questdb_client import QuestDBConnection


@dataclass
class SensorConfig:
    sensor_id: str
    base_temp: float = 25.0
    variance: float = 3.0
    current_temp: float = 25.0
    trend: float = 0.0


@dataclass
class SensorReading:
    timestamp: datetime
    sensor_id: str
    temperature: float


class SensorSimulator:
    def __init__(
        self,
        num_sensors: int = 1000,
        base_temperature: float = 25.0,
        temperature_variance: float = 3.0,
        db_client: Optional[QuestDBConnection] = None,
    ):
        self.num_sensors = num_sensors
        self.base_temperature = base_temperature
        self.temperature_variance = temperature_variance
        self.db_client = db_client

        self.sensors: Dict[str, SensorConfig] = {}
        self._initialize_sensors()

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        self._reading_callbacks: List[Callable[[SensorReading], None]] = []
        self._batch_callbacks: List[Callable[[List[SensorReading]], None]] = []

        self._batch_buffer: List[SensorReading] = []
        self._batch_size = 100

    def _initialize_sensors(self) -> None:
        for i in range(self.num_sensors):
            sensor_id = f"sensor_{i:04d}"
            self.sensors[sensor_id] = SensorConfig(
                sensor_id=sensor_id,
                base_temp=self.base_temperature + random.uniform(-2.0, 2.0),
                variance=self.temperature_variance * random.uniform(0.8, 1.2),
                current_temp=self.base_temperature + random.uniform(-1.0, 1.0),
                trend=random.uniform(-0.01, 0.01),
            )

    def _generate_reading(self, sensor: SensorConfig) -> SensorReading:
        noise = random.gauss(0, sensor.variance * 0.1)
        sensor.current_temp += sensor.trend + noise
        sensor.current_temp = max(-50.0, min(150.0, sensor.current_temp))
        return SensorReading(
            timestamp=datetime.now(),
            sensor_id=sensor.sensor_id,
            temperature=round(sensor.current_temp, 4),
        )

    def inject_sudden_change(self, sensor_id: str, magnitude: float = 10.0) -> None:
        if sensor_id in self.sensors:
            self.sensors[sensor_id].current_temp += magnitude

    def inject_stuck(self, sensor_id: str, duration: int = 100) -> None:
        if sensor_id in self.sensors:
            sensor = self.sensors[sensor_id]
            sensor.current_temp = sensor.base_temp
            sensor.trend = 0.0

    def inject_oscillation(self, sensor_id: str, amplitude: float = 8.0, frequency: float = 5.0) -> None:
        pass

    def inject_random_anomalies(
        self,
        sudden_change_prob: float = 0.001,
        stuck_prob: float = 0.0005,
    ) -> List[str]:
        affected_sensors = []
        for sensor_id, sensor in self.sensors.items():
            if random.random() < sudden_change_prob:
                self.inject_sudden_change(sensor_id, random.uniform(6.0, 15.0))
                affected_sensors.append(f"{sensor_id}:sudden_change")
            if random.random() < stuck_prob:
                self.inject_stuck(sensor_id)
                affected_sensors.append(f"{sensor_id}:stuck")
        return affected_sensors

    def generate_batch_readings(self) -> List[SensorReading]:
        readings = []
        with self._lock:
            for sensor in self.sensors.values():
                readings.append(self._generate_reading(sensor))
        return readings

    def _simulation_loop(self) -> None:
        logger = __import__("logging").getLogger(__name__)
        batch_count = 0
        while self._running:
            start_time = time.time()

            readings = self.generate_batch_readings()

            for callback in self._reading_callbacks:
                for reading in readings:
                    callback(reading)

            self._batch_buffer.extend(readings)
            if len(self._batch_buffer) >= self._batch_size * self.num_sensors:
                batch_data = self._batch_buffer
                self._batch_buffer = []
                for callback in self._batch_callbacks:
                    callback(batch_data)

            affected = self.inject_random_anomalies()
            if affected:
                logger.debug(f"Injected anomalies: {affected[:5]}...")

            batch_count += 1
            if batch_count % 60 == 0:
                logger.info(f"Generated {batch_count} batches, {batch_count * self.num_sensors} total readings")

            elapsed = time.time() - start_time
            sleep_time = max(0.0, 1.0 - elapsed)
            time.sleep(sleep_time)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self._thread.start()
        logger = __import__("logging").getLogger(__name__)
        logger.info(f"Sensor simulator started with {self.num_sensors} sensors")

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5.0)
        logger = __import__("logging").getLogger(__name__)
        logger.info("Sensor simulator stopped")

    def register_reading_callback(self, callback: Callable[[SensorReading], None]) -> None:
        self._reading_callbacks.append(callback)

    def register_batch_callback(self, callback: Callable[[List[SensorReading]], None]) -> None:
        self._batch_callbacks.append(callback)

    def get_sensor_ids(self) -> List[str]:
        return list(self.sensors.keys())

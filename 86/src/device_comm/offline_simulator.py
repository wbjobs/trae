import threading
import time
import random
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from src.core.models import DeviceConfig, TagPoint, DeviceStatus
from src.core.event_bus import EventBus, EventType


class SimulationEventType(Enum):
    STEP_CHANGE = "step_change"
    RAMP_CHANGE = "ramp_change"
    SINE_WAVE = "sine_wave"
    RANDOM_WALK = "random_walk"
    PULSE = "pulse"


@dataclass
class SimulationEvent:
    tag_name: str
    event_type: SimulationEventType
    start_time: float
    duration: float
    parameters: Dict[str, Any] = field(default_factory=dict)
    active: bool = True


class OfflineSimulator:
    def __init__(self):
        self._devices: Dict[str, DeviceConfig] = {}
        self._simulation_events: List[SimulationEvent] = []
        self._running = False
        self._simulation_thread: Optional[threading.Thread] = None
        self._simulation_time: float = 0.0
        self._speed_factor: float = 1.0
        self._callbacks: List[Callable] = []
        self._event_bus = EventBus()
        self._tag_values: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def add_device(self, device_config: DeviceConfig):
        self._devices[device_config.device_id] = device_config
        self._tag_values[device_config.device_id] = {}
        for tag_name, tag in device_config.tags.items():
            self._tag_values[device_config.device_id][tag_name] = tag.default_value

    def remove_device(self, device_id: str):
        if device_id in self._devices:
            del self._devices[device_id]
        if device_id in self._tag_values:
            del self._tag_values[device_id]

    def add_simulation_event(self, event: SimulationEvent):
        self._simulation_events.append(event)

    def clear_events(self):
        self._simulation_events.clear()

    def start_simulation(self, speed_factor: float = 1.0):
        if self._running:
            return
        self._speed_factor = speed_factor
        self._running = True
        self._simulation_time = 0.0
        self._simulation_thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self._simulation_thread.start()

    def stop_simulation(self):
        self._running = False
        if self._simulation_thread:
            self._simulation_thread.join(timeout=2)
            self._simulation_thread = None

    def _simulation_loop(self):
        last_time = time.time()
        update_counter = 0
        while self._running:
            try:
                current_time = time.time()
                delta_real = current_time - last_time
                delta_sim = delta_real * self._speed_factor
                self._simulation_time += delta_sim
                last_time = current_time
                self._process_events()
                update_counter += 1
                if update_counter % 2 == 0:
                    self._update_automated_tags()
                for callback in self._callbacks:
                    try:
                        callback(self._simulation_time, self._tag_values)
                    except Exception as e:
                        print(f"Callback error: {e}")
                time.sleep(0.05)
            except Exception as e:
                print(f"Simulation loop error: {e}")
                time.sleep(0.1)

    def _update_automated_tags(self):
        with self._lock:
            for device_id, tags in self._tag_values.items():
                device = self._devices.get(device_id)
                if not device:
                    continue
                for tag_name, current_value in tags.items():
                    tag = device.tags.get(tag_name)
                    if not tag:
                        continue
                    has_event = False
                    for event in self._simulation_events:
                        if event.active and event.tag_name == f"{device_id}.{tag_name}":
                            if self._simulation_time >= event.start_time and self._simulation_time <= event.start_time + event.duration:
                                has_event = True
                                break
                    if has_event:
                        continue
                    try:
                        if tag.point_type.value in ['AI', 'AO', 'CI', 'CO']:
                            current = float(current_value) if current_value is not None else (tag.min_value + tag.max_value) / 2
                            variation = (tag.max_value - tag.min_value) * 0.01
                            noise = random.uniform(-variation, variation)
                            new_value = current + noise
                            new_value = max(tag.min_value, min(tag.max_value, new_value))
                            if abs(new_value - current) > 0.001:
                                tags[tag_name] = new_value
                                self._event_bus.publish(EventType.TAG_VALUE_CHANGED, {
                                    "device": device_id,
                                    "tag": tag_name,
                                    "value": new_value
                                })
                        elif tag.point_type.value in ['DI', 'DO']:
                            if random.random() < 0.02:
                                new_value = 1 - int(current_value or 0)
                                tags[tag_name] = new_value
                                self._event_bus.publish(EventType.TAG_VALUE_CHANGED, {
                                    "device": device_id,
                                    "tag": tag_name,
                                    "value": new_value
                                })
                    except (ValueError, TypeError):
                        continue

    def _process_events(self):
        with self._lock:
            for event in self._simulation_events:
                if not event.active:
                    continue
                if self._simulation_time < event.start_time:
                    continue
                if self._simulation_time > event.start_time + event.duration:
                    continue
                device_id, tag_name = self._parse_tag_path(event.tag_name)
                if device_id and tag_name and device_id in self._tag_values:
                    value = self._calculate_event_value(event)
                    self._tag_values[device_id][tag_name] = value
                    self._event_bus.publish(EventType.TAG_VALUE_CHANGED, {
                        "device": device_id,
                        "tag": tag_name,
                        "value": value
                    })

    def _parse_tag_path(self, tag_path: str) -> tuple:
        parts = tag_path.split('.', 1)
        if len(parts) == 2:
            return parts[0], parts[1]
        return None, tag_path

    def _calculate_event_value(self, event: SimulationEvent) -> Any:
        elapsed = self._simulation_time - event.start_time
        params = event.parameters
        if event.event_type == SimulationEventType.STEP_CHANGE:
            return params.get('target_value', 0)
        elif event.event_type == SimulationEventType.RAMP_CHANGE:
            start_value = params.get('start_value', 0)
            end_value = params.get('end_value', 100)
            progress = min(elapsed / event.duration, 1.0)
            return start_value + (end_value - start_value) * progress
        elif event.event_type == SimulationEventType.SINE_WAVE:
            amplitude = params.get('amplitude', 1.0)
            frequency = params.get('frequency', 1.0)
            offset = params.get('offset', 0.0)
            phase = params.get('phase', 0.0)
            return offset + amplitude * math.sin(2 * math.pi * frequency * elapsed + phase)
        elif event.event_type == SimulationEventType.RANDOM_WALK:
            current = self._get_tag_current_value(event.tag_name)
            step_size = params.get('step_size', 1.0)
            min_val = params.get('min_value', 0)
            max_val = params.get('max_value', 100)
            new_val = current + random.uniform(-step_size, step_size)
            return max(min_val, min(max_val, new_val))
        elif event.event_type == SimulationEventType.PULSE:
            pulse_value = params.get('pulse_value', 1)
            default_value = params.get('default_value', 0)
            pulse_width = params.get('pulse_width', event.duration * 0.5)
            if elapsed < pulse_width:
                return pulse_value
            else:
                return default_value
        return 0

    def _get_tag_current_value(self, tag_path: str) -> Any:
        device_id, tag_name = self._parse_tag_path(tag_path)
        if device_id and tag_name and device_id in self._tag_values:
            return self._tag_values[device_id].get(tag_name, 0)
        return 0

    def get_tag_value(self, device_id: str, tag_name: str) -> Optional[Any]:
        if device_id in self._tag_values:
            return self._tag_values[device_id].get(tag_name)
        return None

    def set_tag_value(self, device_id: str, tag_name: str, value: Any):
        with self._lock:
            if device_id in self._tag_values:
                self._tag_values[device_id][tag_name] = value
                self._event_bus.publish(EventType.TAG_VALUE_CHANGED, {
                    "device": device_id,
                    "tag": tag_name,
                    "value": value
                })

    def add_callback(self, callback: Callable):
        self._callbacks.append(callback)

    def remove_callback(self, callback: Callable):
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def reset_simulation(self):
        self._simulation_time = 0.0
        for device_id, device in self._devices.items():
            for tag_name, tag in device.tags.items():
                self._tag_values[device_id][tag_name] = tag.default_value

    @property
    def running(self) -> bool:
        return self._running

    @property
    def simulation_time(self) -> float:
        return self._simulation_time

    @property
    def speed_factor(self) -> float:
        return self._speed_factor

    @speed_factor.setter
    def speed_factor(self, value: float):
        self._speed_factor = max(0.1, min(value, 100.0))


import math

import threading
import time
import random
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
from collections import deque
from src.core.models import DeviceConfig, TagPoint, DeviceStatus
from src.core.event_bus import EventBus, EventType
from .protocol_adapter import ProtocolAdapterFactory, ProtocolAdapter


class TagMonitor:
    def __init__(self, tag: TagPoint):
        self.tag = tag
        self.history: deque = deque(maxlen=1000)
        self.alarm_low_triggered = False
        self.alarm_high_triggered = False

    def update_value(self, value: Any):
        self.tag.current_value = value
        self.tag.last_update = datetime.now()
        self.history.append((datetime.now(), value))
        self._check_alarms(value)

    def _check_alarms(self, value: Any):
        try:
            numeric_value = float(value)
            if self.tag.alarm_low is not None:
                if numeric_value < self.tag.alarm_low and not self.alarm_low_triggered:
                    self.alarm_low_triggered = True
                    EventBus().publish(EventType.ALARM_TRIGGERED, {
                        "tag": self.tag.name,
                        "type": "low",
                        "value": numeric_value,
                        "threshold": self.tag.alarm_low
                    })
                elif numeric_value >= self.tag.alarm_low:
                    self.alarm_low_triggered = False
            if self.tag.alarm_high is not None:
                if numeric_value > self.tag.alarm_high and not self.alarm_high_triggered:
                    self.alarm_high_triggered = True
                    EventBus().publish(EventType.ALARM_TRIGGERED, {
                        "tag": self.tag.name,
                        "type": "high",
                        "value": numeric_value,
                        "threshold": self.tag.alarm_high
                    })
                elif numeric_value <= self.tag.alarm_high:
                    self.alarm_high_triggered = False
        except (ValueError, TypeError):
            pass


class DeviceMonitor:
    def __init__(self, device_config: DeviceConfig, offline_mode: bool = False):
        self._config = device_config
        self._offline_mode = offline_mode
        self._adapter: Optional[ProtocolAdapter] = None
        self._tag_monitors: Dict[str, TagMonitor] = {}
        self._monitoring = False
        self._monitor_thread: Optional[threading.Thread] = None
        self._poll_interval = 1000
        self._callbacks: List[Callable] = []
        self._event_bus = EventBus()
        for tag_name, tag in device_config.tags.items():
            self._tag_monitors[tag_name] = TagMonitor(tag)

    def connect(self) -> bool:
        if self._offline_mode:
            self._config.status = DeviceStatus.SIMULATING
            return True
        self._adapter = ProtocolAdapterFactory.create_adapter(self._config)
        connected = self._adapter.connect()
        if connected:
            self._config.status = DeviceStatus.ONLINE
        else:
            self._config.status = DeviceStatus.FAULT
        return connected

    def disconnect(self):
        if self._adapter:
            self._adapter.disconnect()
        self._config.status = DeviceStatus.OFFLINE
        self.stop_monitoring()

    def start_monitoring(self, poll_interval: int = 1000):
        if self._monitoring:
            return
        self._poll_interval = poll_interval
        self._monitoring = True
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()

    def stop_monitoring(self):
        self._monitoring = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2)
            self._monitor_thread = None

    def _monitor_loop(self):
        while self._monitoring:
            try:
                if self._offline_mode:
                    self._simulate_data()
                else:
                    self._read_device_data()
            except Exception as e:
                print(f"Monitor loop error: {e}")
                self._event_bus.publish(EventType.COMMUNICATION_ERROR, {
                    "device": self._config.device_id,
                    "error": str(e)
                })
            time.sleep(self._poll_interval / 1000)

    def _read_device_data(self):
        if not self._adapter or not self._adapter.connected:
            return
        tags = list(self._tag_monitors.values())
        tag_objects = [tm.tag for tm in tags]
        values = self._adapter.read_multiple_tags(tag_objects)
        for tm in tags:
            value = values.get(tm.tag.name)
            if value is not None:
                tm.update_value(value)
                self._event_bus.publish(EventType.TAG_VALUE_CHANGED, {
                    "device": self._config.device_id,
                    "tag": tm.tag.name,
                    "value": value
                })
        for callback in self._callbacks:
            try:
                callback(self._config.device_id, {tm.tag.name: tm.tag.current_value for tm in tags})
            except:
                pass

    def _simulate_data(self):
        for tm in self._tag_monitors.values():
            tag = tm.tag
            if tag.point_type.value in ['AI', 'AO', 'CI', 'CO']:
                current = float(tag.current_value) if tag.current_value else (tag.min_value + tag.max_value) / 2
                variation = (tag.max_value - tag.min_value) * 0.02
                new_value = current + random.uniform(-variation, variation)
                new_value = max(tag.min_value, min(tag.max_value, new_value))
            else:
                new_value = random.choice([0, 1])
            tm.update_value(new_value)
            self._event_bus.publish(EventType.TAG_VALUE_CHANGED, {
                "device": self._config.device_id,
                "tag": tm.tag.name,
                "value": new_value
            })

    def write_tag(self, tag_name: str, value: Any) -> bool:
        if tag_name not in self._tag_monitors:
            return False
        tm = self._tag_monitors[tag_name]
        if tm.tag.read_only:
            return False
        if self._offline_mode:
            tm.update_value(value)
            return True
        if self._adapter:
            return self._adapter.write_tag(tm.tag, value)
        return False

    def get_tag_value(self, tag_name: str) -> Optional[Any]:
        if tag_name in self._tag_monitors:
            return self._tag_monitors[tag_name].tag.current_value
        return None

    def get_tag_history(self, tag_name: str) -> List:
        if tag_name in self._tag_monitors:
            return list(self._tag_monitors[tag_name].history)
        return []

    def add_update_callback(self, callback: Callable):
        self._callbacks.append(callback)

    def remove_update_callback(self, callback: Callable):
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    @property
    def status(self) -> DeviceStatus:
        return self._config.status

    @property
    def device_id(self) -> str:
        return self._config.device_id

    @property
    def monitoring(self) -> bool:
        return self._monitoring


class CommunicationManager:
    def __init__(self):
        self._device_monitors: Dict[str, DeviceMonitor] = {}
        self._event_bus = EventBus()

    def add_device(self, device_config: DeviceConfig, offline_mode: bool = False) -> DeviceMonitor:
        monitor = DeviceMonitor(device_config, offline_mode)
        self._device_monitors[device_config.device_id] = monitor
        return monitor

    def remove_device(self, device_id: str):
        if device_id in self._device_monitors:
            self._device_monitors[device_id].disconnect()
            del self._device_monitors[device_id]

    def get_monitor(self, device_id: str) -> Optional[DeviceMonitor]:
        return self._device_monitors.get(device_id)

    def connect_all(self) -> Dict[str, bool]:
        results = {}
        for device_id, monitor in self._device_monitors.items():
            results[device_id] = monitor.connect()
            self._event_bus.publish(EventType.DEVICE_STATUS_CHANGED, {
                "device": device_id,
                "status": monitor.status.value
            })
        return results

    def disconnect_all(self):
        for monitor in self._device_monitors.values():
            monitor.disconnect()

    def start_all_monitoring(self, poll_interval: int = 1000):
        for monitor in self._device_monitors.values():
            monitor.start_monitoring(poll_interval)

    def stop_all_monitoring(self):
        for monitor in self._device_monitors.values():
            monitor.stop_monitoring()

    def write_tag(self, device_id: str, tag_name: str, value: Any) -> bool:
        monitor = self._device_monitors.get(device_id)
        if monitor:
            return monitor.write_tag(tag_name, value)
        return False

    def get_all_tag_values(self) -> Dict[str, Dict[str, Any]]:
        result = {}
        for device_id, monitor in self._device_monitors.items():
            device_values = {}
            for tag_name in monitor._tag_monitors:
                device_values[tag_name] = monitor.get_tag_value(tag_name)
            result[device_id] = device_values
        return result

    @property
    def device_monitors(self) -> Dict[str, DeviceMonitor]:
        return self._device_monitors

from typing import Callable, Dict, List, Any
from threading import Lock
from enum import Enum


class EventType(Enum):
    PROJECT_LOADED = "project_loaded"
    PROJECT_SAVED = "project_saved"
    TAG_VALUE_CHANGED = "tag_value_changed"
    DEVICE_STATUS_CHANGED = "device_status_changed"
    SCRIPT_COMPILED = "script_compiled"
    SCRIPT_ERROR = "script_error"
    COMMUNICATION_ERROR = "communication_error"
    ALARM_TRIGGERED = "alarm_triggered"
    LOG_MESSAGE = "log_message"


class EventBus:
    _instance = None
    _lock = Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._listeners: Dict[EventType, List[Callable]] = {}
        return cls._instance

    def subscribe(self, event_type: EventType, callback: Callable):
        with self._lock:
            if event_type not in self._listeners:
                self._listeners[event_type] = []
            self._listeners[event_type].append(callback)

    def unsubscribe(self, event_type: EventType, callback: Callable):
        with self._lock:
            if event_type in self._listeners:
                if callback in self._listeners[event_type]:
                    self._listeners[event_type].remove(callback)

    def publish(self, event_type: EventType, data: Any = None):
        with self._lock:
            listeners = list(self._listeners.get(event_type, []))
        for callback in listeners:
            try:
                callback(data)
            except Exception as e:
                print(f"Event callback error: {e}")

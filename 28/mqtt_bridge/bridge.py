import asyncio
import json
import logging
import threading
import time
from typing import Dict, Any, Optional, Tuple, Callable
from queue import Queue

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class MQTTBridge:
    def __init__(self, config: Dict, tag_configs: Dict[str, Dict]):
        self.config = config["mqtt"]
        self.tag_configs = tag_configs
        self.client: Optional[mqtt.Client] = None
        self._loop_thread: Optional[threading.Thread] = None
        self._aggregator_thread: Optional[threading.Thread] = None
        self._running = False
        self._connected = False

        self._aggregate_window_ms = self.config.get("aggregate_window_ms", 100)
        self._pending_values: Dict[str, Tuple[Any, float]] = {}
        self._pending_lock = threading.Lock()
        self._pending_cv = threading.Condition(self._pending_lock)

        self._reconnect_interval = self.config.get("reconnect_interval", 5)
        self._last_connect_attempt = 0.0

        self._command_topic = self.config.get("command_topic", "factory/machine1/cmd")
        self._command_callback: Optional[Callable[[str, Any], None]] = None
        self._command_queue: Queue = Queue()
        self._command_thread: Optional[threading.Thread] = None

        self._websocket_callback: Optional[Callable[[str, Any], None]] = None

    def connect(self):
        mqtt_config = self.config
        self.client = mqtt.Client(
            client_id=mqtt_config["client_id"],
            protocol=mqtt.MQTTv5,
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_publish = self._on_publish
        self.client.on_message = self._on_message

        self._running = True
        self._loop_thread = threading.Thread(target=self._loop_forever, daemon=True)
        self._loop_thread.start()

        self._aggregator_thread = threading.Thread(target=self._aggregator_loop, daemon=True)
        self._aggregator_thread.start()

        self._command_thread = threading.Thread(target=self._command_loop, daemon=True)
        self._command_thread.start()

        self._attempt_connect()
        logger.info(f"MQTT Bridge connecting to {mqtt_config['broker']}:{mqtt_config['port']}")

    def _attempt_connect(self):
        if self._connected:
            return
        now = time.time()
        if now - self._last_connect_attempt < self._reconnect_interval:
            return
        self._last_connect_attempt = now

        try:
            mqtt_config = self.config
            self.client.connect(
                mqtt_config["broker"],
                port=mqtt_config["port"],
                keepalive=60,
            )
        except Exception as e:
            logger.warning(f"MQTT connect attempt failed: {e}")

    def _loop_forever(self):
        while self._running:
            try:
                if not self._connected:
                    self._attempt_connect()
                    time.sleep(1)
                    continue
                rc = self.client.loop(timeout=0.5)
                if rc != 0:
                    logger.warning(f"MQTT loop returned rc={rc}")
                    self._connected = False
            except Exception as e:
                logger.error(f"Error in MQTT loop: {e}")
                self._connected = False
                time.sleep(1)

    def _aggregator_loop(self):
        while self._running:
            try:
                with self._pending_cv:
                    while not self._pending_values and self._running:
                        self._pending_cv.wait(timeout=0.1)

                    if not self._running:
                        break

                    snapshot = dict(self._pending_values)
                    self._pending_values.clear()

                if snapshot and self._connected:
                    self._publish_snapshot(snapshot)

                if self._websocket_callback:
                    for key, (value, timestamp) in snapshot.items():
                        try:
                            self._websocket_callback(key, value)
                        except Exception as e:
                            logger.error(f"Error in websocket callback: {e}")

                sleep_time = self._aggregate_window_ms / 1000.0
                time.sleep(sleep_time)
            except Exception as e:
                logger.error(f"Error in aggregator loop: {e}")
                time.sleep(0.1)

    def _publish_snapshot(self, snapshot: Dict[str, Tuple[Any, float]]):
        for key, (value, timestamp) in snapshot.items():
            tag_config = self.tag_configs.get(key)
            if not tag_config:
                continue

            topic_suffix = tag_config.get("topic", key)
            base_topic = self.config.get("base_topic", "")
            topic = f"{base_topic}/{topic_suffix}" if base_topic else topic_suffix

            message = {
                "value": value,
                "tag": key,
                "timestamp": timestamp,
                "unit": tag_config.get("unit", ""),
            }

            payload = json.dumps(message, ensure_ascii=False)
            try:
                self.client.publish(topic, payload, qos=0, retain=False)
            except Exception as e:
                logger.error(f"Failed to publish to {topic}: {e}")
                with self._pending_lock:
                    if key not in self._pending_values:
                        self._pending_values[key] = (value, timestamp)

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self._connected = True
            logger.info("MQTT Bridge connected successfully")
            try:
                self.client.subscribe(self._command_topic, qos=1)
                logger.info(f"Subscribed to command topic: {self._command_topic}")
            except Exception as e:
                logger.error(f"Failed to subscribe to command topic: {e}")
        else:
            logger.error(f"MQTT Bridge failed to connect, rc: {rc}")
            self._connected = False

    def _on_disconnect(self, client, userdata, rc, properties=None):
        self._connected = False
        logger.warning(f"MQTT Bridge disconnected, rc: {rc}")

    def _on_publish(self, client, userdata, mid, reason_code=None, properties=None):
        logger.debug(f"MQTT message published, mid: {mid}")

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = msg.payload.decode("utf-8")
            logger.debug(f"Received MQTT message on {topic}: {payload}")

            if topic == self._command_topic:
                self._command_queue.put(payload)
        except Exception as e:
            logger.error(f"Error handling MQTT message: {e}")

    def _command_loop(self):
        while self._running:
            try:
                payload = self._command_queue.get(timeout=1.0)
                self._handle_command(payload)
            except Exception:
                continue

    def _handle_command(self, payload: str):
        try:
            command = json.loads(payload)
            tag = command.get("tag")
            value = command.get("value")

            if not tag or value is None:
                logger.warning(f"Invalid command: {command}")
                return

            if tag not in self.tag_configs:
                logger.warning(f"Unknown tag in command: {tag}")
                return

            if self._command_callback:
                self._command_callback(tag, value)
                logger.info(f"Executed command: {tag} = {value}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse command JSON: {e}")
        except Exception as e:
            logger.error(f"Error handling command: {e}")

    def publish_value(self, key: str, value: Any):
        tag_config = self.tag_configs.get(key)
        if not tag_config:
            logger.warning(f"No tag config found for key: {key}")
            return

        timestamp = time.time()
        with self._pending_cv:
            self._pending_values[key] = (value, timestamp)
            self._pending_cv.notify_all()

        logger.debug(f"Aggregated value for {key}: {value}")

    def on_opcua_value_changed(self, key: str, value: Any):
        self.publish_value(key, value)

    def register_command_callback(self, callback: Callable[[str, Any], None]):
        self._command_callback = callback

    def register_websocket_callback(self, callback: Callable[[str, Any], None]):
        self._websocket_callback = callback

    def disconnect(self):
        self._running = False
        with self._pending_cv:
            self._pending_cv.notify_all()
        if self._command_thread:
            self._command_thread.join(timeout=2.0)
        if self._aggregator_thread:
            self._aggregator_thread.join(timeout=2.0)
        if self._loop_thread:
            self._loop_thread.join(timeout=2.0)
        if self.client:
            self.client.disconnect()
        logger.info("MQTT Bridge disconnected")

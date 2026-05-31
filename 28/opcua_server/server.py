import asyncio
import logging
import time
from typing import Dict, Callable, Any, Optional
from asyncua import Server, ua, Node
from asyncua.common.methods import uamethod

from simulator import CurveFactory

logger = logging.getLogger(__name__)


class OPCUASimulatorServer:
    def __init__(self, config: Dict):
        self.config = config
        self.server = Server()
        self.namespace_idx: Optional[int] = None
        self.variables: Dict[str, Node] = {}
        self.curves: Dict[str, Any] = {}
        self.tag_configs: Dict[str, Dict] = {}
        self._value_callbacks: Dict[str, Callable[[str, Any], None]] = {}
        self._last_values: Dict[str, Any] = {}
        self._subscriptions: Dict[str, Any] = {}
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._running = False
        self._manual_override: Dict[str, Any] = {}
        self._override_lock = asyncio.Lock()

        opc_config = self.config.get("opcua", {})
        self._heartbeat_interval = opc_config.get("heartbeat_interval", 5)
        self._resubscribe_delay = opc_config.get("resubscribe_delay", 2)

    async def init(self):
        opc_config = self.config["opcua"]
        await self.server.init()
        self.server.set_endpoint(opc_config["endpoint"])
        self.server.set_server_name(opc_config["server_name"])

        self.namespace_idx = await self.server.register_namespace(opc_config["namespace"])

        await self._create_address_space()
        await self._setup_data_change_monitoring()

    async def _create_address_space(self):
        objects = self.server.nodes.objects

        machine_type = await self.server.nodes.base_object_type.add_object_type(
            self.namespace_idx, "MachineType"
        )

        motor_type = await self.server.nodes.base_object_type.add_object_type(
            self.namespace_idx, "MotorType"
        )
        await motor_type.add_variable(self.namespace_idx, "Speed", 0.0)
        await motor_type.add_variable(self.namespace_idx, "State", "STOPPED")

        await machine_type.add_object(self.namespace_idx, "Motor1", objecttype=motor_type)
        await machine_type.add_object(self.namespace_idx, "Motor2", objecttype=motor_type)
        await machine_type.add_object(self.namespace_idx, "Motor3", objecttype=motor_type)

        temperature_sensor_type = await self.server.nodes.base_object_type.add_object_type(
            self.namespace_idx, "TemperatureSensorType"
        )
        await temperature_sensor_type.add_variable(self.namespace_idx, "Value", 0.0)

        await machine_type.add_object(
            self.namespace_idx, "TemperatureSensor", objecttype=temperature_sensor_type
        )

        machine = await objects.add_object(
            self.namespace_idx, "Machine1", objecttype=machine_type
        )

        sim_config = self.config["simulation"]
        tags = sim_config["tags"]

        temp_sensor = await machine.get_child(
            f"{self.namespace_idx}:TemperatureSensor"
        )
        temp_var = await temp_sensor.get_child(f"{self.namespace_idx}:Value")
        await temp_var.set_writable()
        self.variables["temperature"] = temp_var
        self.tag_configs["temperature"] = tags["temperature"]
        self.curves["temperature"] = CurveFactory.create(tags["temperature"]["curve"])

        for i in range(1, 4):
            motor = await machine.get_child(f"{self.namespace_idx}:Motor{i}")

            speed_var = await motor.get_child(f"{self.namespace_idx}:Speed")
            await speed_var.set_writable()
            speed_key = f"motor{i}_speed"
            self.variables[speed_key] = speed_var
            self.tag_configs[speed_key] = tags[speed_key]
            self.curves[speed_key] = CurveFactory.create(tags[speed_key]["curve"])

            state_var = await motor.get_child(f"{self.namespace_idx}:State")
            await state_var.set_writable()
            state_key = f"motor{i}_state"
            self.variables[state_key] = state_var
            self.tag_configs[state_key] = tags[state_key]
            self.curves[state_key] = CurveFactory.create(tags[state_key]["curve"])

    async def _setup_data_change_monitoring(self):
        for key, var in self.variables.items():
            await self._subscribe_variable(key, var)

    async def _subscribe_variable(self, key: str, var: Node):
        try:
            if key in self._subscriptions:
                try:
                    await self._subscriptions[key].delete()
                except Exception:
                    pass
                del self._subscriptions[key]

            handler = self._create_data_change_handler(key)
            sub = await self.server.create_subscription(100, handler)
            handle = await sub.subscribe_data_change(var)
            self._subscriptions[key] = (sub, handle)
            logger.debug(f"Subscribed to data changes for {key}")
        except Exception as e:
            logger.error(f"Failed to subscribe to {key}: {e}")
            self._subscriptions.pop(key, None)

    def _create_data_change_handler(self, key: str):
        class Handler:
            def __init__(self, parent, k):
                self.parent = parent
                self.key = k

            def datachange_notification(self, node, value, data):
                self.parent._on_value_changed(self.key, value)

            def event_notification(self, event):
                pass

        return Handler(self, key)

    async def _resubscribe_all(self):
        logger.warning("Attempting to resubscribe all variables...")
        for key, var in self.variables.items():
            await self._subscribe_variable(key, var)
            await asyncio.sleep(0.1)
        logger.info(f"Resubscribed {len(self._subscriptions)}/{len(self.variables)} variables")

    async def _heartbeat_loop(self):
        while self._running:
            try:
                await asyncio.sleep(self._heartbeat_interval)

                if not self._running:
                    break

                expected_count = len(self.variables)
                actual_count = len(self._subscriptions)

                if actual_count < expected_count:
                    logger.warning(
                        f"Subscription count mismatch: {actual_count}/{expected_count}"
                    )
                    await self._resubscribe_all()
                else:
                    for key in list(self._subscriptions.keys()):
                        if key not in self.variables:
                            logger.warning(f"Stale subscription for {key}, removing")
                            try:
                                sub, _ = self._subscriptions[key]
                                await sub.delete()
                            except Exception:
                                pass
                            del self._subscriptions[key]

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")
                await asyncio.sleep(self._resubscribe_delay)

    def _on_value_changed(self, key: str, value: Any):
        if key not in self._last_values or self._last_values[key] != value:
            self._last_values[key] = value
            callback = self._value_callbacks.get(key)
            if callback:
                try:
                    callback(key, value)
                except Exception as e:
                    logger.error(f"Error in value callback for {key}: {e}")

    def register_value_callback(self, key: str, callback: Callable[[str, Any], None]):
        self._value_callbacks[key] = callback

    async def write_tag_value(self, key: str, value: Any) -> bool:
        if key not in self.variables:
            logger.warning(f"Tag {key} not found for writing")
            return False

        try:
            var = self.variables[key]
            async with self._override_lock:
                self._manual_override[key] = value
            await var.write_value(value)
            logger.info(f"Successfully wrote {value} to {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to write value to {key}: {e}")
            return False

    async def clear_override(self, key: str):
        async with self._override_lock:
            self._manual_override.pop(key, None)

    async def update_values(self):
        current_time = time.time()
        for key, curve in self.curves.items():
            async with self._override_lock:
                if key in self._manual_override:
                    continue
            value = curve.get_value(current_time)
            var = self.variables[key]
            try:
                await var.write_value(value)
            except Exception as e:
                logger.error(f"Failed to write value for {key}: {e}")

    async def start(self):
        await self.server.start()
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        logger.info(f"OPC UA Server started at {self.config['opcua']['endpoint']}")

    async def stop(self):
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        for key, (sub, handle) in self._subscriptions.items():
            try:
                await sub.delete()
            except Exception:
                pass
        self._subscriptions.clear()

        await self.server.stop()
        logger.info("OPC UA Server stopped")

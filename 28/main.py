import asyncio
import logging
import signal
import sys
import yaml
from typing import Dict

from opcua_server import OPCUASimulatorServer
from mqtt_bridge import MQTTBridge
from dashboard import DashboardServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def load_config(config_path: str = "config.yaml") -> Dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


async def main():
    config = load_config()

    opcua_server = OPCUASimulatorServer(config)
    await opcua_server.init()

    mqtt_bridge = None
    try:
        mqtt_bridge = MQTTBridge(config, opcua_server.tag_configs)
        mqtt_bridge.connect()

        for key in opcua_server.variables.keys():
            opcua_server.register_value_callback(
                key, lambda k, v, b=mqtt_bridge: b.on_opcua_value_changed(k, v)
            )

        mqtt_bridge.register_command_callback(
            lambda tag, value: asyncio.create_task(opcua_server.write_tag_value(tag, value))
        )
    except Exception as e:
        logger.warning(f"MQTT Bridge initialization failed: {e}. Continuing without MQTT.")
        mqtt_bridge = None

    dashboard_server = None
    try:
        dashboard_server = DashboardServer(config, opcua_server.tag_configs)
        await dashboard_server.start()

        for key in opcua_server.variables.keys():
            opcua_server.register_value_callback(
                key, lambda k, v, d=dashboard_server: d.on_value_changed(k, v)
            )

        dashboard_server.register_command_callback(
            lambda tag, value: asyncio.create_task(opcua_server.write_tag_value(tag, value))
        )
    except Exception as e:
        logger.warning(f"Dashboard server initialization failed: {e}. Continuing without dashboard.")
        dashboard_server = None

    await opcua_server.start()

    update_interval = config["simulation"].get("update_interval", 1.0)

    stop_event = asyncio.Event()

    def handle_signal():
        logger.info("Received stop signal")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            pass

    logger.info("Starting simulation loop...")
    try:
        while not stop_event.is_set():
            await opcua_server.update_values()
            await asyncio.sleep(update_interval)
    except asyncio.CancelledError:
        logger.info("Simulation loop cancelled")
    finally:
        logger.info("Shutting down...")
        await opcua_server.stop()
        if mqtt_bridge:
            mqtt_bridge.disconnect()
        if dashboard_server:
            await dashboard_server.stop()
        logger.info("Shutdown complete")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(0)

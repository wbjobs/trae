"""
Kafka → InfluxDB consumer for traffic analytics data.

Consumes structured traffic events from Kafka and writes them to
InfluxDB as time-series points, enabling Grafana dashboards.

Data flow:
  Kafka (traffic.events) → Consumer → InfluxDB (traffic bucket)
  Kafka (traffic.flows)  → Consumer → InfluxDB (traffic bucket)
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("kafka-influx-consumer")


class InfluxDBWriter:
    """
    Writes traffic data points to InfluxDB v2.

    Measurement schema:
      - vehicle_events: tags=[camera_id, camera_name, class, event_type],
                       fields=[confidence, speed_kmh, lp_confidence,
                               brightness, gamma, enhancement_applied]
      - traffic_flows:  tags=[camera_id, camera_name],
                       fields=[vehicle_count, avg_speed_kmh, car_count,
                               truck_count, bus_count, motorcycle_count]
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._client = None
        self._write_api = None
        self._bucket = config.get("bucket", "traffic")
        self._org = config.get("org", "traffic-org")
        self._batch_size = 50
        self._batch: list = []
        self._last_flush = time.time()

    def _get_client(self):
        if self._client is None:
            from influxdb_client import InfluxDBClient

            self._client = InfluxDBClient(
                url=self.config["url"],
                token=self.config["token"],
                org=self._org,
            )
            self._write_api = self._client.write_api(
                write_options=None
            )
            logger.info(
                "InfluxDB client connected: %s (org=%s, bucket=%s)",
                self.config["url"],
                self._org,
                self._bucket,
            )
        return self._client

    def write_event(self, event: Dict[str, Any]) -> None:
        """Write a single event as an InfluxDB point."""
        from influxdb_client import Point

        point = Point("vehicle_events")

        point.tag("camera_id", event.get("camera_id", "unknown"))
        point.tag("camera_name", event.get("camera_name", "unknown"))
        point.tag("event_type", event.get("event_type", "unknown"))

        vehicle = event.get("vehicle", {})
        if vehicle:
            point.tag("class", vehicle.get("class", "unknown"))
            point.field("confidence", float(vehicle.get("confidence", 0.0)))
            speed = vehicle.get("speed_kmh")
            if speed is not None:
                point.field("speed_kmh", float(speed))
            lp = vehicle.get("license_plate", "")
            if lp:
                point.tag("license_plate", lp)
                point.field(
                    "lp_confidence", float(vehicle.get("lp_confidence", 0.0))
                )

        lighting = event.get("lighting", {})
        if lighting:
            point.tag("lighting_mode", lighting.get("mode", "unknown"))
            point.field(
                "brightness", float(lighting.get("brightness", 0.0))
            )
            if lighting.get("enhancement_applied"):
                point.field(
                    "enhancement_applied",
                    1 if lighting["enhancement_applied"] else 0,
                )
                point.field(
                    "gamma_value", float(lighting.get("gamma", 1.0))
                )

        ts = event.get("timestamp")
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                point.time(dt)
            except (ValueError, AttributeError):
                point.time(datetime.now(timezone.utc))
        else:
            point.time(datetime.now(timezone.utc))

        self._batch.append(point)
        self._maybe_flush()

    def write_flow(self, flow: Dict[str, Any]) -> None:
        """Write a flow aggregation as an InfluxDB point."""
        from influxdb_client import Point

        point = Point("traffic_flows")
        point.tag("camera_id", flow.get("camera_id", "unknown"))
        point.tag("camera_name", flow.get("camera_name", "unknown"))

        point.field("vehicle_count", int(flow.get("vehicle_count", 0)))

        avg_speeds = flow.get("avg_speed_kmh_by_class", {})
        for cls, speed in avg_speeds.items():
            point.field(f"avg_speed_{cls}", float(speed))

        by_class = flow.get("by_class", {})
        for cls, count in by_class.items():
            point.field(f"{cls}_count", int(count))

        ts = flow.get("timestamp")
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                point.time(dt)
            except (ValueError, AttributeError):
                point.time(datetime.now(timezone.utc))
        else:
            point.time(datetime.now(timezone.utc))

        self._batch.append(point)
        self._maybe_flush()

    def _maybe_flush(self) -> None:
        if len(self._batch) >= self._batch_size or (
            time.time() - self._last_flush > 2.0 and self._batch
        ):
            self._flush()

    def _flush(self) -> None:
        if not self._batch:
            return
        try:
            self._get_client()
            if self._write_api and self._batch:
                self._write_api.write(
                    bucket=self._bucket, org=self._org, record=self._batch
                )
            logger.debug("Flushed %d points to InfluxDB", len(self._batch))
            self._batch.clear()
            self._last_flush = time.time()
        except Exception as e:
            logger.error("Failed to write to InfluxDB: %s", e)

    def close(self) -> None:
        self._flush()
        if self._write_api:
            self._write_api.close()
        if self._client:
            self._client.close()
        logger.info("InfluxDB writer closed")


class KafkaInfluxConsumer:
    """
    Consumes traffic events from Kafka and writes to InfluxDB.

    Handles graceful shutdown on SIGINT/SIGTERM.
    """

    def __init__(self, kafka_config: Dict[str, Any], influx_config: Dict[str, Any]):
        self.kafka_config = kafka_config
        self.writer = InfluxDBWriter(influx_config)
        self._consumer = None
        self._running = False

    def _get_consumer(self):
        if self._consumer is None:
            from confluent_kafka import Consumer

            self._consumer = Consumer(
                {
                    "bootstrap.servers": self.kafka_config.get(
                        "bootstrap_servers", "kafka:9092"
                    ),
                    "group.id": "traffic-influx-consumer",
                    "auto.offset.reset": "latest",
                    "enable.auto.commit": True,
                    "auto.commit.interval.ms": 5000,
                }
            )
            logger.info("Kafka consumer created")
        return self._consumer

    def start(self) -> None:
        """Start consuming messages."""
        consumer = self._get_consumer()
        topic_events = self.kafka_config.get("topic_events", "traffic.events")
        topic_flows = self.kafka_config.get("topic_flows", "traffic.flows")

        consumer.subscribe([topic_events, topic_flows])
        self._running = True

        logger.info(
            "Consuming from topics: %s, %s", topic_events, topic_flows
        )

        msg_count = 0
        error_count = 0

        while self._running:
            try:
                msg = consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    error_count += 1
                    logger.debug("Kafka consumer error: %s", msg.error())
                    continue

                topic = msg.topic()
                try:
                    data = json.loads(msg.value().decode("utf-8"))
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    error_count += 1
                    logger.debug("Failed to decode message: %s", e)
                    continue

                if topic == topic_events:
                    self.writer.write_event(data)
                elif topic == topic_flows:
                    self.writer.write_flow(data)

                msg_count += 1
                if msg_count % 1000 == 0:
                    logger.info(
                        "Processed %d messages (%d errors)", msg_count, error_count
                    )

            except KeyboardInterrupt:
                logger.info("Interrupted by user")
                break
            except Exception as e:
                error_count += 1
                logger.debug("Consumer error: %s", e)

        self.stop()

    def stop(self) -> None:
        """Stop the consumer and clean up."""
        self._running = False
        if self._consumer:
            self._consumer.close()
        self.writer.close()
        logger.info("Kafka→InfluxDB consumer stopped")


def main():
    parser = argparse.ArgumentParser(
        description="Kafka → InfluxDB Consumer"
    )
    parser.add_argument(
        "-c",
        "--config",
        type=str,
        default="configs/config.yml",
        help="Path to YAML configuration file",
    )
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    kafka_cfg = raw.get("kafka", {})
    influx_cfg = raw.get("influxdb", {})

    consumer = KafkaInfluxConsumer(kafka_cfg, influx_cfg)

    def shutdown(signum, frame):
        logger.info("Received signal %d, shutting down...", signum)
        consumer.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    consumer.start()


if __name__ == "__main__":
    main()

import logging
import signal
import sys
import time
import argparse
from pathlib import Path

from src.config_loader import load_config
from src.data_pipeline import DataPipeline


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main():
    parser = argparse.ArgumentParser(
        description="IoT Anomaly Detection System"
    )
    parser.add_argument(
        "--config",
        type=str,
        default="config/config.yaml",
        help="Path to configuration file",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=0,
        help="Run duration in seconds (0 for unlimited)",
    )

    args = parser.parse_args()

    setup_logging(args.log_level)
    logger = logging.getLogger(__name__)

    config_path = Path(args.config)
    if not config_path.exists():
        logger.error(f"Config file not found: {config_path}")
        sys.exit(1)

    config = load_config(str(config_path))
    logger.info(f"Loaded configuration from {config_path}")

    pipeline = DataPipeline(config)

    def signal_handler(sig, frame):
        logger.info("Received shutdown signal")
        pipeline.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        logger.info("=" * 60)
        logger.info("IoT Anomaly Detection System Starting")
        logger.info(f"Sensors: {config['sensors']['count']}")
        logger.info(f"Sampling rate: {config['sensors']['sampling_rate']}s")
        logger.info("=" * 60)

        pipeline.start()

        if args.duration > 0:
            logger.info(f"Running for {args.duration} seconds...")
            time.sleep(args.duration)
            pipeline.stop()
        else:
            logger.info("Running indefinitely. Press Ctrl+C to stop.")
            last_status_time = time.time()
            while True:
                time.sleep(1)
                current_time = time.time()
                if current_time - last_status_time >= 60:
                    status = pipeline.get_status()
                    logger.info(f"Pipeline status: {status}")
                    last_status_time = current_time

    except Exception as e:
        logger.error(f"System error: {e}", exc_info=True)
        pipeline.stop()
        sys.exit(1)


if __name__ == "__main__":
    main()

import yaml
from dataclasses import dataclass, field
from typing import Optional, Dict
from pathlib import Path


@dataclass
class ModelConfig:
    model_path: str = "models/esrgan.onnx"
    device: str = "cuda"
    input_width: int = 854
    input_height: int = 480
    output_width: int = 1920
    output_height: int = 1080
    scale_factor: int = 2
    batch_size: int = 4
    fp16: bool = True


@dataclass
class ModelPaths:
    light: str = "models/esrgan_light.onnx"
    standard: str = "models/esrgan.onnx"
    heavy: str = "models/esrgan_heavy.onnx"


@dataclass
class DynamicModelConfig:
    enabled: bool = False
    default_level: str = "standard"
    min_hold_frames: int = 12
    complexity_mapping: Dict[str, str] = field(default_factory=lambda: {
        "simple": "light",
        "standard": "standard",
        "complex": "heavy",
    })
    model_paths: ModelPaths = field(default_factory=ModelPaths)


@dataclass
class RTMPConfig:
    input_url: str = "rtmp://localhost:1935/live/input"
    output_url: str = "rtmp://localhost:1935/live/output"
    input_probe_size: int = 32
    input_analyze_duration: int = 100
    output_bitrate: str = "8M"
    output_preset: str = "veryfast"
    output_gop: int = 60
    output_fps: int = 60


@dataclass
class QueueConfig:
    input_queue_size: int = 32
    output_queue_size: int = 32
    batch_queue_timeout: float = 0.05


@dataclass
class MetricsConfig:
    enabled: bool = True
    host: str = "0.0.0.0"
    port: int = 9090
    psnr_window_size: int = 100


@dataclass
class TemporalStabilizerConfig:
    enabled: bool = True
    alpha: float = 0.92
    strength: float = 0.85
    chroma_alpha: float = 0.97
    chroma_strength: float = 0.5
    reference_history: int = 5


@dataclass
class AppConfig:
    model: ModelConfig = field(default_factory=ModelConfig)
    rtmp: RTMPConfig = field(default_factory=RTMPConfig)
    queue: QueueConfig = field(default_factory=QueueConfig)
    metrics: MetricsConfig = field(default_factory=MetricsConfig)
    stabilizer: TemporalStabilizerConfig = field(default_factory=TemporalStabilizerConfig)
    dynamic_model: DynamicModelConfig = field(default_factory=DynamicModelConfig)
    log_level: str = "INFO"
    graceful_shutdown_timeout: int = 10

    @classmethod
    def from_yaml(cls, path: str) -> "AppConfig":
        config_path = Path(path)
        if not config_path.exists():
            return cls()
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        config = cls()
        if "model" in data:
            for key, value in data["model"].items():
                if hasattr(config.model, key):
                    setattr(config.model, key, value)
        if "rtmp" in data:
            for key, value in data["rtmp"].items():
                if hasattr(config.rtmp, key):
                    setattr(config.rtmp, key, value)
        if "queue" in data:
            for key, value in data["queue"].items():
                if hasattr(config.queue, key):
                    setattr(config.queue, key, value)
        if "metrics" in data:
            for key, value in data["metrics"].items():
                if hasattr(config.metrics, key):
                    setattr(config.metrics, key, value)
        if "stabilizer" in data:
            for key, value in data["stabilizer"].items():
                if hasattr(config.stabilizer, key):
                    setattr(config.stabilizer, key, value)
        if "dynamic_model" in data:
            dm = data["dynamic_model"]
            if "enabled" in dm:
                config.dynamic_model.enabled = dm["enabled"]
            if "default_level" in dm:
                config.dynamic_model.default_level = dm["default_level"]
            if "min_hold_frames" in dm:
                config.dynamic_model.min_hold_frames = dm["min_hold_frames"]
            if "complexity_mapping" in dm:
                config.dynamic_model.complexity_mapping = dm["complexity_mapping"]
            if "model_paths" in dm:
                mp = dm["model_paths"]
                if "light" in mp:
                    config.dynamic_model.model_paths.light = mp["light"]
                if "standard" in mp:
                    config.dynamic_model.model_paths.standard = mp["standard"]
                if "heavy" in mp:
                    config.dynamic_model.model_paths.heavy = mp["heavy"]
        if "log_level" in data:
            config.log_level = data["log_level"]
        if "graceful_shutdown_timeout" in data:
            config.graceful_shutdown_timeout = data["graceful_shutdown_timeout"]
        return config

import os
from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class ModelConfig:
    model_path: str = os.environ.get("AI_MODEL_PATH", "./models/")
    model_name: str = os.environ.get("AI_MODEL_NAME", "qwen2-7b-instruct")
    max_tokens: int = 2048
    temperature: float = 0.1
    top_p: float = 0.9
    device: str = os.environ.get("AI_DEVICE", "cpu")
    use_gpu: bool = False
    gpu_memory_fraction: float = 0.8
    offline_mode: bool = True
    use_4bit_quantization: bool = False
    use_8bit_quantization: bool = False
    use_cpu_offload: bool = False
    low_memory_mode: bool = False


@dataclass
class PreprocessConfig:
    supported_formats: List[str] = field(
        default_factory=lambda: [
            ".pdf", ".docx", ".doc", ".txt", ".md",
            ".xlsx", ".xls", ".csv", ".json", ".xml",
            ".html", ".eml", ".msg"
        ]
    )
    encoding: str = "utf-8"
    chunk_size: int = 1000
    chunk_overlap: int = 100
    extract_images: bool = False
    extract_tables: bool = True
    ocr_enabled: bool = False
    ocr_language: str = "chi_sim+eng"


@dataclass
class ExtractionConfig:
    domain: str = "general"
    confidence_threshold: float = 0.7
    entity_types: List[str] = field(
        default_factory=lambda: [
            "person", "organization", "location",
            "date", "money", "product"
        ]
    )
    relation_types: List[str] = field(
        default_factory=lambda: [
            "belong_to", "located_at", "work_for", "produce"
        ]
    )


@dataclass
class StorageConfig:
    output_dir: str = "./output"
    save_formats: List[str] = field(
        default_factory=lambda: ["json", "excel", "markdown"]
    )
    database_path: str = "./output/results.db"
    enable_versioning: bool = True
    compression: bool = False


@dataclass
class AppConfig:
    model: ModelConfig = field(default_factory=ModelConfig)
    preprocess: PreprocessConfig = field(default_factory=PreprocessConfig)
    extraction: ExtractionConfig = field(default_factory=ExtractionConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    log_level: str = "INFO"
    concurrency: int = 2
    timeout: int = 300
    max_retries: int = 3
    retry_base_delay: float = 1.0
    retry_max_delay: float = 30.0
    retry_backoff_factor: float = 2.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model": self.model.__dict__,
            "preprocess": self.preprocess.__dict__,
            "extraction": self.extraction.__dict__,
            "storage": self.storage.__dict__,
            "log_level": self.log_level,
            "concurrency": self.concurrency,
            "timeout": self.timeout,
            "max_retries": self.max_retries,
            "retry_base_delay": self.retry_base_delay,
            "retry_max_delay": self.retry_max_delay,
            "retry_backoff_factor": self.retry_backoff_factor,
        }

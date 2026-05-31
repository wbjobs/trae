import os
import gc
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class MemoryConfig:
    enable_gc: bool = True
    gc_threshold_mb: int = 500
    unload_idle_model: bool = True
    idle_timeout_seconds: int = 300
    max_batch_size: int = 4
    enable_gradient_checkpointing: bool = False
    use_cpu_offload: bool = False
    cpu_offload_modules: list = field(default_factory=list)


@dataclass
class MemoryStats:
    total_memory_mb: float = 0.0
    used_memory_mb: float = 0.0
    available_memory_mb: float = 0.0
    gpu_memory_mb: float = 0.0
    gpu_used_mb: float = 0.0
    model_size_mb: float = 0.0
    gc_triggered: int = 0


class MemoryOptimizer:
    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self.stats = MemoryStats()
        self._gc_count = 0

    def optimize(self) -> None:
        if self.config.enable_gc:
            current_memory = self._get_used_memory()
            if current_memory > self.config.gc_threshold_mb:
                self._run_gc()

    def _run_gc(self) -> None:
        gc.collect()
        self._gc_count += 1
        self.stats.gc_triggered = self._gc_count
        logger.debug(f"Garbage collection triggered (count: {self._gc_count})")

        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
                logger.debug("CUDA cache cleared")
        except ImportError:
            pass

    def _get_used_memory(self) -> float:
        try:
            import psutil
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            return memory_info.rss / 1024 / 1024
        except ImportError:
            return 0.0

    def get_memory_stats(self) -> MemoryStats:
        self.stats.used_memory_mb = self._get_used_memory()

        try:
            import psutil
            mem = psutil.virtual_memory()
            self.stats.total_memory_mb = mem.total / 1024 / 1024
            self.stats.available_memory_mb = mem.available / 1024 / 1024
        except ImportError:
            pass

        try:
            import torch
            if torch.cuda.is_available():
                self.stats.gpu_memory_mb = torch.cuda.get_device_properties(0).total_memory / 1024 / 1024
                self.stats.gpu_used_mb = torch.cuda.memory_allocated(0) / 1024 / 1024
        except ImportError:
            pass

        return self.stats

    def format_stats(self) -> str:
        stats = self.get_memory_stats()
        lines = [
            "=" * 40,
            "内存使用统计",
            "=" * 40,
            f"系统内存: {stats.total_memory_mb:.1f} MB",
            f"已使用: {stats.used_memory_mb:.1f} MB",
            f"可用: {stats.available_memory_mb:.1f} MB",
        ]
        if stats.gpu_memory_mb > 0:
            lines.extend([
                f"GPU显存: {stats.gpu_memory_mb:.1f} MB",
                f"GPU已使用: {stats.gpu_used_mb:.1f} MB",
            ])
        lines.extend([
            f"GC触发次数: {stats.gc_triggered}",
            "=" * 40,
        ])
        return "\n".join(lines)


class LightweightModelOptimizer:
    @staticmethod
    def optimize_transformers_loading(
        model_path: str,
        use_4bit: bool = False,
        use_8bit: bool = False,
        use_cpu_offload: bool = False,
        device_map: str = "auto",
    ) -> Dict[str, Any]:
        loading_kwargs: Dict[str, Any] = {
            "trust_remote_code": True,
            "local_files_only": True,
        }

        try:
            import torch

            if use_8bit:
                try:
                    import bitsandbytes
                    loading_kwargs["load_in_8bit"] = True
                    loading_kwargs["device_map"] = device_map
                    logger.info("Enabled 8-bit quantization")
                except ImportError:
                    logger.warning("bitsandbytes not available, falling back to normal loading")

            if use_4bit:
                try:
                    import bitsandbytes
                    from transformers import BitsAndBytesConfig

                    bnb_config = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_compute_dtype=torch.bfloat16,
                    )
                    loading_kwargs["quantization_config"] = bnb_config
                    loading_kwargs["device_map"] = device_map
                    logger.info("Enabled 4-bit quantization with NF4")
                except ImportError:
                    logger.warning("bitsandbytes not available for 4-bit quantization")

            if use_cpu_offload:
                loading_kwargs["device_map"] = "auto"
                loading_kwargs["offload_folder"] = "./offload"
                os.makedirs("./offload", exist_ok=True)
                logger.info("Enabled CPU offloading")

        except ImportError:
            pass

        return loading_kwargs

    @staticmethod
    def get_llama_cpp_optimized_config(
        n_ctx: int = 2048,
        use_gpu: bool = False,
        low_memory: bool = False,
    ) -> Dict[str, Any]:
        config = {
            "n_ctx": n_ctx,
            "n_threads": os.cpu_count() or 4,
            "verbose": False,
        }

        if low_memory:
            config.update({
                "n_batch": 512,
                "n_gpu_layers": 0,
                "use_mmap": True,
                "use_mlock": False,
            })
        elif use_gpu:
            config["n_gpu_layers"] = -1
        else:
            config["n_gpu_layers"] = 0

        return config

    @staticmethod
    def estimate_model_size(model_path: str) -> float:
        try:
            if os.path.isfile(model_path):
                return os.path.getsize(model_path) / 1024 / 1024
            elif os.path.isdir(model_path):
                total_size = 0
                for dirpath, _, filenames in os.walk(model_path):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        if os.path.isfile(fp):
                            total_size += os.path.getsize(fp)
                return total_size / 1024 / 1024
        except Exception as e:
            logger.warning(f"Failed to estimate model size: {e}")
        return 0.0

    @staticmethod
    def suggest_quantization(model_size_mb: float, available_ram_mb: float) -> str:
        if model_size_mb * 1.5 < available_ram_mb:
            return "none"
        elif model_size_mb * 0.5 < available_ram_mb:
            return "8bit"
        else:
            return "4bit"

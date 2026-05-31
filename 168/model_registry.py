import time
import logging
import threading
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass

import numpy as np

from config import ModelConfig, DynamicModelConfig
from inference_engine import InferenceEngine

logger = logging.getLogger(__name__)


MODEL_LEVELS = ("light", "standard", "heavy")


@dataclass
class ModelPathMapping:
    light: str
    standard: str
    heavy: str


class ModelRegistry:
    def __init__(
        self,
        base_config: ModelConfig,
        dynamic_config: DynamicModelConfig,
        metrics_collector=None,
    ):
        self._base_config = base_config
        self._dynamic_config = dynamic_config
        self._metrics = metrics_collector
        self._engines: Dict[str, InferenceEngine] = {}
        self._lock = threading.Lock()

        self._hysteresis_counter = 0
        self._current_level = dynamic_config.default_level
        self._min_hold_frames = dynamic_config.min_hold_frames

        self._level_counts: Dict[str, int] = {lvl: 0 for lvl in MODEL_LEVELS}

        self._init_engines()

    def _make_config(self, model_path: str) -> ModelConfig:
        return ModelConfig(
            model_path=model_path,
            device=self._base_config.device,
            input_width=self._base_config.input_width,
            input_height=self._base_config.input_height,
            output_width=self._base_config.output_width,
            output_height=self._base_config.output_height,
            scale_factor=self._base_config.scale_factor,
            batch_size=self._base_config.batch_size,
            fp16=self._base_config.fp16,
        )

    def _init_engines(self):
        paths = self._dynamic_config.model_paths
        for level in MODEL_LEVELS:
            path = getattr(paths, level, None)
            if path is None:
                logger.warning("No model path configured for level '%s', skipping", level)
                continue
            try:
                config = self._make_config(path)
                engine = InferenceEngine(config, metrics_collector=self._metrics)
                self._engines[level] = engine
                logger.info("Loaded model [%s]: %s", level, path)
            except Exception as e:
                logger.error("Failed to load model [%s] from %s: %s", level, path, e)

        if self._current_level not in self._engines:
            fallback = self._find_fallback()
            if fallback:
                self._current_level = fallback
                logger.warning("Default level '%s' unavailable, falling back to '%s'",
                               self._dynamic_config.default_level, fallback)
            else:
                raise RuntimeError("No models loaded successfully")

    def _find_fallback(self) -> Optional[str]:
        for level in MODEL_LEVELS:
            if level in self._engines:
                return level
        return None

    def _hysteresis_decision(self, proposed_level: str) -> str:
        with self._lock:
            if proposed_level == self._current_level:
                self._hysteresis_counter = 0
                return self._current_level

            if proposed_level == "light" and self._current_level == "heavy":
                self._hysteresis_counter += 1
            elif proposed_level == "heavy" and self._current_level == "light":
                self._hysteresis_counter += 1
            else:
                self._hysteresis_counter += 1

            if self._hysteresis_counter >= self._min_hold_frames:
                self._current_level = proposed_level
                self._hysteresis_counter = 0
                logger.info("Model level switched to '%s'", proposed_level)

            return self._current_level

    def _map_complexity_to_level(self, complexity_level: str) -> str:
        mapping = self._dynamic_config.complexity_mapping
        level = mapping.get(complexity_level, "standard")
        if level not in self._engines:
            fallback = self._find_fallback()
            if fallback:
                return fallback
        return level

    def select_level(self, complexity_level: str) -> str:
        proposed = self._map_complexity_to_level(complexity_level)
        return self._hysteresis_decision(proposed)

    def infer_batch(
        self, frames: List[np.ndarray], complexity_level: str = "standard"
    ) -> Tuple[List[np.ndarray], float, str]:
        selected_level = self.select_level(complexity_level)

        if self._metrics:
            self._level_counts[selected_level] += len(frames)
            self._metrics.set_model_level(selected_level)

        engine = self._engines.get(selected_level)
        if engine is None:
            fallback = self._find_fallback()
            if fallback is None:
                raise RuntimeError("No engine available")
            engine = self._engines[fallback]
            selected_level = fallback

        output_frames, inference_time = engine.infer_batch(frames)

        if self._metrics:
            self._metrics.observe_model_inference_duration(selected_level, inference_time)

        return output_frames, inference_time, selected_level

    def infer_batch_with_level(
        self, frames: List[np.ndarray], level: str
    ) -> Tuple[List[np.ndarray], float]:
        engine = self._engines.get(level)
        if engine is None:
            fallback = self._find_fallback()
            if fallback is None:
                raise RuntimeError("No engine available")
            engine = self._engines[fallback]
            level = fallback

        if self._metrics:
            self._metrics.set_model_level(level)

        output_frames, inference_time = engine.infer_batch(frames)

        if self._metrics:
            self._metrics.observe_model_inference_duration(level, inference_time)

        return output_frames, inference_time

    @property
    def current_level(self) -> str:
        return self._current_level

    @property
    def available_levels(self) -> List[str]:
        return list(self._engines.keys())

    @property
    def level_counts(self) -> Dict[str, int]:
        return dict(self._level_counts)
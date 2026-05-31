import numpy as np
from typing import Dict, List, Tuple, Optional, Union, Iterator
from dataclasses import dataclass, field
from itertools import product
import json


@dataclass
class ParameterRange:
    name: str
    min_value: float
    max_value: float
    num_samples: int = 10
    distribution: str = "linear"
    log_base: float = 10.0

    def generate_samples(self) -> np.ndarray:
        if self.distribution == "linear":
            return np.linspace(self.min_value, self.max_value, self.num_samples)
        elif self.distribution == "log":
            return np.logspace(
                np.log(self.min_value) / np.log(self.log_base),
                np.log(self.max_value) / np.log(self.log_base),
                self.num_samples,
                base=self.log_base
            )
        elif self.distribution == "uniform":
            return np.random.uniform(self.min_value, self.max_value, self.num_samples)
        else:
            raise ValueError(f"Unknown distribution: {self.distribution}")


@dataclass
class ParameterSet:
    parameters: Dict[str, float] = field(default_factory=dict)
    param_id: str = ""

    def to_dict(self) -> Dict:
        return {"param_id": self.param_id, "parameters": self.parameters.copy()}

    def __getitem__(self, key: str) -> float:
        return self.parameters[key]

    def __setitem__(self, key: str, value: float):
        self.parameters[key] = value


@dataclass
class IterationConfig:
    max_iterations: int = 1000
    convergence_threshold: float = 1e-6
    relaxation_factor: float = 0.3
    adaptive_stepping: bool = True
    min_step_size: float = 1e-8
    max_step_size: float = 1.0
    parameter_ranges: List[ParameterRange] = field(default_factory=list)
    sweep_mode: str = "cartesian"
    custom_order: Optional[List[int]] = None


class ParameterIterator:
    def __init__(self, config: Optional[IterationConfig] = None):
        self.config = config or IterationConfig()
        self.current_iteration: int = 0
        self.parameter_history: List[ParameterSet] = []
        self.residual_history: List[float] = []
        self._parameter_sets: List[ParameterSet] = []
        self._current_param_index: int = 0

    def add_parameter_range(self, param_range: ParameterRange):
        self.config.parameter_ranges.append(param_range)

    def generate_parameter_sets(self) -> List[ParameterSet]:
        if not self.config.parameter_ranges:
            return [ParameterSet(param_id="single")]

        param_arrays = []
        param_names = []
        for pr in self.config.parameter_ranges:
            param_arrays.append(pr.generate_samples())
            param_names.append(pr.name)

        if self.config.sweep_mode == "cartesian":
            self._parameter_sets = []
            for idx, combo in enumerate(product(*param_arrays)):
                params = {name: value for name, value in zip(param_names, combo)}
                self._parameter_sets.append(ParameterSet(parameters=params, param_id=f"param_{idx:06d}"))
        elif self.config.sweep_mode == "random":
            self._parameter_sets = []
            total_samples = max(pr.num_samples for pr in self.config.parameter_ranges)
            for idx in range(total_samples):
                params = {}
                for name, arr in zip(param_names, param_arrays):
                    params[name] = float(np.random.choice(arr))
                self._parameter_sets.append(ParameterSet(parameters=params, param_id=f"param_{idx:06d}"))
        else:
            raise ValueError(f"Unknown sweep mode: {self.config.sweep_mode}")

        if self.config.custom_order:
            self._parameter_sets = [self._parameter_sets[i] for i in self.config.custom_order
                                    if 0 <= i < len(self._parameter_sets)]

        return self._parameter_sets

    def __iter__(self) -> Iterator[ParameterSet]:
        self._current_param_index = 0
        return self

    def __next__(self) -> ParameterSet:
        if self._current_param_index >= len(self._parameter_sets):
            raise StopIteration
        param_set = self._parameter_sets[self._current_param_index]
        self._current_param_index += 1
        return param_set

    def __len__(self) -> int:
        return len(self._parameter_sets)

    def start_iteration(self):
        self.current_iteration = 0
        self.residual_history = []

    def record_iteration(self, params: ParameterSet, residual: float):
        self.parameter_history.append(params)
        self.residual_history.append(residual)
        self.current_iteration += 1

    def should_continue(self, current_residual: float) -> bool:
        if self.current_iteration >= self.config.max_iterations:
            return False
        if current_residual < self.config.convergence_threshold:
            return False
        return True

    def compute_step_size(self, residual: float) -> float:
        if not self.config.adaptive_stepping:
            return self.config.relaxation_factor

        if len(self.residual_history) < 2:
            return self.config.relaxation_factor

        residual_ratio = residual / max(self.residual_history[-1], 1e-20)
        step = self.config.relaxation_factor * (1.0 + 0.5 * (1.0 - residual_ratio))
        return np.clip(step, self.config.min_step_size, self.config.max_step_size)

    def get_convergence_rate(self) -> Optional[float]:
        if len(self.residual_history) < 3:
            return None
        log_res = np.log(np.maximum(self.residual_history[-10:], 1e-30))
        if len(log_res) < 2:
            return None
        x = np.arange(len(log_res))
        slope, _ = np.polyfit(x, log_res, 1)
        return float(slope)

    def get_progress(self) -> Dict:
        return {
            "current_iteration": self.current_iteration,
            "max_iterations": self.config.max_iterations,
            "residual": self.residual_history[-1] if self.residual_history else None,
            "convergence_rate": self.get_convergence_rate(),
            "parameter_sets_total": len(self._parameter_sets),
            "parameter_sets_completed": self._current_param_index
        }

    def save_sweep_plan(self, filepath: str):
        data = {
            "sweep_mode": self.config.sweep_mode,
            "parameter_ranges": [
                {
                    "name": pr.name,
                    "min": pr.min_value,
                    "max": pr.max_value,
                    "num_samples": pr.num_samples,
                    "distribution": pr.distribution
                }
                for pr in self.config.parameter_ranges
            ],
            "parameter_sets": [ps.to_dict() for ps in self._parameter_sets]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

    def load_sweep_plan(self, filepath: str):
        with open(filepath, 'r') as f:
            data = json.load(f)

        self.config.sweep_mode = data.get("sweep_mode", "cartesian")
        self.config.parameter_ranges = [
            ParameterRange(
                name=pr["name"],
                min_value=pr["min"],
                max_value=pr["max"],
                num_samples=pr.get("num_samples", 10),
                distribution=pr.get("distribution", "linear")
            )
            for pr in data.get("parameter_ranges", [])
        ]

        self._parameter_sets = [
            ParameterSet(parameters=ps["parameters"], param_id=ps["param_id"])
            for ps in data.get("parameter_sets", [])
        ]

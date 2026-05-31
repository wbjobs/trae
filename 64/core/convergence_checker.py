import numpy as np
from typing import Dict, List, Optional, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
import json


class ConvergenceStatus(Enum):
    NOT_CONVERGED = "not_converged"
    CONVERGED = "converged"
    DIVERGED = "diverged"
    OSCILLATING = "oscillating"
    MAX_ITERATIONS = "max_iterations"


@dataclass
class ConvergenceCriteria:
    absolute_tolerance: float = 1e-6
    relative_tolerance: float = 1e-4
    max_residual: float = 1e10
    min_window_size: int = 5
    oscillation_threshold: float = 0.1
    required_consecutive: int = 3


@dataclass
class ResidualData:
    iteration: int
    residuals: Dict[str, float] = field(default_factory=dict)
    field_increments: Dict[str, float] = field(default_factory=dict)
    mass_residual: float = 0.0
    momentum_residual: float = 0.0
    energy_residual: float = 0.0

    def to_dict(self) -> Dict:
        return {
            "iteration": self.iteration,
            "residuals": {k: float(v) for k, v in self.residuals.items()},
            "field_increments": {k: float(v) for k, v in self.field_increments.items()},
            "mass_residual": float(self.mass_residual),
            "momentum_residual": float(self.momentum_residual),
            "energy_residual": float(self.energy_residual)
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'ResidualData':
        return cls(
            iteration=data["iteration"],
            residuals=data.get("residuals", {}),
            field_increments=data.get("field_increments", {}),
            mass_residual=data.get("mass_residual", 0.0),
            momentum_residual=data.get("momentum_residual", 0.0),
            energy_residual=data.get("energy_residual", 0.0)
        )


class ConvergenceChecker:
    def __init__(self, criteria: Optional[ConvergenceCriteria] = None):
        self.criteria = criteria or ConvergenceCriteria()
        self.history: List[ResidualData] = []
        self.status: ConvergenceStatus = ConvergenceStatus.NOT_CONVERGED
        self._consecutive_converged: int = 0

    def check_convergence(self, residual_data: ResidualData) -> ConvergenceStatus:
        self.history.append(residual_data)
        self._update_status(residual_data)
        return self.status

    def _update_status(self, current: ResidualData):
        if len(self.history) < self.criteria.min_window_size:
            self.status = ConvergenceStatus.NOT_CONVERGED
            return

        if self._check_divergence(current):
            self.status = ConvergenceStatus.DIVERGED
            self._consecutive_converged = 0
            return

        if self._check_oscillation():
            self.status = ConvergenceStatus.OSCILLATING
            self._consecutive_converged = 0
            return

        if self._check_absolute_convergence(current):
            self._consecutive_converged += 1
            if self._consecutive_converged >= self.criteria.required_consecutive:
                self.status = ConvergenceStatus.CONVERGED
                return

        if self._check_relative_convergence(current):
            self._consecutive_converged += 1
            if self._consecutive_converged >= self.criteria.required_consecutive:
                self.status = ConvergenceStatus.CONVERGED
                return

        self._consecutive_converged = 0
        self.status = ConvergenceStatus.NOT_CONVERGED

    def _check_divergence(self, current: ResidualData) -> bool:
        residuals = [
            current.mass_residual,
            current.momentum_residual,
            current.energy_residual,
            *current.residuals.values()
        ]
        max_res = max(residuals) if residuals else 0.0

        if not np.isfinite(max_res):
            return True
        if max_res > self.criteria.max_residual:
            return True

        if len(self.history) >= 2:
            prev = self.history[-2]
            prev_max = max(prev.mass_residual, prev.momentum_residual, prev.energy_residual)
            if prev_max > 0 and max_res > prev_max * 100:
                return True
            if prev.mass_residual > 0 and current.mass_residual > prev.mass_residual * 100:
                return True
        return False

    def _check_oscillation(self) -> bool:
        min_required = max(self.criteria.min_window_size, 6)
        if len(self.history) < min_required:
            return False

        window_size = max(self.criteria.min_window_size, 5)
        recent = [h.mass_residual for h in self.history[-window_size:]]
        recent = [r for r in recent if np.isfinite(r)]

        if len(recent) < 4:
            return False

        diffs = np.diff(recent)
        if len(diffs) < 2:
            return False

        sign_changes = 0
        for i in range(1, len(diffs)):
            if diffs[i] * diffs[i-1] < 0:
                sign_changes += 1

        amplitude = np.max(recent) - np.min(recent)
        mean_val = np.mean(recent)
        if mean_val > 1e-20 and amplitude / mean_val > self.criteria.oscillation_threshold:
            if sign_changes >= 2:
                return True
        return False

    def _check_absolute_convergence(self, current: ResidualData) -> bool:
        tol = self.criteria.absolute_tolerance
        if not np.isfinite(current.mass_residual):
            return False
        if not np.isfinite(current.momentum_residual):
            return False
        if not np.isfinite(current.energy_residual):
            return False

        if current.mass_residual < tol:
            if current.momentum_residual < tol:
                if current.energy_residual < tol:
                    return True
        return False

    def _check_relative_convergence(self, current: ResidualData) -> bool:
        if len(self.history) < self.criteria.min_window_size:
            return False

        if not np.isfinite(current.mass_residual):
            return False

        window = self.history[-self.criteria.min_window_size:]
        all_residuals = [h.mass_residual for h in window]
        all_residuals = [r for r in all_residuals if np.isfinite(r) and r > 0]

        if len(all_residuals) < 3:
            return False

        reference_idx = min(len(all_residuals) - 1, max(0, len(all_residuals) // 3))
        reference_residual = all_residuals[reference_idx]

        if reference_residual <= 0:
            return False

        if current.mass_residual / reference_residual < self.criteria.relative_tolerance:
            return True
        return False

    def get_convergence_metrics(self) -> Dict:
        if len(self.history) == 0:
            return {"status": self.status.value, "history_length": 0}

        current = self.history[-1]
        metrics = {
            "status": self.status.value,
            "history_length": len(self.history),
            "current_iteration": current.iteration,
            "mass_residual": float(current.mass_residual) if np.isfinite(current.mass_residual) else float('inf'),
            "momentum_residual": float(current.momentum_residual) if np.isfinite(current.momentum_residual) else float('inf'),
            "energy_residual": float(current.energy_residual) if np.isfinite(current.energy_residual) else float('inf'),
            "consecutive_converged": int(self._consecutive_converged),
            "absolute_tolerance": float(self.criteria.absolute_tolerance),
            "relative_tolerance": float(self.criteria.relative_tolerance),
        }

        if len(self.history) >= 2:
            prev = self.history[-2]
            if current.mass_residual > 0 and np.isfinite(current.mass_residual) and np.isfinite(prev.mass_residual):
                metrics["mass_reduction_rate"] = float(prev.mass_residual / current.mass_residual)
            else:
                metrics["mass_reduction_rate"] = float('inf')

        if len(self.history) >= 5:
            recent = [h.mass_residual for h in self.history[-min(20, len(self.history)):]]
            recent_valid = [r for r in recent if np.isfinite(r) and r > 0]
            if len(recent_valid) >= 4:
                log_recent = np.log(np.array(recent_valid))
                x = np.arange(len(log_recent))
                try:
                    slope, _ = np.polyfit(x, log_recent, 1)
                    metrics["convergence_rate"] = float(slope)
                except Exception:
                    metrics["convergence_rate"] = 0.0
            else:
                metrics["convergence_rate"] = 0.0

        if len(self.history) >= 2:
            initial_history = self.history[:min(5, len(self.history) // 2)]
            initial_mass = max([h.mass_residual for h in initial_history if np.isfinite(h.mass_residual)], default=1.0)
            if initial_mass > 0 and np.isfinite(current.mass_residual):
                metrics["relative_residual"] = float(current.mass_residual / initial_mass)
            else:
                metrics["relative_residual"] = 1.0

        return metrics

    def get_residual_history(self) -> Dict[str, List[float]]:
        return {
            "iterations": [h.iteration for h in self.history],
            "mass": [h.mass_residual for h in self.history],
            "momentum": [h.momentum_residual for h in self.history],
            "energy": [h.energy_residual for h in self.history],
        }

    def reset(self):
        self.history = []
        self.status = ConvergenceStatus.NOT_CONVERGED
        self._consecutive_converged = 0

    def save_history(self, filepath: str):
        data = {
            "criteria": {
                "absolute_tolerance": self.criteria.absolute_tolerance,
                "relative_tolerance": self.criteria.relative_tolerance,
                "max_residual": self.criteria.max_residual,
            },
            "status": self.status.value,
            "history": [h.to_dict() for h in self.history]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

    def load_history(self, filepath: str):
        with open(filepath, 'r') as f:
            data = json.load(f)

        self.criteria = ConvergenceCriteria(
            absolute_tolerance=data.get("criteria", {}).get("absolute_tolerance", 1e-6),
            relative_tolerance=data.get("criteria", {}).get("relative_tolerance", 1e-4),
            max_residual=data.get("criteria", {}).get("max_residual", 1e10),
        )
        self.status = ConvergenceStatus(data.get("status", "not_converged"))
        self.history = [ResidualData.from_dict(h) for h in data.get("history", [])]

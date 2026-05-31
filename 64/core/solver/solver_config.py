import numpy as np
from typing import Dict, Optional, Tuple
from dataclasses import dataclass, field
from ..precision_kernels import PRECISION, to_precision


@dataclass
class SolverConfig:
    solver_type: str = "navier_stokes"
    time_integration: str = "implicit"
    relaxation_factor: float = 0.3
    cfl_number: float = 0.5
    viscosity: float = 1e-3
    density: float = 1.0
    gravity: Tuple[float, float, float] = (0.0, -9.81, 0.0)
    boundary_conditions: Dict[str, Dict] = field(default_factory=dict)


@dataclass
class FluidState:
    velocity: np.ndarray
    pressure: np.ndarray
    temperature: Optional[np.ndarray] = None
    density_field: Optional[np.ndarray] = None
    time: float = 0.0
    iteration: int = 0

    def copy(self) -> 'FluidState':
        return FluidState(
            velocity=self.velocity.copy(),
            pressure=self.pressure.copy(),
            temperature=self.temperature.copy() if self.temperature is not None else None,
            density_field=self.density_field.copy() if self.density_field is not None else None,
            time=self.time,
            iteration=self.iteration
        )

    def to_precision(self):
        self.velocity = to_precision(self.velocity)
        self.pressure = to_precision(self.pressure)
        if self.temperature is not None:
            self.temperature = to_precision(self.temperature)
        if self.density_field is not None:
            self.density_field = to_precision(self.density_field)
        return self

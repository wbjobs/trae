import numpy as np
from typing import Dict, Optional
import time
import os
import json
from .mesh_generator import MeshData
from .parameter_iterator import ParameterSet
from .convergence_checker import ResidualData
from . import precision_kernels as pk
from .precision_kernels import PRECISION, to_precision, mean_precise
from .solver import (
    SolverConfig, FluidState,
    MomentumSolver, PressureSolver, EnergySolver, BoundaryConditionApplier
)


class FluidSolver:
    def __init__(self, mesh: MeshData, config: Optional[SolverConfig] = None):
        self.mesh = mesh
        self.config = config or SolverConfig()
        self.state: Optional[FluidState] = None
        self.solve_time: float = 0.0

        self.checkpoint_dir: Optional[str] = None
        self.checkpoint_interval: int = 50
        self._last_checkpoint_iteration: int = -1

        self._momentum_solver = MomentumSolver(mesh, self.config)
        self._pressure_solver = PressureSolver(mesh, self.config)
        self._energy_solver = EnergySolver(mesh, self.config)
        self._bc_applier = BoundaryConditionApplier(mesh, self.config.boundary_conditions)

    def enable_checkpointing(self, checkpoint_dir: str, interval: int = 50):
        self.checkpoint_dir = checkpoint_dir
        self.checkpoint_interval = interval
        os.makedirs(checkpoint_dir, exist_ok=True)

    def initialize_state(self, initial_conditions: Optional[Dict] = None):
        n_nodes = self.mesh.node_count
        dim = self.mesh.nodes.shape[1]

        velocity = np.zeros((n_nodes, dim), dtype=PRECISION)
        pressure = np.zeros(n_nodes, dtype=PRECISION)
        temperature = np.ones(n_nodes, dtype=PRECISION) * 300.0

        if initial_conditions:
            if "velocity" in initial_conditions:
                velocity[:] = to_precision(initial_conditions["velocity"])
            if "pressure" in initial_conditions:
                pressure[:] = to_precision(initial_conditions["pressure"])
            if "temperature" in initial_conditions:
                temperature[:] = to_precision(initial_conditions["temperature"])

        self.state = FluidState(
            velocity=velocity,
            pressure=pressure,
            temperature=temperature,
            density_field=np.ones(n_nodes, dtype=PRECISION) * self.config.density
        )
        return self.state

    def save_checkpoint(self, iteration: int, residual: Optional[ResidualData] = None):
        if self.checkpoint_dir is None or self.state is None:
            return

        checkpoint_file = os.path.join(self.checkpoint_dir, f"checkpoint_{iteration:06d}.npz")
        info_file = os.path.join(self.checkpoint_dir, "checkpoint_info.json")

        data = {
            "velocity": self.state.velocity,
            "pressure": self.state.pressure,
            "iteration": iteration,
            "time": self.state.time,
            "solve_time": self.solve_time
        }
        if self.state.temperature is not None:
            data["temperature"] = self.state.temperature
        if self.state.density_field is not None:
            data["density_field"] = self.state.density_field

        np.savez(checkpoint_file, **data)

        info = {
            "latest_iteration": iteration,
            "latest_checkpoint": checkpoint_file,
            "timestamp": time.time(),
            "residual": residual.to_dict() if residual else None
        }
        with open(info_file, 'w') as f:
            json.dump(info, f, indent=2)

        self._last_checkpoint_iteration = iteration

    def load_checkpoint(self, checkpoint_file: Optional[str] = None) -> int:
        if self.checkpoint_dir is None:
            return -1

        if checkpoint_file is None:
            info_file = os.path.join(self.checkpoint_dir, "checkpoint_info.json")
            if os.path.exists(info_file):
                with open(info_file, 'r') as f:
                    info = json.load(f)
                checkpoint_file = info.get("latest_checkpoint")

        if checkpoint_file is None or not os.path.exists(checkpoint_file):
            return -1

        data = np.load(checkpoint_file)
        self.state = FluidState(
            velocity=to_precision(data["velocity"]),
            pressure=to_precision(data["pressure"]),
            temperature=to_precision(data["temperature"]) if "temperature" in data else None,
            density_field=to_precision(data["density_field"]) if "density_field" in data else None,
            time=float(data["time"]),
            iteration=int(data["iteration"])
        )
        self.solve_time = float(data.get("solve_time", 0.0))

        return int(data["iteration"])

    def find_latest_checkpoint(self) -> Optional[str]:
        if self.checkpoint_dir is None or not os.path.exists(self.checkpoint_dir):
            return None

        checkpoints = [f for f in os.listdir(self.checkpoint_dir)
                       if f.startswith("checkpoint_") and f.endswith(".npz")]
        if not checkpoints:
            return None

        checkpoints.sort()
        return os.path.join(self.checkpoint_dir, checkpoints[-1])

    def apply_boundary_conditions(self, state: FluidState) -> FluidState:
        return self._bc_applier.apply(state)

    def compute_residuals(self, state: FluidState, prev_state: FluidState) -> ResidualData:
        du = np.linalg.norm(state.velocity - prev_state.velocity, axis=1)
        dp = np.abs(state.pressure - prev_state.pressure)

        mass_residual = mean_precise(np.abs(state.velocity[:, 0])) if state.velocity.shape[1] > 0 else 0.0
        momentum_residual = mean_precise(du)
        energy_residual = 0.0
        if state.temperature is not None and prev_state.temperature is not None:
            dt = np.abs(state.temperature - prev_state.temperature)
            energy_residual = mean_precise(dt)

        return ResidualData(
            iteration=state.iteration,
            residuals={
                "velocity": mean_precise(du),
                "pressure": mean_precise(dp)
            },
            field_increments={
                "velocity": float(np.max(du)),
                "pressure": float(np.max(dp))
            },
            mass_residual=mass_residual,
            momentum_residual=momentum_residual,
            energy_residual=energy_residual
        )

    def solve_step(self, params: Optional[ParameterSet] = None) -> ResidualData:
        if self.state is None:
            raise ValueError("State not initialized. Call initialize_state() first.")

        start_time = time.time()
        prev_state = self.state.copy()

        if params:
            self._update_solver_params(params)

        u_new, v_new = self._momentum_solver.solve(self.state)
        self.state.velocity[:, 0] = u_new
        self.state.velocity[:, 1] = v_new

        u_corr, v_corr, p_corr = self._pressure_solver.solve(self.state)
        self.state.velocity[:, 0] = u_corr
        self.state.velocity[:, 1] = v_corr
        self.state.pressure = p_corr

        T_new = self._energy_solver.solve(self.state)
        if len(T_new) > 0 and self.state.temperature is not None:
            self.state.temperature = T_new

        self.state = self.apply_boundary_conditions(self.state)
        self.state.iteration += 1

        residual = self.compute_residuals(self.state, prev_state)
        self.solve_time += time.time() - start_time

        if (self.checkpoint_dir is not None and
            self.state.iteration % self.checkpoint_interval == 0 and
            self.state.iteration != self._last_checkpoint_iteration):
            self.save_checkpoint(self.state.iteration, residual)

        return residual

    def _update_solver_params(self, params: ParameterSet):
        if "viscosity" in params.parameters:
            self.config.viscosity = params["viscosity"]
            self._momentum_solver.config.viscosity = params["viscosity"]
        if "density" in params.parameters:
            self.config.density = params["density"]
            self._momentum_solver.config.density = params["density"]
        if "relaxation_factor" in params.parameters:
            self.config.relaxation_factor = params["relaxation_factor"]
            self._momentum_solver.config.relaxation_factor = params["relaxation_factor"]
            self._energy_solver.config.relaxation_factor = params["relaxation_factor"]

    def get_state_dict(self) -> Dict:
        if self.state is None:
            return {}
        return {
            "velocity_mean": mean_precise(self.state.velocity),
            "velocity_max": float(np.max(self.state.velocity)),
            "pressure_mean": mean_precise(self.state.pressure),
            "pressure_max": float(np.max(self.state.pressure)),
            "temperature_mean": mean_precise(self.state.temperature) if self.state.temperature is not None else None,
            "time": float(self.state.time),
            "iteration": int(self.state.iteration),
            "solve_time": float(self.solve_time),
            "precision": str(PRECISION),
            "numba_enabled": pk.HAS_NUMBA
        }

    def reset(self):
        self.state = None
        self.solve_time = 0.0
        self._last_checkpoint_iteration = -1

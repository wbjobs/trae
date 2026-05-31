import numpy as np
from typing import Dict
from .solver_config import FluidState
from ..mesh_generator import MeshData


class BoundaryConditionApplier:
    def __init__(self, mesh: MeshData, boundary_conditions: Dict[str, Dict]):
        self.mesh = mesh
        self.bc = boundary_conditions or {}

    def apply(self, state: FluidState) -> FluidState:
        for boundary_name, bc_config in self.bc.items():
            if boundary_name not in self.mesh.boundary_masks:
                continue

            mask = self.mesh.boundary_masks[boundary_name]
            bc_type = bc_config.get("type", "dirichlet")

            if bc_type == "dirichlet":
                self._apply_dirichlet(state, mask, bc_config)
            elif bc_type == "neumann":
                self._apply_neumann(state, mask, bc_config)
            elif bc_type == "periodic":
                self._apply_periodic(state, bc_config)

        return state

    def _apply_dirichlet(self, state: FluidState, mask: np.ndarray, bc_config: Dict):
        if "velocity" in bc_config and state.velocity is not None:
            vel_value = np.array(bc_config["velocity"], dtype=state.velocity.dtype)
            if state.velocity.shape[1] == len(vel_value):
                state.velocity[mask] = vel_value

        if "pressure" in bc_config and state.pressure is not None:
            state.pressure[mask] = bc_config["pressure"]

        if "temperature" in bc_config and state.temperature is not None:
            state.temperature[mask] = bc_config["temperature"]

    def _apply_neumann(self, state: FluidState, mask: np.ndarray, bc_config: Dict):
        if "velocity_gradient" in bc_config and state.velocity is not None:
            grad = np.array(bc_config["velocity_gradient"], dtype=state.velocity.dtype)
            for dim in range(state.velocity.shape[1]):
                state.velocity[mask, dim] += grad[dim]

        if "pressure_gradient" in bc_config and state.pressure is not None:
            state.pressure[mask] += bc_config["pressure_gradient"]

    def _apply_periodic(self, state: FluidState, bc_config: Dict):
        direction = bc_config.get("direction", "x")

        if direction == "x" and state.velocity.shape[0] > 2:
            nx = int(np.sqrt(state.velocity.shape[0])) if state.velocity.ndim == 2 else state.velocity.shape[0]
            if state.velocity.shape[1] == 2:
                for j in range(nx):
                    state.velocity[j, :] = state.velocity[-2 * nx + j, :]
                    state.velocity[-nx + j, :] = state.velocity[nx + j, :]

        elif direction == "y" and state.velocity.shape[0] > 2:
            ny = int(np.sqrt(state.velocity.shape[0])) if state.velocity.ndim == 2 else state.velocity.shape[0]
            if state.velocity.shape[1] == 2:
                for i in range(ny):
                    idx = i * ny
                    state.velocity[idx, :] = state.velocity[idx + ny - 2, :]
                    state.velocity[idx + ny - 1, :] = state.velocity[idx + 1, :]

    def apply_wall_no_slip(self, state: FluidState, wall_mask: np.ndarray):
        if state.velocity is not None:
            state.velocity[wall_mask] = 0.0

    def apply_inlet_velocity(self, state: FluidState, inlet_mask: np.ndarray,
                              velocity: np.ndarray):
        if state.velocity is not None:
            state.velocity[inlet_mask] = velocity

    def apply_outlet_pressure(self, state: FluidState, outlet_mask: np.ndarray,
                               pressure: float):
        if state.pressure is not None:
            state.pressure[outlet_mask] = pressure

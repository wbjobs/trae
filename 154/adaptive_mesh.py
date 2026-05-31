"""
自适应网格模块
================
基于八叉树结构的自适应网格细化
根据功率梯度自动加密高梯度区域
支持 MPI 并行和动态负载均衡
"""

import numpy as np
from typing import Tuple, List, Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class RefinementMode(Enum):
    GRADIENT = "gradient"
    ERROR = "error"
    UNIFORM = "uniform"


@dataclass
class Cell:
    """网格单元"""
    index: Tuple[int, int, int]
    center: Tuple[float, float, float]
    size: Tuple[float, float, float]
    level: int
    is_active: bool = True
    value: float = 0.0
    gradient: float = 0.0


@dataclass
class AdaptiveMesh:
    """自适应网格"""
    dimensions: Tuple[int, int, int]
    bounds: Tuple[float, float, float, float, float, float]
    max_level: int = 4
    min_cells: int = 1000
    max_cells: int = 1000000
    cells: Dict[Tuple[int, int, int], Cell] = field(default_factory=dict)
    cell_volumes: np.ndarray = None
    total_volume: float = 0.0

    def get_cell_count(self) -> int:
        return len(self.cells)


class AdaptiveMeshGenerator:
    """自适应网格生成器"""

    def __init__(self, config: Dict[str, Any], comm=None):
        self.config = config
        self.comm = comm
        self.rank = comm.Get_rank() if comm else 0
        self.nprocs = comm.Get_size() if comm else 1

        self.geometry_config = config["geometry"]
        self.adaptive_config = config.get("adaptive_mesh", {})

        self.initial_dims = self.geometry_config["mesh_dimensions"]
        self.pitch = self.geometry_config["pitch"]
        self.height = self.geometry_config["height"]
        self.pin_radius = self.geometry_config["pin_radius"]

        self.max_refinement_level = self.adaptive_config.get("max_refinement_level", 4)
        self.refinement_threshold = self.adaptive_config.get("refinement_threshold", 0.1)
        self.coarsening_threshold = self.adaptive_config.get("coarsening_threshold", 0.01)
        self.target_cell_count = self.adaptive_config.get("target_cell_count", 50000)
        self.min_cell_count = self.adaptive_config.get("min_cell_count", 10000)

        self.current_mesh = None
        self.field = None
        self.gradient_field = None

        if self.rank == 0:
            print("[AdaptiveMesh] Initializing adaptive mesh module")
            print(f"[AdaptiveMesh]   Initial dims: {self.initial_dims}")
            print(f"[AdaptiveMesh]   Max refinement level: {self.max_refinement_level}")
            print(f"[AdaptiveMesh]   Refinement threshold: {self.refinement_threshold}")

    def generate_initial_mesh(self) -> AdaptiveMesh:
        """生成初始均匀网格"""
        if self.rank == 0:
            print("[AdaptiveMesh] Generating initial uniform mesh...")

        dims = tuple(self.initial_dims)
        bounds = (
            -self.pitch / 2, self.pitch / 2,
            -self.pitch / 2, self.pitch / 2,
            0.0, self.height
        )

        dx = self.pitch / dims[0]
        dy = self.pitch / dims[1]
        dz = self.height / dims[2]

        cells = {}
        for i in range(dims[0]):
            for j in range(dims[1]):
                for k in range(dims[2]):
                    idx = (i, j, k)
                    center = (
                        bounds[0] + (i + 0.5) * dx,
                        bounds[2] + (j + 0.5) * dy,
                        bounds[4] + (k + 0.5) * dz
                    )
                    size = (dx, dy, dz)
                    cells[idx] = Cell(
                        index=idx,
                        center=center,
                        size=size,
                        level=0,
                        is_active=True
                    )

        mesh = AdaptiveMesh(
            dimensions=dims,
            bounds=bounds,
            max_level=0,
            cells=cells,
            cell_volumes=np.full(dims, dx * dy * dz),
            total_volume=self.pitch**2 * self.height
        )

        self.current_mesh = mesh

        if self.rank == 0:
            print(f"[AdaptiveMesh]   Initial cell count: {len(cells)}")

        return mesh

    def compute_gradient(self, field: np.ndarray) -> np.ndarray:
        """计算场的梯度"""
        dims = field.shape

        grad_x = np.zeros_like(field)
        grad_y = np.zeros_like(field)
        grad_z = np.zeros_like(field)

        grad_x[1:-1, :, :] = (field[2:, :, :] - field[:-2, :, :]) / 2.0
        grad_y[:, 1:-1, :] = (field[:, 2:, :] - field[:, :-2, :]) / 2.0
        grad_z[:, :, 1:-1] = (field[:, :, 2:] - field[:, :, :-2]) / 2.0

        grad_x[0, :, :] = field[1, :, :] - field[0, :, :]
        grad_x[-1, :, :] = field[-1, :, :] - field[-2, :, :]
        grad_y[:, 0, :] = field[:, 1, :] - field[:, 0, :]
        grad_y[:, -1, :] = field[:, -1, :] - field[:, -2, :]
        grad_z[:, :, 0] = field[:, :, 1] - field[:, :, 0]
        grad_z[:, :, -1] = field[:, :, -1] - field[:, :, -2]

        gradient_magnitude = np.sqrt(grad_x**2 + grad_y**2 + grad_z**2)

        return gradient_magnitude

    def compute_error_indicator(self, field: np.ndarray) -> np.ndarray:
        """计算误差指示器（基于梯度和二阶导数）"""
        dims = field.shape
        gradient = self.compute_gradient(field)

        laplacian = np.zeros_like(field)
        laplacian[1:-1, 1:-1, 1:-1] = (
            (field[2:, 1:-1, 1:-1] - 2 * field[1:-1, 1:-1, 1:-1] + field[:-2, 1:-1, 1:-1]) +
            (field[1:-1, 2:, 1:-1] - 2 * field[1:-1, 1:-1, 1:-1] + field[1:-1, :-2, 1:-1]) +
            (field[1:-1, 1:-1, 2:] - 2 * field[1:-1, 1:-1, 1:-1] + field[1:-1, 1:-1, :-2])
        )

        error_indicator = np.abs(laplacian) + 0.1 * gradient

        return error_indicator

    def refine_mesh(
        self,
        field: np.ndarray,
        mode: RefinementMode = RefinementMode.GRADIENT
    ) -> AdaptiveMesh:
        """根据场梯度细化网格"""
        if self.rank == 0:
            print(f"[AdaptiveMesh] Refining mesh (mode: {mode.value})...")

        if mode == RefinementMode.GRADIENT:
            indicator = self.compute_gradient(field)
        elif mode == RefinementMode.ERROR:
            indicator = self.compute_error_indicator(field)
        else:
            return self.current_mesh

        max_indicator = np.max(indicator)
        if max_indicator > 0:
            normalized_indicator = indicator / max_indicator
        else:
            normalized_indicator = np.zeros_like(indicator)

        dims = field.shape
        bounds = self.current_mesh.bounds

        new_cells = {}
        level = min(self.current_mesh.max_level + 1, self.max_refinement_level)

        for i in range(dims[0]):
            for j in range(dims[1]):
                for k in range(dims[2]):
                    idx = (i, j, k)
                    old_cell = self.current_mesh.cells[idx]

                    if normalized_indicator[i, j, k] > self.refinement_threshold:
                        refined_cells = self._refine_cell(old_cell, level)
                        new_cells.update(refined_cells)
                    elif normalized_indicator[i, j, k] < self.coarsening_threshold and level > 0:
                        coarsened = self._coarsen_cell(old_cell, level - 1)
                        if coarsened:
                            new_cells[coarsened.index] = coarsened
                        else:
                            new_cells[idx] = old_cell
                    else:
                        new_cells[idx] = old_cell

        new_dims = self._compute_new_dimensions(new_cells)
        mesh = AdaptiveMesh(
            dimensions=new_dims,
            bounds=bounds,
            max_level=level,
            cells=new_cells,
            total_volume=self.current_mesh.total_volume
        )

        mesh.cell_volumes = self._compute_cell_volumes(mesh)

        if self.rank == 0:
            print(f"[AdaptiveMesh]   New cell count: {len(new_cells)}")
            print(f"[AdaptiveMesh]   Level: {level}")

        return mesh

    def _refine_cell(self, cell: Cell, new_level: int) -> Dict[Tuple[int, int, int], Cell]:
        """细化一个网格单元为8个子单元"""
        refined = {}
        cx, cy, cz = cell.center
        dx, dy, dz = cell.size

        new_dx = dx / 2.0
        new_dy = dy / 2.0
        new_dz = dz / 2.0

        for di in range(2):
            for dj in range(2):
                for dk in range(2):
                    new_idx = (
                        cell.index[0] * 2 + di,
                        cell.index[1] * 2 + dj,
                        cell.index[2] * 2 + dk
                    )
                    new_center = (
                        cx - dx/4 + di * new_dx,
                        cy - dy/4 + dj * new_dy,
                        cz - dz/4 + dk * new_dz
                    )
                    refined[new_idx] = Cell(
                        index=new_idx,
                        center=new_center,
                        size=(new_dx, new_dy, new_dz),
                        level=new_level,
                        is_active=True,
                        value=cell.value
                    )

        return refined

    def _coarsen_cell(self, cell: Cell, new_level: int) -> Optional[Cell]:
        """尝试粗化网格单元"""
        if cell.level <= 0:
            return None

        coarse_idx = (
            cell.index[0] // 2,
            cell.index[1] // 2,
            cell.index[2] // 2
        )

        return Cell(
            index=coarse_idx,
            center=cell.center,
            size=(cell.size[0] * 2, cell.size[1] * 2, cell.size[2] * 2),
            level=new_level,
            is_active=True,
            value=cell.value
        )

    def _compute_new_dimensions(self, cells: Dict[Tuple[int, int, int], Cell]) -> Tuple[int, int, int]:
        """计算新的网格尺寸"""
        max_i = max(c[0] for c in cells.keys())
        max_j = max(c[1] for c in cells.keys())
        max_k = max(c[2] for c in cells.keys())

        return (max_i + 1, max_j + 1, max_k + 1)

    def _compute_cell_volumes(self, mesh: AdaptiveMesh) -> np.ndarray:
        """计算所有网格单元的体积"""
        dims = mesh.dimensions
        volumes = np.zeros(dims)

        for idx, cell in mesh.cells.items():
            volumes[idx] = cell.size[0] * cell.size[1] * cell.size[2]

        return volumes

    def transfer_field_to_mesh(
        self,
        field: np.ndarray,
        source_mesh: AdaptiveMesh,
        target_mesh: AdaptiveMesh
    ) -> np.ndarray:
        """将场数据从源网格传递到目标网格"""
        target_dims = target_mesh.dimensions
        target_field = np.zeros(target_dims)

        for target_idx, target_cell in target_mesh.cells.items():
            tx, ty, tz = target_cell.center

            source_idx = self._find_nearest_cell(
                (tx, ty, tz), source_mesh
            )

            if source_idx in source_mesh.cells:
                target_field[target_idx] = source_mesh.cells[source_idx].value
            else:
                target_field[target_idx] = self._interpolate_at_point(
                    (tx, ty, tz), field, source_mesh
                )

        return target_field

    def _find_nearest_cell(
        self,
        point: Tuple[float, float, float],
        mesh: AdaptiveMesh
    ) -> Optional[Tuple[int, int, int]]:
        """查找最近的网格单元"""
        min_dist = float('inf')
        nearest_idx = None

        px, py, pz = point

        for idx, cell in mesh.cells.items():
            cx, cy, cz = cell.center
            dist = (cx - px)**2 + (cy - py)**2 + (cz - pz)**2
            if dist < min_dist:
                min_dist = dist
                nearest_idx = idx

        return nearest_idx

    def _interpolate_at_point(
        self,
        point: Tuple[float, float, float],
        field: np.ndarray,
        mesh: AdaptiveMesh
    ) -> float:
        """在给定点进行三线性插值"""
        from scipy.interpolate import RegularGridInterpolator

        dims = mesh.dimensions
        bounds = mesh.bounds

        x = np.linspace(bounds[0], bounds[1], dims[0])
        y = np.linspace(bounds[2], bounds[3], dims[1])
        z = np.linspace(bounds[4], bounds[5], dims[2])

        x_centers = (x[:-1] + x[1:]) / 2 if len(x) > 1 else x
        y_centers = (y[:-1] + y[1:]) / 2 if len(y) > 1 else y
        z_centers = (z[:-1] + z[1:]) / 2 if len(z) > 1 else z

        if field.shape == (len(x_centers), len(y_centers), len(z_centers)):
            interpolator = RegularGridInterpolator(
                (x_centers, y_centers, z_centers),
                field,
                method="linear",
                bounds_error=False,
                fill_value=0.0
            )
            return interpolator([[point[0], point[1], point[2]]])[0]

        return 0.0

    def optimize_cell_count(
        self,
        field: np.ndarray,
        target_count: Optional[int] = None
    ) -> AdaptiveMesh:
        """优化网格单元数量"""
        if target_count is None:
            target_count = self.target_cell_count

        if self.rank == 0:
            print(f"[AdaptiveMesh] Optimizing cell count to ~{target_count}...")

        current_count = len(self.current_mesh.cells)

        if current_count > target_count * 1.5:
            self.coarsening_threshold *= 0.5
            self.refinement_threshold *= 1.5
        elif current_count < target_count * 0.5:
            self.coarsening_threshold *= 1.5
            self.refinement_threshold *= 0.5

        mesh = self.refine_mesh(field)

        self.current_mesh = mesh

        return mesh

    def get_active_cells_mask(self, mesh: AdaptiveMesh) -> np.ndarray:
        """获取活动单元的掩码"""
        dims = mesh.dimensions
        mask = np.zeros(dims, dtype=bool)

        for idx in mesh.cells.keys():
            mask[idx] = True

        return mask

    def compute_field_on_active_cells(
        self,
        field: np.ndarray,
        mesh: AdaptiveMesh
    ) -> Dict[Tuple[int, int, int], float]:
        """在活动单元上计算场值"""
        result = {}

        for idx in mesh.cells.keys():
            result[idx] = field[idx]

        return result


class MeshOptimizer:
    """网格优化器 - 减少计算时间"""

    def __init__(self, config: Dict[str, Any], comm=None):
        self.config = config
        self.comm = comm
        self.rank = comm.Get_rank() if comm else 0
        self.nprocs = comm.Get_size() if comm else 1

        self.mesh_generator = AdaptiveMeshGenerator(config, comm)
        self.optimization_config = config.get("optimization", {})

        self.target_speedup = self.optimization_config.get("target_speedup", 2.0)
        self.max_iterations_between_adaptation = \
            self.optimization_config.get("adaptation_interval", 3)

        self.iteration_count = 0
        self.computation_times = []

    def should_adapt(self, iteration: int) -> bool:
        """判断是否应该进行网格自适应"""
        return (iteration % self.max_iterations_between_adaptation == 0
                and iteration > 0)

    def adapt_mesh(
        self,
        power_field: np.ndarray,
        temperature_field: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray, AdaptiveMesh]:
        """执行网格自适应"""
        if self.rank == 0:
            print("[Optimizer] Adapting mesh based on power gradient...")

        self.iteration_count += 1

        new_mesh = self.mesh_generator.refine_mesh(
            power_field, RefinementMode.GRADIENT
        )

        new_mesh = self.mesh_generator.optimize_cell_count(power_field)

        new_power_field = self.mesh_generator.transfer_field_to_mesh(
            power_field, self.mesh_generator.current_mesh, new_mesh
        )

        new_temp_field = self.mesh_generator.transfer_field_to_mesh(
            temperature_field, self.mesh_generator.current_mesh, new_mesh
        )

        self.mesh_generator.current_mesh = new_mesh

        if self.rank == 0:
            old_count = len(self.mesh_generator.current_mesh.cells)
            new_count = len(new_mesh.cells)
            print(f"[Optimizer]   Cell count: {old_count} -> {new_count}")
            print(f"[Optimizer]   Estimated speedup: {old_count / max(new_count, 1):.2f}x")

        return new_power_field, new_temp_field, new_mesh

    def estimate_computation_time(self, mesh: AdaptiveMesh) -> float:
        """估计计算时间"""
        cell_count = len(mesh.cells)
        base_time_per_cell = 1e-6

        return cell_count * base_time_per_cell

    def apply_early_convergence(
        self,
        iteration: int,
        convergence_history: List[Dict]
    ) -> bool:
        """应用早期收敛判据"""
        if len(convergence_history) < 5:
            return False

        recent_errors = [
            h["power_error"] for h in convergence_history[-5:]
        ]

        if max(recent_errors) < self.config["simulation"]["convergence_criterion"]:
            return True

        return False


def create_adaptive_mesh_config() -> Dict[str, Any]:
    """创建自适应网格配置"""
    return {
        "adaptive_mesh": {
            "enabled": True,
            "max_refinement_level": 4,
            "refinement_threshold": 0.1,
            "coarsening_threshold": 0.01,
            "target_cell_count": 50000,
            "min_cell_count": 10000,
            "adaptation_interval": 3
        },
        "optimization": {
            "target_speedup": 2.0,
            "adaptation_interval": 3,
            "early_convergence": True
        }
    }

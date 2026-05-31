"""
数据传递模块
==============
实现中子输运和热工水力模块之间的数据映射和传递
支持保守插值和一致性传递
"""

import numpy as np
from typing import Dict, Tuple, Optional
from scipy.interpolate import RegularGridInterpolator


class DataTransfer:
    """
    数据传递类

    实现不同物理场之间的数据映射：
    - 功率分布：中子输运 → 热工水力
    - 温度场：热工水力 → 中子输运
    """

    def __init__(self, config: Dict, comm=None):
        """
        初始化数据传递模块

        Parameters
        ----------
        config : dict
            配置参数字典
        comm : MPI.Comm, optional
            MPI 通信子
        """
        self.config = config
        self.comm = comm
        self.rank = comm.Get_rank() if comm else 0
        self.nprocs = comm.Get_size() if comm else 1

        self.dt_config = config.get("data_transfer", {})
        self.geometry_config = config["geometry"]

        self.method = self.dt_config.get("method", "conservative")
        self.interpolation_order = self.dt_config.get("interpolation_order", 1)
        self.scaling_power = self.dt_config.get("scaling_power", 1.0)

        self._power_to_temperature = None
        self._temperature_to_power = None

        if self.rank == 0:
            print(f"[DataTransfer] Method: {self.method}")
            print(f"[DataTransfer] Interpolation order: {self.interpolation_order}")

    def map_power_to_thermal(
        self,
        power_field: np.ndarray,
        source_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray],
        target_mesh: Optional[Tuple[np.ndarray, np.ndarray, np.ndarray]] = None
    ) -> np.ndarray:
        """
        将功率分布从中子输运网格映射到热工水力网格

        Parameters
        ----------
        power_field : np.ndarray
            源功率场
        source_mesh : tuple
            源网格坐标 (x, y, z)
        target_mesh : tuple, optional
            目标网格坐标

        Returns
        -------
        np.ndarray
            映射后的功率场
        """
        if target_mesh is None:
            return power_field.copy()

        if np.array_equal(source_mesh[0], target_mesh[0]) and \
           np.array_equal(source_mesh[1], target_mesh[1]) and \
           np.array_equal(source_mesh[2], target_mesh[2]):
            return power_field.copy()

        if self.method == "conservative":
            return self._conservative_mapping(
                power_field, source_mesh, target_mesh
            )
        elif self.method == "consistent":
            return self._consistent_mapping(
                power_field, source_mesh, target_mesh
            )
        else:
            return self._interpolate_field(
                power_field, source_mesh, target_mesh
            )

    def map_temperature_to_neutronics(
        self,
        temperature_field: np.ndarray,
        source_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray],
        target_mesh: Optional[Tuple[np.ndarray, np.ndarray, np.ndarray]] = None
    ) -> np.ndarray:
        """
        将温度场从热工水力网格映射到中子输运网格

        Parameters
        ----------
        temperature_field : np.ndarray
            源温度场
        source_mesh : tuple
            源网格坐标 (x, y, z)
        target_mesh : tuple, optional
            目标网格坐标

        Returns
        -------
        np.ndarray
            映射后的温度场
        """
        if target_mesh is None:
            return temperature_field.copy()

        if np.array_equal(source_mesh[0], target_mesh[0]) and \
           np.array_equal(source_mesh[1], target_mesh[1]) and \
           np.array_equal(source_mesh[2], target_mesh[2]):
            return temperature_field.copy()

        return self._interpolate_field(
            temperature_field, source_mesh, target_mesh
        )

    def _conservative_mapping(
        self,
        field: np.ndarray,
        source_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray],
        target_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray]
    ) -> np.ndarray:
        """
        保守映射（保持总量守恒）

        Parameters
        ----------
        field : np.ndarray
            源场
        source_mesh : tuple
            源网格
        target_mesh : tuple
            目标网格

        Returns
        -------
        np.ndarray
            映射后的场
        """
        sx, sy, sz = source_mesh
        tx, ty, tz = target_mesh

        s_dx = np.diff(sx) if len(sx) > 1 else np.array([1.0])
        s_dy = np.diff(sy) if len(sy) > 1 else np.array([1.0])
        s_dz = np.diff(sz) if len(sz) > 1 else np.array([1.0])

        t_dx = np.diff(tx) if len(tx) > 1 else np.array([1.0])
        t_dy = np.diff(ty) if len(ty) > 1 else np.array([1.0])
        t_dz = np.diff(tz) if len(tz) > 1 else np.array([1.0])

        total_source = np.sum(field * s_dx[:, np.newaxis, np.newaxis] *
                             s_dy[np.newaxis, :, np.newaxis] *
                             s_dz[np.newaxis, np.newaxis, :])

        interpolated = self._interpolate_field(field, source_mesh, target_mesh)

        total_target = np.sum(interpolated * t_dx[:, np.newaxis, np.newaxis] *
                             t_dy[np.newaxis, :, np.newaxis] *
                             t_dz[np.newaxis, np.newaxis, :])

        if total_target > 0:
            scaling_factor = total_source / total_target
            interpolated *= scaling_factor

        return interpolated

    def _consistent_mapping(
        self,
        field: np.ndarray,
        source_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray],
        target_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray]
    ) -> np.ndarray:
        """
        一致性映射（保持空间分布特征）

        Parameters
        ----------
        field : np.ndarray
            源场
        source_mesh : tuple
            源网格
        target_mesh : tuple
            目标网格

        Returns
        -------
        np.ndarray
            映射后的场
        """
        return self._interpolate_field(field, source_mesh, target_mesh)

    def _interpolate_field(
        self,
        field: np.ndarray,
        source_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray],
        target_mesh: Tuple[np.ndarray, np.ndarray, np.ndarray]
    ) -> np.ndarray:
        """
        使用三线性插值进行场映射

        Parameters
        ----------
        field : np.ndarray
            源场
        source_mesh : tuple
            源网格 (x, y, z)
        target_mesh : tuple
            目标网格 (x, y, z)

        Returns
        -------
        np.ndarray
            插值后的场
        """
        sx, sy, sz = source_mesh
        tx, ty, tz = target_mesh

        method = "linear" if self.interpolation_order >= 1 else "nearest"

        if len(sx) == field.shape[0] and len(sy) == field.shape[1] and len(sz) == field.shape[2]:
            interpolator = RegularGridInterpolator(
                (sx, sy, sz), field, method=method, bounds_error=False, fill_value=None
            )

            TX, TY, TZ = np.meshgrid(tx, ty, tz, indexing="ij")
            points = np.column_stack([TX.ravel(), TY.ravel(), TZ.ravel()])

            interpolated = interpolator(points).reshape(TX.shape)

            return interpolated
        else:
            sx_centers = (sx[:-1] + sx[1:]) / 2 if len(sx) > 1 else sx
            sy_centers = (sy[:-1] + sy[1:]) / 2 if len(sy) > 1 else sy
            sz_centers = (sz[:-1] + sz[1:]) / 2 if len(sz) > 1 else sz

            interpolator = RegularGridInterpolator(
                (sx_centers, sy_centers, sz_centers), field,
                method=method, bounds_error=False, fill_value=None
            )

            tx_centers = (tx[:-1] + tx[1:]) / 2 if len(tx) > 1 else tx
            ty_centers = (ty[:-1] + ty[1:]) / 2 if len(ty) > 1 else ty
            tz_centers = (tz[:-1] + tz[1:]) / 2 if len(tz) > 1 else tz

            TX, TY, TZ = np.meshgrid(tx_centers, ty_centers, tz_centers, indexing="ij")
            points = np.column_stack([TX.ravel(), TY.ravel(), TZ.ravel()])

            interpolated = interpolator(points).reshape(TX.shape)

            return interpolated

    def compute_relaxation(
        self,
        new_field: np.ndarray,
        old_field: np.ndarray,
        relaxation_factor: float
    ) -> np.ndarray:
        """
        应用松弛因子

        Parameters
        ----------
        new_field : np.ndarray
            新场值
        old_field : np.ndarray
            旧场值
        relaxation_factor : float
            松弛因子 (0, 1]

        Returns
        -------
        np.ndarray
            松弛后的场
        """
        return relaxation_factor * new_field + (1 - relaxation_factor) * old_field

    def check_convergence(
        self,
        field_1: np.ndarray,
        field_2: np.ndarray,
        criterion: float = 0.001
    ) -> Tuple[bool, float]:
        """
        检查收敛性

        Parameters
        ----------
        field_1 : np.ndarray
            第一个场
        field_2 : np.ndarray
            第二个场
        criterion : float
            收敛判据

        Returns
        -------
        tuple
            (是否收敛, 相对误差)
        """
        norm_1 = np.linalg.norm(field_1.ravel())
        norm_2 = np.linalg.norm(field_2.ravel())

        if norm_1 > 0 or norm_2 > 0:
            relative_error = np.linalg.norm((field_1 - field_2).ravel()) / (
                0.5 * (norm_1 + norm_2)
            )
        else:
            relative_error = 0.0

        return relative_error < criterion, relative_error

    def scale_power(self, power_field: np.ndarray, target_total: float) -> np.ndarray:
        """
        缩放功率场到目标总功率

        Parameters
        ----------
        power_field : np.ndarray
            功率场
        target_total : float
            目标总功率

        Returns
        -------
        np.ndarray
            缩放后的功率场
        """
        current_total = np.sum(power_field)
        if current_total > 0:
            return power_field * (target_total / current_total)
        return power_field

"""
Eigenvalue Solver Package
========================
封装 PETSc/SLEPc 的稀疏矩阵特征值求解器，支持：
- CSR 格式稀疏矩阵输入
- 前 k 个最大/最小特征值求解
- 移位反幂法（Shift-Invert）
- 接近奇异矩阵的鲁棒处理（条件数感知 + 迭代求解器 + 自适应预处理）
- 自动选择求解器（根据对称性/正定性选择 Lanczos/Arnoldi/Krylov-Schur）
- MPI 并行计算
- HDF5 格式输出与可视化辅助
"""

from .solver import (
    EigenSolver,
    EigenSolverConfig,
    SpectralRange,
    RobustConfig,
    KSPType,
    PCType,
    STType,
    EPSType,
    MatrixProperties,
    estimate_condition_number,
    check_symmetry,
    check_positive_definite_quick,
    detect_matrix_properties,
    select_eps_type,
    select_ksp_pc,
)
from .io_utils import (
    EigenResult,
    save_to_hdf5,
    load_from_hdf5,
    plot_eigenvalues,
    plot_eigenvector,
)

__all__ = [
    "EigenSolver",
    "EigenSolverConfig",
    "SpectralRange",
    "RobustConfig",
    "KSPType",
    "PCType",
    "STType",
    "EPSType",
    "MatrixProperties",
    "estimate_condition_number",
    "check_symmetry",
    "check_positive_definite_quick",
    "detect_matrix_properties",
    "select_eps_type",
    "select_ksp_pc",
    "EigenResult",
    "save_to_hdf5",
    "load_from_hdf5",
    "plot_eigenvalues",
    "plot_eigenvector",
]

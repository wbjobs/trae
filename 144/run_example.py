#!/usr/bin/env python
"""
Eigenvalue Solver 示例脚本
===========================
演示使用 eigensolver 包求解稀疏矩阵特征值问题。

用法:
    # 串行运行
    python run_example.py

    # MPI 并行运行（2 进程）
    mpirun -np 2 python run_example.py

    # 指定矩阵规模和特征值个数
    python run_example.py --size 500 --n_eigs 10

    # 使用移位反幂法
    python run_example.py --shift_invert --shift 0.5

    # 求解接近奇异矩阵（鲁棒模式）
    python run_example.py --matrix_type near_singular --robust --n_eigs 10

    # 使用迭代求解器 + ILU 预处理
    python run_example.py --shift_invert --ksp fgmres --pc ilu
"""

import argparse
import logging
import sys
import time

import numpy as np
from scipy.sparse import csr_matrix, diags

from eigensolver import (
    EigenSolver,
    EigenSolverConfig,
    SpectralRange,
    RobustConfig,
    KSPType,
    PCType,
    STType,
    EPSType,
    EigenResult,
    save_to_hdf5,
    load_from_hdf5,
    plot_eigenvalues,
    plot_eigenvector,
    estimate_condition_number,
    detect_matrix_properties,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def generate_sparse_matrix(n: int, matrix_type: str = "laplacian") -> csr_matrix:
    """
    生成测试用稀疏矩阵

    Parameters
    ----------
    n : int
        矩阵维度
    matrix_type : str
        矩阵类型: "laplacian" | "random" | "tridiagonal" | "near_singular"

    Returns
    -------
    scipy.sparse.csr_matrix
    """
    if matrix_type == "laplacian":
        return _generate_laplacian_1d(n)
    elif matrix_type == "random":
        return _generate_random_sparse(n)
    elif matrix_type == "tridiagonal":
        return _generate_tridiagonal(n)
    elif matrix_type == "near_singular":
        return _generate_near_singular(n)
    elif matrix_type == "nonsymmetric":
        return _generate_nonsymmetric(n)
    else:
        raise ValueError(f"未知矩阵类型: {matrix_type}")


def _generate_laplacian_1d(n: int) -> csr_matrix:
    """生成 1D 拉普拉斯算子（三对角矩阵）"""
    h2 = 1.0 / (n + 1) ** 2
    diagonal = 2.0 * np.ones(n) / h2
    off_diag = -1.0 * np.ones(n - 1) / h2
    return diags(
        [off_diag, diagonal, off_diag],
        offsets=[-1, 0, 1],
        shape=(n, n),
        format="csr",
    )


def _generate_random_sparse(n: int, density: float = 0.01) -> csr_matrix:
    """生成随机稀疏对称矩阵"""
    from scipy.sparse import random as sparse_random

    A = sparse_random(
        n, n, density=density, format="csr",
        random_state=42,
    )
    A = (A + A.T) / 2
    A.setdiag(A.diagonal() + n)
    return A.tocsr()


def _generate_tridiagonal(n: int) -> csr_matrix:
    """生成对称三对角矩阵（Toeplitz）"""
    diagonal = np.arange(1, n + 1, dtype=float)
    off_diag = -1.0 * np.ones(n - 1)
    return diags(
        [off_diag, diagonal, off_diag],
        offsets=[-1, 0, 1],
        shape=(n, n),
        format="csr",
    )


def _generate_near_singular(n: int, epsilon: float = 1e-15) -> csr_matrix:
    """
    生成接近奇异的对角矩阵

    diag = [epsilon, 1, 1, ..., 1]，条件数 ≈ 1/epsilon
    """
    diag = np.ones(n)
    diag[0] = epsilon
    return diags([diag], [0], shape=(n, n), format="csr")


def _generate_nonsymmetric(n: int, density: float = 0.05) -> csr_matrix:
    """
    生成非对称稀疏矩阵（带对角占优保证可逆）
    """
    from scipy.sparse import random as sparse_random
    from scipy.sparse import eye as speye

    rng = np.random.RandomState(42)
    A = sparse_random(n, n, density=density, format='csr',
                       random_state=rng)
    A = A + n * speye(n, format='csr')
    return A.tocsr()


def run_solver(args):
    """运行特征值求解器"""
    from mpi4py import MPI

    comm = MPI.COMM_WORLD
    rank = comm.Get_rank()

    A = generate_sparse_matrix(args.size, args.matrix_type)

    if rank == 0:
        cond = estimate_condition_number(A)
        logger.info("=" * 60)
        logger.info("Eigenvalue Solver Demo")
        logger.info(f"MPI 进程数: {comm.Get_size()}")
        logger.info(f"矩阵规模: {args.size}")
        logger.info(f"矩阵类型: {args.matrix_type}")
        logger.info(f"条件数估计: {cond:.2e}")
        logger.info(f"求解特征值个数: {args.n_eigs}")
        logger.info(f"特征值范围: {args.spectral_range}")
        logger.info(f"移位反幂法: {args.shift_invert}")
        if args.shift_invert:
            logger.info(f"移位值: {args.shift}")
        if args.robust:
            logger.info("鲁棒模式: 启用迭代求解器 + ILU 预处理")
        if args.ksp:
            logger.info(f"KSP 类型: {args.ksp}")
        if args.pc:
            logger.info(f"PC 类型: {args.pc}")
        logger.info("=" * 60)

    spectral_range = SpectralRange(args.spectral_range)

    robust = RobustConfig(
        use_iterative_solver=args.robust,
        ksp_type=KSPType(args.ksp) if args.ksp else KSPType.FGMRES,
        pc_type=PCType(args.pc) if args.pc else PCType.ILU,
        ilu_fill_factor=args.ilu_fill,
        enable_regularization=args.regularization,
        regularization_epsilon=args.reg_epsilon,
    )

    config = EigenSolverConfig(
        n_eigs=args.n_eigs,
        spectral_range=spectral_range,
        use_shift_invert=args.shift_invert,
        shift=args.shift if args.shift_invert else None,
        tol=args.tol,
        max_iter=args.max_iter,
        auto_select=not args.no_auto_select,
        eps_type=EPSType(args.eps_type) if args.eps_type else None,
        robust=robust,
    )

    solver = EigenSolver(comm=comm, config=config)

    t_start = time.time()

    if args.near_singular_mode:
        eigenvalues, eigenvectors = solver.solve_near_singular(
            A, shift=args.shift, n_eigs=args.n_eigs,
        )
    else:
        eigenvalues, eigenvectors = solver.solve(A)

    elapsed = time.time() - t_start

    if rank == 0:
        logger.info(f"求解耗时: {elapsed:.4f} 秒")
        logger.info(f"收敛特征值: {len(eigenvalues)} 个")
        logger.info(f"条件数估计: {solver.condition_number_estimate:.2e}")
        logger.info(f"病态矩阵: {solver.is_ill_conditioned}")
        if solver.selected_eps_type:
            logger.info(f"EPS 类型: {solver.selected_eps_type.value}")
        if solver.selected_ksp_type:
            logger.info(f"KSP 类型: {solver.selected_ksp_type.value}")
        if solver.selected_pc_type:
            logger.info(f"PC 类型: {solver.selected_pc_type.value}")
        if solver.matrix_properties:
            logger.info(
                f"对称性: {'对称' if solver.matrix_properties.is_symmetric else '非对称'}"
            )
        logger.info("")
        logger.info("特征值 (前 10 个):")
        logger.info("-" * 50)
        for i, ev in enumerate(eigenvalues[:10]):
            logger.info(f"  λ[{i}] = {ev.real:+.6e} + {ev.imag:+.6e}j")

        result = EigenResult(
            eigenvalues=eigenvalues,
            eigenvectors=eigenvectors,
            n_converged=len(eigenvalues),
            metadata={
                "matrix_size": args.size,
                "matrix_type": args.matrix_type,
                "condition_number": solver.condition_number_estimate,
                "n_eigs": args.n_eigs,
                "spectral_range": args.spectral_range,
                "which": config.which,
                "shift_invert": args.shift_invert,
                "shift": args.shift if args.shift_invert else None,
                "eps_type": solver.selected_eps_type.value if solver.selected_eps_type else None,
                "ksp_type": solver.selected_ksp_type.value if solver.selected_ksp_type else None,
                "pc_type": solver.selected_pc_type.value if solver.selected_pc_type else None,
                "robust_mode": args.robust,
                "auto_select": not args.no_auto_select,
                "solve_time": elapsed,
                "n_converged": len(eigenvalues),
            },
        )

        output_path = args.output or "eigen_result.h5"
        save_to_hdf5(result, output_path, matrix=A if args.save_matrix else None)

        if not args.no_plot:
            try:
                plot_eigenvalues(result, filepath="eigenvalues_spectrum.png")
                if len(eigenvalues) > 0:
                    plot_eigenvector(
                        result, index=0,
                        filepath="eigenvector_0.png",
                    )
            except Exception as e:
                logger.warning(f"绘图失败: {e}")

        logger.info("")
        logger.info("=" * 60)
        logger.info("完成!")
        logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Eigenvalue Solver 示例脚本 (PETSc/SLEPc)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python run_example.py
  python run_example.py --size 500 --n_eigs 10
  python run_example.py --shift_invert --shift 0.5
  python run_example.py --matrix_type near_singular --robust --n_eigs 10
  python run_example.py --matrix_type nonsymmetric --size 200
  python run_example.py --eps_type lanczos --no-auto-select
  python run_example.py --shift_invert --ksp fgmres --pc ilu --ilu-fill 30
  mpirun -np 4 python run_example.py --size 1000
        """,
    )

    parser.add_argument(
        "--size", type=int, default=200,
        help="矩阵规模 (默认: 200)",
    )
    parser.add_argument(
        "--matrix-type", type=str, default="laplacian",
        choices=["laplacian", "random", "tridiagonal", "near_singular", "nonsymmetric"],
        help="测试矩阵类型 (默认: laplacian)",
    )
    parser.add_argument(
        "--n_eigs", type=int, default=10,
        help="求解特征值个数 k (默认: 10)",
    )
    parser.add_argument(
        "--spectral-range", type=str, default="largest_magnitude",
        choices=[e.value for e in SpectralRange],
        help="特征值范围 (默认: largest_magnitude)",
    )
    parser.add_argument(
        "--shift-invert", action="store_true",
        help="启用移位反幂法",
    )
    parser.add_argument(
        "--shift", type=float, default=0.0,
        help="移位反幂法的移位值 (默认: 0.0)",
    )
    parser.add_argument(
        "--tol", type=float, default=1e-8,
        help="收敛容差 (默认: 1e-8)",
    )
    parser.add_argument(
        "--max-iter", type=int, default=1000,
        help="最大迭代次数 (默认: 1000)",
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="HDF5 输出文件路径 (默认: eigen_result.h5)",
    )
    parser.add_argument(
        "--save-matrix", action="store_true",
        help="将原始矩阵保存到 HDF5",
    )
    parser.add_argument(
        "--no-plot", action="store_true",
        help="不生成图像",
    )
    parser.add_argument(
        "--robust", action="store_true",
        help="启用鲁棒模式（迭代求解器 + ILU 预处理）",
    )
    parser.add_argument(
        "--eps-type", type=str, default=None,
        choices=[e.value for e in EPSType],
        help="EPS 求解器类型 (默认: 自动选择)",
    )
    parser.add_argument(
        "--no-auto-select", action="store_true",
        help="禁用自动选择求解器（需配合 --eps-type)",
    )
    parser.add_argument(
        "--near-singular-mode", action="store_true",
        help="使用专门的接近奇异矩阵求解接口",
    )
    parser.add_argument(
        "--ksp", type=str, default=None,
        choices=[e.value for e in KSPType],
        help="KSP 求解器类型 (默认: fgmres for 鲁棒模式)",
    )
    parser.add_argument(
        "--pc", type=str, default=None,
        choices=[e.value for e in PCType],
        help="预处理类型 (默认: ilu for 鲁棒模式)",
    )
    parser.add_argument(
        "--ilu-fill", type=float, default=20.0,
        help="ILU 填充因子 (默认: 20)",
    )
    parser.add_argument(
        "--regularization", action="store_true",
        default=True,
        help="启用对角正则化 (默认: 开启)",
    )
    parser.add_argument(
        "--no-regularization", action="store_false",
        dest="regularization",
        help="禁用对角正则化",
    )
    parser.add_argument(
        "--reg-epsilon", type=float, default=1e-12,
        help="正则化 ε 值 (默认: 1e-12)",
    )

    args = parser.parse_args()
    run_solver(args)


if __name__ == "__main__":
    main()

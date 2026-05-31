#!/usr/bin/env python
"""
Eigenvalue Solver 单元测试
===========================
测试 eigensolver 包的基本功能、鲁棒性和自动求解器选择。

运行:
    python test_solver.py
    mpirun -np 2 python test_solver.py
"""

import sys
import unittest
import numpy as np
from scipy.sparse import csr_matrix, diags, eye, random as sparse_random

from eigensolver import (
    EigenSolver,
    EigenSolverConfig,
    SpectralRange,
    RobustConfig,
    KSPType,
    PCType,
    STType,
    EPSType,
    MatrixProperties,
    EigenResult,
    save_to_hdf5,
    load_from_hdf5,
    plot_eigenvalues,
    estimate_condition_number,
    check_symmetry,
    check_positive_definite_quick,
    detect_matrix_properties,
    select_eps_type,
    select_ksp_pc,
)


def generate_test_matrix(n=50):
    """生成测试用 1D 拉普拉斯矩阵"""
    h2 = 1.0 / (n + 1) ** 2
    diagonal = 2.0 * np.ones(n) / h2
    off_diag = -1.0 * np.ones(n - 1) / h2
    return diags(
        [off_diag, diagonal, off_diag],
        offsets=[-1, 0, 1],
        shape=(n, n),
        format="csr",
    )


def generate_near_singular_matrix(n=50, epsilon=1e-16):
    """生成接近奇异的对角矩阵"""
    diag = np.ones(n)
    diag[0] = epsilon
    return diags([diag], [0], shape=(n, n), format="csr")


def generate_nonsymmetric_matrix(n=50, density=0.05):
    """生成非对称稀疏矩阵"""
    rng = np.random.RandomState(42)
    A = sparse_random(n, n, density=density, format='csr',
                       random_state=rng)
    A = A + n * eye(n, format='csr')
    return A.tocsr()


def generate_symmetric_indefinite(n=50):
    """生成对称不定矩阵（对角有正有负）"""
    diag = np.ones(n)
    diag[::3] = -1.0
    diag[0] = -3.0
    return diags([diag], [0], shape=(n, n), format="csr")


def analytical_laplacian_eigenvalues(n, k):
    """1D 拉普拉斯算子的解析特征值"""
    h2 = 1.0 / (n + 1) ** 2
    j = np.arange(1, k + 1)
    return 2.0 / h2 * (1.0 - np.cos(j * np.pi / (n + 1)))


class TestMatrixDetection(unittest.TestCase):
    """矩阵性质检测测试"""

    def test_check_symmetry_symmetric(self):
        """测试对称矩阵检测"""
        n = 50
        A = generate_test_matrix(n)
        is_sym, viol = check_symmetry(A)
        self.assertTrue(is_sym)
        self.assertLess(viol, 1e-10)

    def test_check_symmetry_nonsymmetric(self):
        """测试非对称矩阵检测"""
        n = 50
        A = generate_nonsymmetric_matrix(n)
        is_sym, viol = check_symmetry(A)
        self.assertFalse(is_sym)
        self.assertGreater(viol, 1e-10)

    def test_check_symmetry_identity(self):
        """测试单位矩阵对称性"""
        n = 50
        A = eye(n, format='csr')
        is_sym, viol = check_symmetry(A)
        self.assertTrue(is_sym)

    def test_check_symmetry_zero(self):
        """测试零矩阵对称性"""
        n = 10
        A = csr_matrix((n, n))
        is_sym, viol = check_symmetry(A)
        self.assertTrue(is_sym)

    def test_positive_definite_quick_diagonal(self):
        """测试对角正定矩阵检测"""
        n = 50
        A = diags([np.arange(1, n + 1)], [0], shape=(n, n), format='csr')
        result = check_positive_definite_quick(A)
        self.assertTrue(result)

    def test_positive_definite_quick_indefinite(self):
        """测试不定矩阵检测"""
        n = 50
        A = generate_symmetric_indefinite(n)
        result = check_positive_definite_quick(A)
        self.assertFalse(result)

    def test_positive_definite_quick_unknown(self):
        """测试无法快速判断的情况"""
        n = 50
        A = generate_test_matrix(n)
        result = check_positive_definite_quick(A)
        self.assertIsNone(result)

    def test_detect_matrix_properties_symmetric(self):
        """测试对称矩阵性质检测"""
        n = 50
        A = generate_test_matrix(n)
        props = detect_matrix_properties(A)
        self.assertTrue(props.is_symmetric)
        self.assertEqual(props.n_rows, n)
        self.assertEqual(props.nnz, A.nnz)
        self.assertGreater(props.density, 0)

    def test_detect_matrix_properties_nonsymmetric(self):
        """测试非对称矩阵性质检测"""
        n = 50
        A = generate_nonsymmetric_matrix(n)
        props = detect_matrix_properties(A)
        self.assertFalse(props.is_symmetric)


class TestAutoSelection(unittest.TestCase):
    """自动求解器选择测试"""

    def test_select_eps_type_symmetric(self):
        """对称矩阵应选择 LANCZOS"""
        props = MatrixProperties(
            is_symmetric=True,
            is_positive_definite=True,
            n_rows=100,
            density=0.01,
        )
        eps = select_eps_type(
            props, SpectralRange.LARGEST_MAGNITUDE,
            use_shift_invert=False,
            is_ill_conditioned=False,
        )
        self.assertEqual(eps, EPSType.LANCZOS)

    def test_select_eps_type_nonsymmetric(self):
        """非对称矩阵应选择 KRYLOVSCHUR"""
        props = MatrixProperties(
            is_symmetric=False,
            is_positive_definite=False,
            n_rows=100,
            density=0.01,
        )
        eps = select_eps_type(
            props, SpectralRange.LARGEST_MAGNITUDE,
            use_shift_invert=False,
            is_ill_conditioned=False,
        )
        self.assertEqual(eps, EPSType.KRYLOVSCHUR)

    def test_select_eps_type_ill_conditioned(self):
        """病态矩阵应选择 KRYLOVSCHUR（最稳定）"""
        props = MatrixProperties(
            is_symmetric=True,
            is_positive_definite=True,
            n_rows=100,
            density=0.01,
        )
        eps = select_eps_type(
            props, SpectralRange.SMALLEST_REAL,
            use_shift_invert=True,
            is_ill_conditioned=True,
        )
        self.assertEqual(eps, EPSType.KRYLOVSCHUR)

    def test_select_eps_type_large_nonsymmetric(self):
        """大规模非对称稀疏矩阵应选择 ARNOLDI"""
        props = MatrixProperties(
            is_symmetric=False,
            is_positive_definite=False,
            n_rows=20000,
            density=5e-5,
        )
        eps = select_eps_type(
            props, SpectralRange.LARGEST_MAGNITUDE,
            use_shift_invert=False,
            is_ill_conditioned=False,
        )
        self.assertEqual(eps, EPSType.ARNOLDI)

    def test_select_eps_type_shift_invert(self):
        """shift-invert 模式应选择 KRYLOVSCHUR"""
        props = MatrixProperties(
            is_symmetric=False,
            is_positive_definite=False,
            n_rows=100,
            density=0.01,
        )
        eps = select_eps_type(
            props, SpectralRange.TARGET_MAGNITUDE if hasattr(
                SpectralRange, 'TARGET_MAGNITUDE'
            ) else SpectralRange.SMALLEST_REAL,
            use_shift_invert=True,
            is_ill_conditioned=False,
        )
        self.assertEqual(eps, EPSType.KRYLOVSCHUR)

    def test_select_ksp_pc_symmetric_positive_definite(self):
        """对称正定 → CG + ICC"""
        props = MatrixProperties(
            is_symmetric=True,
            is_positive_definite=True,
        )
        ksp, pc = select_ksp_pc(props, False, True)
        self.assertEqual(ksp, KSPType.CG)
        self.assertEqual(pc, PCType.ICC)

    def test_select_ksp_pc_symmetric_positive_definite_ill(self):
        """对称正定病态 → CG + ILU"""
        props = MatrixProperties(
            is_symmetric=True,
            is_positive_definite=True,
        )
        ksp, pc = select_ksp_pc(props, True, True)
        self.assertEqual(ksp, KSPType.CG)
        self.assertEqual(pc, PCType.ILU)

    def test_select_ksp_pc_symmetric_indefinite(self):
        """对称不定 → MINRES + ILU"""
        props = MatrixProperties(
            is_symmetric=True,
            is_positive_definite=False,
        )
        ksp, pc = select_ksp_pc(props, False, True)
        self.assertEqual(ksp, KSPType.MINRES)
        self.assertEqual(pc, PCType.ILU)

    def test_select_ksp_pc_nonsymmetric(self):
        """非对称 → FGMRES + ILU"""
        props = MatrixProperties(
            is_symmetric=False,
            is_positive_definite=False,
        )
        ksp, pc = select_ksp_pc(props, False, True)
        self.assertEqual(ksp, KSPType.FGMRES)
        self.assertEqual(pc, PCType.ILU)

    def test_select_ksp_pc_no_shift_invert(self):
        """非 shift-invert → PREONLY + LU"""
        props = MatrixProperties(
            is_symmetric=True,
            is_positive_definite=True,
        )
        ksp, pc = select_ksp_pc(props, False, False)
        self.assertEqual(ksp, KSPType.PREONLY)
        self.assertEqual(pc, PCType.LU)


class TestSolverAutoSelect(unittest.TestCase):
    """求解器自动选择集成测试"""

    def test_auto_select_laplacian(self):
        """测试拉普拉斯矩阵自动选择 LANCZOS"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        n = 50
        A = generate_test_matrix(n)

        config = EigenSolverConfig(
            n_eigs=5,
            spectral_range=SpectralRange.LARGEST_MAGNITUDE,
            auto_select=True,
            eps_type=None,
        )
        solver = EigenSolver(comm=comm, config=config)
        eigenvalues, eigenvectors = solver.solve(A)

        if comm.Get_rank() == 0:
            print(f"\n拉普拉斯矩阵自动选择: EPS={solver.selected_eps_type.value}")
            self.assertEqual(solver.selected_eps_type, EPSType.LANCZOS)
            self.assertIsNotNone(solver.matrix_properties)
            self.assertTrue(solver.matrix_properties.is_symmetric)

    def test_auto_select_nonsymmetric(self):
        """测试非对称矩阵自动选择 KRYLOVSCHUR"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        n = 50
        A = generate_nonsymmetric_matrix(n)

        config = EigenSolverConfig(
            n_eigs=5,
            spectral_range=SpectralRange.LARGEST_MAGNITUDE,
            auto_select=True,
            eps_type=None,
        )
        solver = EigenSolver(comm=comm, config=config)
        eigenvalues, eigenvectors = solver.solve(A)

        if comm.Get_rank() == 0:
            print(f"\n非对称矩阵自动选择: EPS={solver.selected_eps_type.value}")
            self.assertEqual(solver.selected_eps_type, EPSType.KRYLOVSCHUR)
            self.assertFalse(solver.matrix_properties.is_symmetric)

    def test_manual_eps_type_override(self):
        """测试手动指定 EPS 类型覆盖自动选择"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        n = 50
        A = generate_test_matrix(n)

        config = EigenSolverConfig(
            n_eigs=5,
            spectral_range=SpectralRange.LARGEST_MAGNITUDE,
            auto_select=True,
            eps_type=EPSType.ARNOLDI,
        )
        solver = EigenSolver(comm=comm, config=config)
        solver._assess_matrix(A)

        if comm.Get_rank() == 0:
            self.assertEqual(solver.selected_eps_type, EPSType.ARNOLDI)

    def test_auto_select_disabled(self):
        """测试禁用自动选择"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        n = 50
        A = generate_test_matrix(n)

        config = EigenSolverConfig(
            n_eigs=5,
            spectral_range=SpectralRange.LARGEST_MAGNITUDE,
            auto_select=False,
            eps_type=EPSType.KRYLOVSCHUR,
        )
        solver = EigenSolver(comm=comm, config=config)
        solver._assess_matrix(A)

        if comm.Get_rank() == 0:
            self.assertEqual(solver.selected_eps_type, EPSType.KRYLOVSCHUR)


class TestEigenSolver(unittest.TestCase):
    """EigenSolver 基本功能测试"""

    def setUp(self):
        self.n = 50
        self.k = 10
        self.A = generate_test_matrix(self.n)

    def test_solver_creation(self):
        """测试求解器创建"""
        config = EigenSolverConfig(n_eigs=self.k)
        solver = EigenSolver(config=config)
        self.assertIsNotNone(solver)
        self.assertEqual(solver.config.n_eigs, self.k)

    def test_spectral_range_enum(self):
        """测试 SpectralRange 枚举"""
        self.assertEqual(
            SpectralRange.LARGEST_MAGNITUDE.value, "largest_magnitude"
        )
        self.assertEqual(
            SpectralRange.SMALLEST_REAL.value, "smallest_real"
        )

    def test_eps_type_enum(self):
        """测试 EPSType 枚举"""
        self.assertEqual(EPSType.LANCZOS.value, "lanczos")
        self.assertEqual(EPSType.ARNOLDI.value, "arnoldi")
        self.assertEqual(EPSType.KRYLOVSCHUR.value, "krylovschur")
        self.assertEqual(EPSType.JD.value, "jd")

    def test_config_post_init(self):
        """测试配置后处理"""
        config = EigenSolverConfig(
            n_eigs=5,
            spectral_range=SpectralRange.SMALLEST_MAGNITUDE,
        )
        self.assertEqual(config.which, "SM")

    def test_config_shift_invert(self):
        """测试移位反幂法配置"""
        config = EigenSolverConfig(
            n_eigs=5,
            use_shift_invert=True,
        )
        self.assertTrue(config.use_shift_invert)
        self.assertEqual(config.shift, 0.0)

    def test_eigen_result_creation(self):
        """测试 EigenResult 创建"""
        evals = np.array([1.0 + 0j, 2.0 + 0j])
        evecs = np.random.rand(5, 2) + 1j * np.random.rand(5, 2)
        result = EigenResult(
            eigenvalues=evals,
            eigenvectors=evecs,
            n_converged=2,
        )
        self.assertEqual(result.n_converged, 2)
        self.assertIsNotNone(result.metadata)

    def test_hdf5_save_load(self):
        """测试 HDF5 保存与加载"""
        import tempfile
        import os

        evals = np.array([1.0 + 0.1j, 2.0 - 0.2j, 3.0 + 0j])
        evecs = np.eye(10, 3) + 1j * np.zeros((10, 3))

        result = EigenResult(
            eigenvalues=evals,
            eigenvectors=evecs,
            n_converged=3,
            metadata={"test": "value", "n_eigs": 3},
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test_result.h5")

            save_to_hdf5(result, filepath)
            self.assertTrue(os.path.exists(filepath))

            loaded = load_from_hdf5(filepath)
            self.assertEqual(loaded.n_converged, 3)
            np.testing.assert_array_almost_equal(
                loaded.eigenvalues, evals
            )
            np.testing.assert_array_almost_equal(
                loaded.eigenvectors, evecs
            )
            self.assertEqual(loaded.metadata.get("test"), "value")

    def test_solver_solve_largest(self):
        """测试求解最大模特征值"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        config = EigenSolverConfig(
            n_eigs=self.k,
            spectral_range=SpectralRange.LARGEST_MAGNITUDE,
        )
        solver = EigenSolver(comm=comm, config=config)
        eigenvalues, eigenvectors = solver.solve(self.A)

        self.assertEqual(len(eigenvalues), self.k)
        self.assertEqual(eigenvectors.shape, (self.n, self.k))

        if comm.Get_rank() == 0:
            print(f"\n最大模特征值 (前 5 个):")
            for i in range(min(5, len(eigenvalues))):
                print(f"  λ[{i}] = {eigenvalues[i].real:.6f}")

    def test_solver_shift_invert(self):
        """测试移位反幂法"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        config = EigenSolverConfig(
            n_eigs=self.k,
            spectral_range=SpectralRange.SMALLEST_REAL,
            use_shift_invert=True,
            shift=0.0,
        )
        solver = EigenSolver(comm=comm, config=config)
        eigenvalues, eigenvectors = solver.solve(self.A)

        self.assertGreater(len(eigenvalues), 0)

        if comm.Get_rank() == 0:
            print(f"\n移位反幂法特征值 (shift=0, 前 5 个):")
            for i in range(min(5, len(eigenvalues))):
                print(f"  λ[{i}] = {eigenvalues[i].real:.6f}")

    def test_solve_with_shift_invert_method(self):
        """测试 solve_with_shift_invert 便捷方法"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        config = EigenSolverConfig(n_eigs=self.k)
        solver = EigenSolver(comm=comm, config=config)
        eigenvalues, eigenvectors = solver.solve_with_shift_invert(
            self.A, shift=0.0
        )

        self.assertGreater(len(eigenvalues), 0)
        self.assertEqual(eigenvectors.shape[0], self.n)


class TestNearSingularSolving(unittest.TestCase):
    """接近奇异矩阵求解测试"""

    def test_near_singular_detection(self):
        """测试接近奇异矩阵的检测"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        n = 50
        A = generate_near_singular_matrix(n, epsilon=1e-16)

        config = EigenSolverConfig(
            n_eigs=5,
            use_shift_invert=True,
            shift=0.0,
        )
        solver = EigenSolver(comm=comm, config=config)
        solver._assess_matrix(A)

        if comm.Get_rank() == 0:
            print(f"\n接近奇异检测: cond={solver.condition_number_estimate:.2e}, "
                  f"is_ill={solver.is_ill_conditioned}")
        self.assertTrue(solver.is_ill_conditioned)

    def test_robust_config_defaults(self):
        """测试鲁棒配置默认值"""
        rc = RobustConfig()
        self.assertEqual(rc.condition_number_threshold, 1e10)
        self.assertTrue(rc.use_iterative_solver)
        self.assertEqual(rc.ksp_type, KSPType.FGMRES)
        self.assertEqual(rc.pc_type, PCType.ILU)
        self.assertAlmostEqual(rc.ilu_fill_factor, 20.0)
        self.assertAlmostEqual(rc.regularization_epsilon, 1e-12)
        self.assertTrue(rc.enable_regularization)

    def test_solve_near_singular_diagonal(self):
        """测试求解接近奇异的对角矩阵"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        n = 50
        epsilon = 1e-15
        A = generate_near_singular_matrix(n, epsilon=epsilon)

        if comm.Get_rank() == 0:
            print(f"\n测试接近奇异对角矩阵 (epsilon={epsilon:.0e}, n={n})")

        solver = EigenSolver(comm=comm)
        eigenvalues, eigenvectors = solver.solve_near_singular(
            A, shift=0.0, n_eigs=5
        )

        self.assertGreater(len(eigenvalues), 0)

        if comm.Get_rank() == 0:
            sorted_evals = np.sort(np.abs(eigenvalues))
            print(f"  收敛特征值 (按模排序): {sorted_evals}")

    def test_ksp_pc_enums(self):
        """测试 KSP/PC 枚举值"""
        self.assertEqual(KSPType.FGMRES.value, "fgmres")
        self.assertEqual(KSPType.GMRES.value, "gmres")
        self.assertEqual(KSPType.MINRES.value, "minres")
        self.assertEqual(KSPType.CG.value, "cg")
        self.assertEqual(PCType.ILU.value, "ilu")
        self.assertEqual(PCType.LU.value, "lu")
        self.assertEqual(PCType.ICC.value, "icc")
        self.assertEqual(STType.SINVERT.value, "sinvert")
        self.assertEqual(STType.SHIFT.value, "shift")


class TestSolverProperties(unittest.TestCase):
    """求解器属性测试"""

    def test_iteration_log(self):
        """测试迭代日志记录"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        config = EigenSolverConfig(n_eigs=5)
        solver = EigenSolver(comm=comm, config=config)
        solver.solve(self.A)

        if comm.Get_rank() == 0:
            self.assertGreater(len(solver._iteration_log), 0)
            print(f"\n迭代日志长度: {len(solver._iteration_log)}")

    def test_matrix_properties_after_solve(self):
        """测试求解后矩阵属性可用"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        config = EigenSolverConfig(n_eigs=5)
        solver = EigenSolver(comm=comm, config=config)
        solver.solve(self.A)

        self.assertIsNotNone(solver.matrix_properties)
        self.assertIsNotNone(solver.selected_eps_type)
        self.assertIsNotNone(solver.selected_ksp_type)
        self.assertIsNotNone(solver.selected_pc_type)

    def test_cond_est_after_solve(self):
        """测试求解后的条件数估计可用"""
        from mpi4py import MPI

        comm = MPI.COMM_WORLD
        config = EigenSolverConfig(n_eigs=5)
        solver = EigenSolver(comm=comm, config=config)
        solver.solve(self.A)

        self.assertIsNotNone(solver.condition_number_estimate)
        self.assertFalse(solver.is_ill_conditioned)


def run_tests():
    """运行测试"""
    from mpi4py import MPI

    comm = MPI.COMM_WORLD
    rank = comm.Get_rank()

    if rank == 0:
        print("=" * 60)
        print("Eigenvalue Solver 测试（含自动求解器选择）")
        print(f"MPI 进程数: {comm.Get_size()}")
        print("=" * 60)
        print()

    unittest.main(verbosity=2, exit=False)


if __name__ == "__main__":
    run_tests()

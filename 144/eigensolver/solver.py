"""
Core Eigenvalue Solver Module
=============================
封装 PETSc + SLEPc 的稀疏矩阵特征值求解器。
支持：
- CSR 格式稀疏矩阵 (scipy.sparse.csr_matrix)
- 前 k 个最大/最小特征值
- 移位反幂法 (Shift-Invert)
- 接近奇异矩阵的鲁棒处理（条件数感知 + 迭代求解器 + 自适应预处理）
- 自动选择求解器（根据对称性/正定性选择 Lanczos/Arnoldi/Krylov-Schur）
- MPI 并行
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class SpectralRange(Enum):
    """特征值选择范围"""
    LARGEST_MAGNITUDE = "largest_magnitude"
    SMALLEST_MAGNITUDE = "smallest_magnitude"
    LARGEST_REAL = "largest_real"
    SMALLEST_REAL = "smallest_real"
    LARGEST_IMAG = "largest_imaginary"
    SMALLEST_IMAG = "smallest_imaginary"


class KSPType(Enum):
    """KSP 求解器类型"""
    PREONLY = "preonly"
    GMRES = "gmres"
    FGMRES = "fgmres"
    CG = "cg"
    MINRES = "minres"
    BCGS = "bcgs"
    TFQMR = "tfqmr"


class PCType(Enum):
    """预处理类型"""
    NONE = "none"
    ILU = "ilu"
    LU = "lu"
    JACOBI = "jacobi"
    BJACOBI = "bjacobi"
    SOR = "sor"
    ICC = "icc"
    HYPRE = "hypre"
    GAMG = "gamg"


class STType(Enum):
    """谱变换类型"""
    SHIFT = "shift"
    SINVERT = "sinvert"
    CAYLEY = "cayley"
    FOLD = "fold"


class EPSType(Enum):
    """SLEPc 特征值求解器类型"""
    KRYLOVSCHUR = "krylovschur"
    LANCZOS = "lanczos"
    ARNOLDI = "arnoldi"
    JD = "jd"
    POWER = "power"
    SUBSPACE = "subspace"
    ARPACK = "arpack"


@dataclass
class MatrixProperties:
    """矩阵性质检测结果"""
    is_symmetric: bool = False
    symmetry_violation: float = 0.0
    is_positive_definite: Optional[bool] = None
    min_diagonal: float = 0.0
    max_diagonal: float = 0.0
    has_negative_diagonal: bool = False
    n_rows: int = 0
    nnz: int = 0
    density: float = 0.0
    is_complex: bool = False


@dataclass
class RobustConfig:
    """
    鲁棒性配置（针对接近奇异/病态矩阵）

    Attributes
    ----------
    condition_number_threshold : float
        条件数估计超过此值时启用鲁棒策略
    use_iterative_solver : bool
        是否使用迭代求解器（vs 直接法）
    ksp_type : KSPType
        KSP 求解器类型
    pc_type : PCType
        预处理类型
    ilu_fill_factor : float
        ILU 填充因子
    ilu_drop_tolerance : float
        ILU 丢弃容差
    regularization_epsilon : float
        正则化 ε 值（添加到对角线）
    enable_regularization : bool
        是否启用自动正则化
    max_ksp_iter : int
        内部 KSP 最大迭代次数
    inner_tol_ratio : float
        内部 KSP 容差与外部 EPS 容差的比值
    stagnation_window : int
        停滞检测窗口大小
    stagnation_threshold : float
        停滞检测阈值（残差变化率）
    """
    condition_number_threshold: float = 1e10
    use_iterative_solver: bool = True
    ksp_type: KSPType = KSPType.FGMRES
    pc_type: PCType = PCType.ILU
    ilu_fill_factor: float = 20.0
    ilu_drop_tolerance: float = 1e-5
    regularization_epsilon: float = 1e-12
    enable_regularization: bool = True
    max_ksp_iter: int = 2000
    inner_tol_ratio: float = 1e-3
    stagnation_window: int = 20
    stagnation_threshold: float = 1e-4


@dataclass
class EigenSolverConfig:
    """
    求解器配置

    Attributes
    ----------
    n_eigs : int
        求解特征值个数
    spectral_range : SpectralRange
        特征值选择范围
    shift : float or None
        移位值
    use_shift_invert : bool
        是否使用移位反幂法
    st_type : STType
        谱变换类型
    eps_type : EPSType or None
        EPS 求解器类型，None 表示自动选择
    auto_select : bool
        是否根据矩阵性质自动选择求解器
    tol : float
        收敛容差
    max_iter : int
        最大迭代次数
    which : str
        SLEPc 内部 which 标识（自动生成）
    robust : RobustConfig
        鲁棒性配置
    """
    n_eigs: int = 10
    spectral_range: SpectralRange = SpectralRange.LARGEST_MAGNITUDE
    shift: Optional[float] = None
    use_shift_invert: bool = False
    st_type: STType = STType.SINVERT
    eps_type: Optional[EPSType] = None
    auto_select: bool = True
    tol: float = 1e-8
    max_iter: int = 1000
    which: str = "LM"
    robust: RobustConfig = field(default_factory=RobustConfig)

    def __post_init__(self):
        range_map = {
            SpectralRange.LARGEST_MAGNITUDE: "LM",
            SpectralRange.SMALLEST_MAGNITUDE: "SM",
            SpectralRange.LARGEST_REAL: "LR",
            SpectralRange.SMALLEST_REAL: "SR",
            SpectralRange.LARGEST_IMAG: "LI",
            SpectralRange.SMALLEST_IMAG: "SI",
        }
        self.which = range_map.get(self.spectral_range, self.which)
        if self.use_shift_invert and self.shift is None:
            self.shift = 0.0


def check_symmetry(csr_mat, tol: float = 1e-10) -> Tuple[bool, float]:
    """
    检查稀疏矩阵是否对称

    通过比较 A 与 A.T 的差的范数判断。

    Parameters
    ----------
    csr_mat : scipy.sparse.csr_matrix
    tol : float
        对称性容差

    Returns
    -------
    is_symmetric : bool
    violation : float
        ||A - A^T||_F / ||A||_F 的比值
    """
    from scipy.sparse import isspmatrix
    from scipy.sparse.linalg import norm as sparse_norm

    if not isspmatrix(csr_mat):
        raise ValueError("输入必须是 scipy 稀疏矩阵")

    A = csr_mat
    AT = A.T

    diff_norm = sparse_norm(A - AT, ord='fro')
    A_norm = sparse_norm(A, ord='fro')

    if A_norm == 0:
        return True, 0.0

    violation = diff_norm / A_norm
    return violation < tol, violation


def check_positive_definite_quick(csr_mat) -> Optional[bool]:
    """
    快速正定性检查（基于对角元素和 Gershgorin 圆盘）

    对于稀疏大规模矩阵，避免完整 Cholesky 分解。
    使用充分条件：若所有对角元素 > 0 且严格对角占优则正定。

    Parameters
    ----------
    csr_mat : scipy.sparse.csr_matrix

    Returns
    -------
    bool or None
        True = 正定, False = 非正定, None = 无法判断
    """
    diag = csr_mat.diagonal()
    n = csr_mat.shape[0]

    if np.any(diag <= 0):
        return False

    abs_A = abs(csr_mat)
    row_sums = np.array(abs_A.sum(axis=1)).flatten()
    off_diag_sums = row_sums - np.abs(diag)

    if np.all(diag > off_diag_sums):
        return True

    if np.all(diag > 0):
        min_diag = np.min(diag)
        if min_diag > 0:
            return None

    return None


def detect_matrix_properties(csr_mat) -> MatrixProperties:
    """
    检测矩阵的关键性质

    Parameters
    ----------
    csr_mat : scipy.sparse.csr_matrix

    Returns
    -------
    MatrixProperties
    """
    from scipy.sparse import isspmatrix

    if not isspmatrix(csr_mat):
        raise ValueError("输入必须是 scipy 稀疏矩阵")

    n = csr_mat.shape[0]
    nnz = csr_mat.nnz
    density = nnz / (n * n) if n > 0 else 0.0

    is_sym, sym_viol = check_symmetry(csr_mat)

    diag = csr_mat.diagonal()
    is_complex = np.iscomplexobj(csr_mat.data)
    min_diag = float(np.min(diag.real)) if is_complex else float(np.min(diag))
    max_diag = float(np.max(diag.real)) if is_complex else float(np.max(diag))
    has_neg = bool(np.any(diag.real < 0)) if is_complex else bool(np.any(diag < 0))

    is_pd = check_positive_definite_quick(csr_mat) if is_sym else False

    return MatrixProperties(
        is_symmetric=is_sym,
        symmetry_violation=sym_viol,
        is_positive_definite=is_pd,
        min_diagonal=min_diag,
        max_diagonal=max_diag,
        has_negative_diagonal=has_neg,
        n_rows=n,
        nnz=nnz,
        density=density,
        is_complex=is_complex,
    )


def select_eps_type(
    props: MatrixProperties,
    spectral_range: SpectralRange,
    use_shift_invert: bool,
    is_ill_conditioned: bool,
) -> EPSType:
    """
    根据矩阵性质和求解目标自动选择 EPS 类型

    策略：
    - 对称/Hermitian → LANCZOS（利用短递推，节省内存和时间）
    - 非对称 + 大规模 → ARNOLDI 或 KRYLOVSCHUR
    - 内部特征值（shift-invert 且 shift 不在极值）→ KRYLOVSCHUR（鲁棒）
    - 病态矩阵 → KRYLOVSCHUR（最稳定）

    Parameters
    ----------
    props : MatrixProperties
    spectral_range : SpectralRange
    use_shift_invert : bool
    is_ill_conditioned : bool

    Returns
    -------
    EPSType
    """
    if is_ill_conditioned:
        return EPSType.KRYLOVSCHUR

    if props.is_symmetric:
        return EPSType.LANCZOS

    if use_shift_invert:
        return EPSType.KRYLOVSCHUR

    if props.n_rows > 10000 or props.density < 1e-4:
        return EPSType.ARNOLDI

    return EPSType.KRYLOVSCHUR


def select_ksp_pc(
    props: MatrixProperties,
    is_ill_conditioned: bool,
    use_shift_invert: bool,
) -> Tuple[KSPType, PCType]:
    """
    根据矩阵性质自动选择 KSP 求解器和预处理

    策略：
    - 对称正定 → CG + ICC（或 CG + ILU 作为回退）
    - 对称不定 → MINRES + ILU
    - 非对称 → FGMRES + ILU（默认稳健选择）
    - 非 shift-invert 时不需要 KSP

    Parameters
    ----------
    props : MatrixProperties
    is_ill_conditioned : bool
    use_shift_invert : bool

    Returns
    -------
    (KSPType, PCType)
    """
    if not use_shift_invert:
        return KSPType.PREONLY, PCType.LU

    if props.is_symmetric:
        if props.is_positive_definite:
            if is_ill_conditioned:
                return KSPType.CG, PCType.ILU
            else:
                return KSPType.CG, PCType.ICC
        else:
            return KSPType.MINRES, PCType.ILU

    if is_ill_conditioned:
        return KSPType.FGMRES, PCType.ILU

    return KSPType.FGMRES, PCType.ILU


def estimate_condition_number(csr_mat) -> float:
    """
    估计稀疏矩阵的条件数（基于谱半径和最小奇异值估计）

    使用 Gershgorin 圆盘定理估计上界，结合对角线元素估计下界。
    对于大规模矩阵，避免完整的 SVD。

    Parameters
    ----------
    csr_mat : scipy.sparse.csr_matrix
        稀疏矩阵

    Returns
    -------
    float
        条件数估计值
    """
    from scipy.sparse import isspmatrix

    if not isspmatrix(csr_mat):
        raise ValueError("输入必须是 scipy 稀疏矩阵")

    diag = np.abs(csr_mat.diagonal())

    row_sums = np.array(np.abs(csr_mat).sum(axis=1)).flatten()

    max_row_sum = np.max(row_sums)
    min_diag = np.min(diag) if np.min(diag) > 0 else 1e-300

    if min_diag > 0:
        cond_est = max_row_sum / min_diag
    else:
        try:
            from scipy.sparse.linalg import svds
            s_max = svds(csr_mat.astype(float), k=1, which='LM',
                        return_singular_vectors=False, tol=1e-2)[0]
            try:
                s_min = svds(csr_mat.astype(float), k=1, which='SM',
                            return_singular_vectors=False, tol=1e-2)[0]
                cond_est = abs(s_max) / max(abs(s_min), 1e-300)
            except Exception:
                cond_est = float('inf')
        except Exception:
            cond_est = float('inf')

    return cond_est


def _apply_regularization(csr_mat, epsilon: float):
    """
    对稀疏矩阵添加微小对角正则化：A + ε * I

    Parameters
    ----------
    csr_mat : scipy.sparse.csr_matrix
    epsilon : float

    Returns
    -------
    scipy.sparse.csr_matrix
    """
    from scipy.sparse import eye

    n = csr_mat.shape[0]
    reg = epsilon * eye(n, format='csr')
    return (csr_mat + reg).tocsr()


class EigenSolver:
    """
    稀疏矩阵特征值求解器（基于 PETSc/SLEPc），支持接近奇异矩阵的鲁棒处理
    和自动求解器选择。

    Parameters
    ----------
    comm : mpi4py.MPI.Comm, optional
        MPI 通信器，默认使用 COMM_WORLD
    config : EigenSolverConfig, optional
        求解器配置

    Examples
    --------
    >>> from scipy.sparse import diags
    >>> import numpy as np
    >>> n = 100
    >>> A = diags([-1, 2, -1], [-1, 0, 1], shape=(n, n), format="csr")
    >>> solver = EigenSolver()
    >>> eigenvalues, eigenvectors = solver.solve(A)
    """

    def __init__(self, comm=None, config: EigenSolverConfig = None):
        from mpi4py import MPI

        self.comm = comm if comm is not None else MPI.COMM_WORLD
        self.rank = self.comm.Get_rank()
        self.size = self.comm.Get_size()
        self.config = config if config is not None else EigenSolverConfig()
        self._cond_est: Optional[float] = None
        self._is_ill_conditioned: bool = False
        self._iteration_log: list = []
        self._matrix_props: Optional[MatrixProperties] = None
        self._selected_eps_type: Optional[EPSType] = None
        self._selected_ksp_type: Optional[KSPType] = None
        self._selected_pc_type: Optional[PCType] = None

    @property
    def condition_number_estimate(self) -> Optional[float]:
        return self._cond_est

    @property
    def is_ill_conditioned(self) -> bool:
        return self._is_ill_conditioned

    @property
    def matrix_properties(self) -> Optional[MatrixProperties]:
        return self._matrix_props

    @property
    def selected_eps_type(self) -> Optional[EPSType]:
        return self._selected_eps_type

    @property
    def selected_ksp_type(self) -> Optional[KSPType]:
        return self._selected_ksp_type

    @property
    def selected_pc_type(self) -> Optional[PCType]:
        return self._selected_pc_type

    def _create_petsc_matrix(self, csr_mat):
        """将 scipy CSR 矩阵转换为 PETSc Mat（支持并行分布）"""
        try:
            from petsc4py import PETSc
        except ImportError:
            raise ImportError(
                "请先安装 petsc4py: pip install petsc4py"
            )

        n_rows, n_cols = csr_mat.shape

        local_rows = self._distribute_rows(n_rows)
        row_start, row_end = local_rows

        A = PETSc.Mat().createAIJ(
            size=(n_rows, n_cols),
            bsize=1,
            comm=self.comm,
        )
        A.setPreallocationNNZ(
            (
                csr_mat.indptr[row_end] - csr_mat.indptr[row_start],
                0,
            )
        )

        for global_row in range(row_start, row_end):
            row_start_idx = csr_mat.indptr[global_row]
            row_end_idx = csr_mat.indptr[global_row + 1]
            cols = csr_mat.indices[row_start_idx:row_end_idx]
            vals = csr_mat.data[row_start_idx:row_end_idx]
            if len(cols) > 0:
                A.setValues([global_row], cols, vals, addv=False)

        A.assemblyBegin()
        A.assemblyEnd()
        return A

    def _distribute_rows(self, n_rows: int) -> Tuple[int, int]:
        """将行分布到各 MPI 进程"""
        base = n_rows // self.size
        remainder = n_rows % self.size
        if self.rank < remainder:
            n_local = base + 1
            row_start = self.rank * (base + 1)
        else:
            n_local = base
            row_start = remainder * (base + 1) + (self.rank - remainder) * base
        row_end = row_start + n_local
        return row_start, row_end

    def _assess_matrix(self, csr_mat) -> MatrixProperties:
        """
        综合评估矩阵：检测性质 + 估计条件数 + 自动选择求解器

        Returns
        -------
        MatrixProperties
        """
        if self.rank == 0:
            logger.info("检测矩阵性质...")

        props = detect_matrix_properties(csr_mat)
        self._matrix_props = props

        if self.rank == 0:
            sym_status = "对称" if props.is_symmetric else (
                f"非对称 (偏差={props.symmetry_violation:.1e})"
            )
            pd_status = {
                True: "正定",
                False: "非正定",
                None: "无法快速判断",
            }[props.is_positive_definite]
            logger.info(
                f"  维度: {props.n_rows}, "
                f"NNZ: {props.nnz}, "
                f"密度: {props.density:.2e}"
            )
            logger.info(f"  {sym_status}")
            logger.info(f"  正定性: {pd_status}")
            logger.info(
                f"  对角范围: [{props.min_diagonal:.2e}, "
                f"{props.max_diagonal:.2e}]"
            )
            if props.has_negative_diagonal:
                logger.info("  存在负对角元素")

        if self.rank == 0:
            logger.info("估计条件数...")
        cond_est = estimate_condition_number(csr_mat)
        self._cond_est = cond_est

        threshold = self.config.robust.condition_number_threshold
        self._is_ill_conditioned = cond_est > threshold

        if self.rank == 0:
            logger.info(f"  条件数估计: {cond_est:.2e}")
            if self._is_ill_conditioned:
                logger.warning(
                    f"  矩阵接近奇异或病态 (cond > {threshold:.0e})，"
                    f"启用鲁棒求解策略"
                )

        if self.config.auto_select and self.config.eps_type is None:
            self._selected_eps_type = select_eps_type(
                props, self.config.spectral_range,
                self.config.use_shift_invert,
                self._is_ill_conditioned,
            )
            self._selected_ksp_type, self._selected_pc_type = select_ksp_pc(
                props, self._is_ill_conditioned,
                self.config.use_shift_invert,
            )
            if self.rank == 0:
                logger.info(
                    f"  自动选择: EPS={self._selected_eps_type.value}, "
                    f"KSP={self._selected_ksp_type.value}, "
                    f"PC={self._selected_pc_type.value}"
                )
        elif self.config.eps_type is not None:
            self._selected_eps_type = self.config.eps_type
            self._selected_ksp_type = self.config.robust.ksp_type
            self._selected_pc_type = self.config.robust.pc_type
            if self.rank == 0:
                logger.info(
                    f"  手动配置: EPS={self._selected_eps_type.value}, "
                    f"KSP={self._selected_ksp_type.value}, "
                    f"PC={self._selected_pc_type.value}"
                )

        return props

    def _setup_slepc_solver(self, A):
        """配置 SLEPc 特征值求解器（含自动选择 + 鲁棒策略）"""
        try:
            from slepc4py import SLEPc
            from petsc4py import PETSc
        except ImportError:
            raise ImportError(
                "请先安装 petsc4py 和 slepc4py: pip install petsc4py slepc4py"
            )

        robust = self.config.robust
        n = A.getSize()[0]

        E = SLEPc.EPS().create(comm=self.comm)
        E.setOperators(A)
        E.setDimensions(nev=self.config.n_eigs)

        eps_type_str = (self._selected_eps_type or EPSType.KRYLOVSCHUR).value
        try:
            E.setType(eps_type_str)
        except Exception:
            E.setType("krylovschur")

        outer_tol = self.config.tol
        if self._is_ill_conditioned:
            outer_tol = max(outer_tol, 1e-6)
            if self.rank == 0:
                logger.warning(
                    f"病态矩阵检测：调整外部容差至 {outer_tol:.0e}"
                )

        E.setTolerances(tol=outer_tol, max_it=self.config.max_iter)

        which_map = {
            "LM": SLEPc.EPS.Which.LARGEST_MAGNITUDE,
            "SM": SLEPc.EPS.Which.SMALLEST_MAGNITUDE,
            "LR": SLEPc.EPS.Which.LARGEST_REAL,
            "SR": SLEPc.EPS.Which.SMALLEST_REAL,
            "LI": SLEPc.EPS.Which.LARGEST_IMAGINARY,
            "SI": SLEPc.EPS.Which.SMALLEST_IMAGINARY,
        }
        E.setWhichEigenpairs(which_map.get(
            self.config.which, SLEPc.EPS.Which.LARGEST_MAGNITUDE
        ))

        if self.config.use_shift_invert and self.config.shift is not None:
            if (self._matrix_props is not None
                    and self._matrix_props.is_symmetric):
                E.setProblemType(SLEPc.EPS.ProblemType.HEP)
            else:
                E.setProblemType(SLEPc.EPS.ProblemType.NHEP)

            st = E.getST()

            if self._is_ill_conditioned and self.config.st_type == STType.SHIFT:
                st.setType(SLEPc.ST.Type.SHIFT)
                if self.rank == 0:
                    logger.info("使用 SHIFT 谱变换（更稳定但收敛较慢）")
            else:
                st.setType(SLEPc.ST.Type.SINVERT)

            st.setShift(self.config.shift)

            ksp = st.getKSP()

            ksp_type_str = (self._selected_ksp_type or KSPType.PREONLY).value
            pc_type_str = (self._selected_pc_type or PCType.LU).value

            if self._is_ill_conditioned and robust.use_iterative_solver:
                ksp.setType(ksp_type_str)

                inner_tol = max(outer_tol * robust.inner_tol_ratio, 1e-10)
                ksp.setTolerances(
                    rtol=inner_tol,
                    atol=inner_tol,
                    max_it=robust.max_ksp_iter,
                )

                pc = ksp.getPC()

                if pc_type_str == "ilu":
                    pc.setType("ilu")
                    try:
                        pc.setFactorLevels(int(robust.ilu_fill_factor))
                    except Exception:
                        pass
                    opts = PETSc.Options()
                    opts["-pc_factor_fill"] = robust.ilu_fill_factor
                    opts["-pc_factor_drop_tolerance"] = robust.ilu_drop_tolerance
                elif pc_type_str == "icc":
                    pc.setType("icc")
                    try:
                        pc.setFactorLevels(int(robust.ilu_fill_factor))
                    except Exception:
                        pass
                elif pc_type_str == "lu":
                    pc.setType("lu")
                    if hasattr(pc, 'setFactorSolverType'):
                        try:
                            pc.setFactorSolverType("mumps")
                        except Exception:
                            pass
                elif pc_type_str == "hypre":
                    pc.setType("hypre")
                elif pc_type_str == "gamg":
                    pc.setType("gamg")
                elif pc_type_str == "jacobi":
                    pc.setType("jacobi")
                elif pc_type_str == "bjacobi":
                    pc.setType("bjacobi")
                else:
                    pc.setType("ilu")

                if self.rank == 0:
                    logger.info(
                        f"鲁棒配置: KSP={ksp_type_str}, "
                        f"PC={pc_type_str}, inner_tol={inner_tol:.0e}"
                    )
            else:
                ksp.setType("preonly")
                pc = ksp.getPC()
                pc.setType("lu")
                if hasattr(pc, 'setFactorSolverType'):
                    try:
                        pc.setFactorSolverType("mumps")
                    except Exception:
                        pass

            E.setWhichEigenpairs(SLEPc.EPS.Which.TARGET_MAGNITUDE)
            E.setTarget(self.config.shift)

        E.setFromOptions()
        return E

    def _monitor_convergence(self, eps, its, n_conv, ctx):
        """SLEPc 收敛监控回调"""
        if its % 10 == 0 or n_conv >= self.config.n_eigs:
            if self.rank == 0:
                logger.info(f"  迭代 {its}: 收敛 {n_conv}/{self.config.n_eigs}")

        self._iteration_log.append((its, n_conv))

        window = self.config.robust.stagnation_window

        if len(self._iteration_log) >= window:
            recent = self._iteration_log[-window:]
            if all(n == recent[0][1] for _, n in recent):
                if n_conv < self.config.n_eigs and its >= 50:
                    if self.rank == 0:
                        logger.warning(
                            f"检测到收敛停滞（{window} 次迭代无进展）"
                        )

    def solve(self, csr_mat):
        """
        求解特征值问题

        Parameters
        ----------
        csr_mat : scipy.sparse.csr_matrix
            CSR 格式稀疏矩阵

        Returns
        -------
        eigenvalues : numpy.ndarray
            计算得到的特征值
        eigenvectors : numpy.ndarray
            计算得到的特征向量（列向量）
        """
        import numpy as np
        from petsc4py import PETSc

        self._iteration_log = []

        n = csr_mat.shape[0]

        self._assess_matrix(csr_mat)

        mat_for_solve = csr_mat
        if (self._is_ill_conditioned
                and self.config.robust.enable_regularization
                and self.config.use_shift_invert):
            epsilon = self.config.robust.regularization_epsilon
            if self.rank == 0:
                logger.info(
                    f"应用对角正则化: A + {epsilon:.0e} * I"
                )
            mat_for_solve = _apply_regularization(csr_mat, epsilon)

        A = self._create_petsc_matrix(mat_for_solve)

        if self.rank == 0:
            eps_info = (
                f", eps={self._selected_eps_type.value}"
                if self._selected_eps_type else ""
            )
            logger.info(
                f"开始求解: n={n}, n_eigs={self.config.n_eigs}, "
                f"which={self.config.which}, "
                f"shift_invert={self.config.use_shift_invert}"
                + (f", shift={self.config.shift}"
                   if self.config.shift is not None else "")
                + eps_info
            )

        E = self._setup_slepc_solver(A)

        try:
            E.setMonitor(self._monitor_convergence)
        except Exception:
            pass

        if self.rank == 0:
            logger.info("正在求解特征值问题...")

        try:
            E.solve()
        except Exception as e:
            if self.rank == 0:
                logger.error(f"SLEPc 求解异常: {e}")
            E.destroy()
            A.destroy()
            raise

        n_conv = E.getConverged()
        if self.rank == 0:
            logger.info(f"收敛特征值个数: {n_conv}/{self.config.n_eigs}")
            if n_conv < self.config.n_eigs:
                logger.warning(
                    f"仅收敛 {n_conv} 个特征值，"
                    f"少于请求的 {self.config.n_eigs} 个"
                )

        eigenvalues = np.zeros(n_conv, dtype=np.complex128)
        eigenvectors = np.zeros((n, n_conv), dtype=np.complex128)

        vr, vi = A.getVecs()

        for i in range(n_conv):
            kappa = E.getEigenvalue(i)
            eigenvalues[i] = kappa
            E.getEigenvector(i, vr, vi)
            eigenvectors[:, i] = vr.getArray() + 1j * vi.getArray()

        if (self._is_ill_conditioned
                and self.config.robust.enable_regularization
                and self.config.use_shift_invert):
            epsilon = self.config.robust.regularization_epsilon
            eigenvalues -= epsilon
            if self.rank == 0:
                logger.info(
                    f"修正特征值（减去正则化 {epsilon:.0e}）"
                )

        E.destroy()
        A.destroy()

        if self.rank == 0:
            logger.info(f"特征值求解完成，共 {n_conv} 个收敛特征值")

        return eigenvalues, eigenvectors

    def solve_with_shift_invert(self, csr_mat, shift: float = 0.0):
        """
        使用移位反幂法求解特征值问题

        Parameters
        ----------
        csr_mat : scipy.sparse.csr_matrix
            CSR 格式稀疏矩阵
        shift : float
            移位值

        Returns
        -------
        eigenvalues : numpy.ndarray
            计算得到的特征值
        eigenvectors : numpy.ndarray
            计算得到的特征向量
        """
        self.config.use_shift_invert = True
        self.config.shift = shift
        return self.solve(csr_mat)

    def solve_near_singular(self, csr_mat, shift: float = 0.0,
                            n_eigs: int = 10):
        """
        专门针对接近奇异矩阵的求解接口

        自动启用鲁棒策略，适合条件数 >1e10 的矩阵。
        同时根据矩阵对称性自动选择 Lanczos/Arnoldi。

        Parameters
        ----------
        csr_mat : scipy.sparse.csr_matrix
            CSR 格式稀疏矩阵
        shift : float
            移位值（默认 0，求解接近 0 的特征值）
        n_eigs : int
            所需特征值个数

        Returns
        -------
        eigenvalues : numpy.ndarray
        eigenvectors : numpy.ndarray
        """
        self.config.n_eigs = n_eigs
        self.config.use_shift_invert = True
        self.config.shift = shift
        self.config.spectral_range = SpectralRange.SMALLEST_REAL
        self.config.auto_select = True
        self.config.robust.use_iterative_solver = True
        self.config.robust.ilu_fill_factor = 30.0
        self.config.robust.enable_regularization = True
        self.config.robust.max_ksp_iter = 3000
        self.config.tol = max(self.config.tol, 1e-6)
        self.config.max_iter = max(self.config.max_iter, 2000)

        return self.solve(csr_mat)

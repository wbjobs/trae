"""
HDF5 I/O and Visualization Utilities
=====================================
特征值求解结果的 HDF5 存储与可视化辅助模块。
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EigenResult:
    """
    特征值求解结果容器

    Attributes
    ----------
    eigenvalues : numpy.ndarray
        特征值数组
    eigenvectors : numpy.ndarray
        特征向量矩阵（列向量）
    n_converged : int
        收敛的特征值个数
    residual_norms : numpy.ndarray, optional
        残差范数数组
    metadata : dict
        求解元数据（配置、时间戳等）
    """
    eigenvalues: np.ndarray
    eigenvectors: np.ndarray
    n_converged: int
    residual_norms: Optional[np.ndarray] = None
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.residual_norms is None:
            self.residual_norms = np.full(self.n_converged, np.nan)


def save_to_hdf5(
    result: EigenResult,
    filepath: str,
    matrix: Optional[object] = None,
    overwrite: bool = True,
) -> None:
    """
    将特征值求解结果保存到 HDF5 文件

    Parameters
    ----------
    result : EigenResult
        特征值求解结果
    filepath : str
        输出 HDF5 文件路径
    matrix : scipy.sparse.csr_matrix, optional
        原始稀疏矩阵（可选保存）
    overwrite : bool
        是否覆盖已存在的文件

    Raises
    ------
    FileExistsError
        如果文件已存在且 overwrite=False
    """
    import os
    try:
        import h5py
    except ImportError:
        raise ImportError("请先安装 h5py: pip install h5py")

    if os.path.exists(filepath) and not overwrite:
        raise FileExistsError(f"文件已存在: {filepath}")

    with h5py.File(filepath, "w") as f:
        eig_grp = f.create_group("eigenvalues")
        eig_grp.create_dataset("real", data=np.real(result.eigenvalues))
        eig_grp.create_dataset("imag", data=np.imag(result.eigenvalues))
        eig_grp.attrs["n_converged"] = result.n_converged
        eig_grp.attrs["which"] = result.metadata.get("which", "LM")
        eig_grp.attrs["shift_invert"] = result.metadata.get(
            "shift_invert", False
        )
        if result.metadata.get("shift") is not None:
            eig_grp.attrs["shift"] = result.metadata["shift"]

        vec_grp = f.create_group("eigenvectors")
        vec_grp.create_dataset(
            "real",
            data=np.real(result.eigenvectors),
            compression="gzip",
        )
        vec_grp.create_dataset(
            "imag",
            data=np.imag(result.eigenvectors),
            compression="gzip",
        )
        vec_grp.attrs["n_rows"] = result.eigenvectors.shape[0]
        vec_grp.attrs["n_cols"] = result.eigenvectors.shape[1]

        if result.residual_norms is not None:
            f.create_dataset("residual_norms", data=result.residual_norms)

        if matrix is not None:
            mat_grp = f.create_group("matrix")
            mat_grp.create_dataset("data", data=matrix.data)
            mat_grp.create_dataset("indices", data=matrix.indices)
            mat_grp.create_dataset("indptr", data=matrix.indptr)
            mat_grp.attrs["shape"] = matrix.shape
            mat_grp.attrs["format"] = "csr"

        meta_grp = f.create_group("metadata")
        for key, value in result.metadata.items():
            if isinstance(value, (int, float, str, bool)):
                meta_grp.attrs[key] = value

    logger.info(f"结果已保存到: {filepath}")


def load_from_hdf5(filepath: str) -> EigenResult:
    """
    从 HDF5 文件加载特征值求解结果

    Parameters
    ----------
    filepath : str
        HDF5 文件路径

    Returns
    -------
    EigenResult
        加载的特征值结果
    """
    try:
        import h5py
    except ImportError:
        raise ImportError("请先安装 h5py: pip install h5py")

    with h5py.File(filepath, "r") as f:
        eig_grp = f["eigenvalues"]
        eigenvalues = (
            eig_grp["real"][:] + 1j * eig_grp["imag"][:]
        )
        n_converged = eig_grp.attrs.get("n_converged", len(eigenvalues))

        vec_grp = f["eigenvectors"]
        eigenvectors = (
            vec_grp["real"][:] + 1j * vec_grp["imag"][:]
        )

        residual_norms = None
        if "residual_norms" in f:
            residual_norms = f["residual_norms"][:]

        metadata = {}
        if "metadata" in f:
            for key in f["metadata"].attrs:
                metadata[key] = f["metadata"].attrs[key]
        metadata["which"] = eig_grp.attrs.get("which", "LM")
        metadata["shift_invert"] = eig_grp.attrs.get("shift_invert", False)
        if "shift" in eig_grp.attrs:
            metadata["shift"] = eig_grp.attrs["shift"]

    return EigenResult(
        eigenvalues=eigenvalues,
        eigenvectors=eigenvectors,
        n_converged=n_converged,
        residual_norms=residual_norms,
        metadata=metadata,
    )


def load_matrix_from_hdf5(filepath: str):
    """
    从 HDF5 文件加载 CSR 稀疏矩阵

    Parameters
    ----------
    filepath : str
        HDF5 文件路径

    Returns
    -------
    scipy.sparse.csr_matrix
        加载的稀疏矩阵
    """
    try:
        import h5py
        from scipy.sparse import csr_matrix
    except ImportError as e:
        raise ImportError(
            f"缺少依赖: {e}. 请安装 h5py 和 scipy"
        )

    with h5py.File(filepath, "r") as f:
        mat_grp = f["matrix"]
        shape = tuple(mat_grp.attrs["shape"])
        return csr_matrix(
            (mat_grp["data"][:], mat_grp["indices"][:], mat_grp["indptr"][:]),
            shape=shape,
        )


def plot_eigenvalues(
    result: EigenResult,
    filepath: Optional[str] = None,
    show: bool = False,
    title: str = "Eigenvalue Spectrum",
) -> Optional["matplotlib.figure.Figure"]:
    """
    可视化特征值分布

    Parameters
    ----------
    result : EigenResult
        特征值求解结果
    filepath : str, optional
        保存图片的路径
    show : bool
        是否显示图像窗口
    title : str
        图表标题

    Returns
    -------
    matplotlib.figure.Figure or None
        如果未指定 filepath 则返回 Figure 对象
    """
    try:
        import matplotlib
        if not show:
            matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        raise ImportError(
            "请先安装 matplotlib: pip install matplotlib"
        )

    evals = result.eigenvalues
    real_parts = np.real(evals)
    imag_parts = np.imag(evals)

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    axes[0].scatter(real_parts, imag_parts, c="b", marker="o", s=50)
    axes[0].axhline(y=0, color="k", linestyle="-", linewidth=0.5)
    axes[0].axvline(x=0, color="k", linestyle="-", linewidth=0.5)
    axes[0].set_xlabel("Real Part")
    axes[0].set_ylabel("Imaginary Part")
    axes[0].set_title(f"{title} (Complex Plane)")
    axes[0].grid(True, alpha=0.3)

    sorted_idx = np.argsort(np.abs(evals))[::-1]
    sorted_evals = np.abs(evals[sorted_idx])
    axes[1].bar(range(len(sorted_evals)), sorted_evals, color="steelblue")
    axes[1].set_xlabel("Eigenvalue Index (sorted by magnitude)")
    axes[1].set_ylabel("Magnitude")
    axes[1].set_title(f"{title} (Magnitude)")
    axes[1].grid(True, alpha=0.3, axis="y")

    plt.tight_layout()

    if filepath:
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        logger.info(f"图表已保存到: {filepath}")

    if show:
        plt.show()

    if filepath is None and not show:
        return fig
    return None


def plot_eigenvector(
    result: EigenResult,
    index: int = 0,
    filepath: Optional[str] = None,
    show: bool = False,
    title: Optional[str] = None,
) -> Optional["matplotlib.figure.Figure"]:
    """
    可视化单个特征向量

    Parameters
    ----------
    result : EigenResult
        特征值求解结果
    index : int
        特征向量索引
    filepath : str, optional
        保存图片的路径
    show : bool
        是否显示图像窗口
    title : str, optional
        图表标题

    Returns
    -------
    matplotlib.figure.Figure or None
    """
    try:
        import matplotlib
        if not show:
            matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        raise ImportError(
            "请先安装 matplotlib: pip install matplotlib"
        )

    vec = result.eigenvectors[:, index]
    eval_val = result.eigenvalues[index]

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    axes[0].plot(np.real(vec), "b-", linewidth=0.8)
    axes[0].set_xlabel("Row Index")
    axes[0].set_ylabel("Real Part")
    axes[0].set_title("Real Part of Eigenvector")
    axes[0].grid(True, alpha=0.3)

    axes[1].plot(np.imag(vec), "r-", linewidth=0.8)
    axes[1].set_xlabel("Row Index")
    axes[1].set_ylabel("Imaginary Part")
    axes[1].set_title("Imaginary Part of Eigenvector")
    axes[1].grid(True, alpha=0.3)

    if title is None:
        title = f"Eigenvector [{index}]: λ = {eval_val:.4f}"
    fig.suptitle(title, fontsize=12)

    plt.tight_layout()

    if filepath:
        fig.savefig(filepath, dpi=150, bbox_inches="tight")
        logger.info(f"图表已保存到: {filepath}")

    if show:
        plt.show()

    if filepath is None and not show:
        return fig
    return None

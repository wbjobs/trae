from setuptools import setup, find_packages

setup(
    name="eigensolver",
    version="0.1.0",
    description="PETSc/SLEPc 稀疏矩阵特征值求解器封装",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "numpy>=1.21.0",
        "scipy>=1.7.0",
        "mpi4py>=3.0.0",
        "h5py>=3.0.0",
        "matplotlib>=3.4.0",
    ],
    extras_require={
        "petsc": ["petsc4py>=3.15.0", "slepc4py>=3.15.0"],
    },
)

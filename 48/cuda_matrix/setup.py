from setuptools import setup, find_packages
import os

setup(
    name="cuda_matrix",
    version="1.0.0",
    description="CUDA-accelerated matrix operations library",
    author="CUDA Matrix Team",
    packages=find_packages(where="python"),
    package_dir={"": "python"},
    install_requires=[
        "numpy>=1.21",
    ],
    include_package_data=True,
    package_data={
        "cuda_matrix": ["*.pyd", "*.so"],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "Programming Language :: C++",
        "Programming Language :: CUDA",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
)

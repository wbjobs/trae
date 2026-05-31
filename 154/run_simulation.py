#!/usr/bin/env python3
"""
启动脚本 - 中子输运-热工水力耦合模拟
==========================================
支持 MPI 并行启动

用法:
    python run_simulation.py                     # 串行运行
    mpirun -n 4 python run_simulation.py         # MPI 并行
    python run_simulation.py --config my.yaml    # 使用自定义配置
"""

import sys
import os
import argparse
import numpy as np
from pathlib import Path


def check_dependencies():
    """检查依赖项"""
    missing = []

    core_packages = {
        "numpy": "numpy>=1.21",
        "scipy": "scipy>=1.7",
        "yaml": "pyyaml>=6.0",
    }

    for module, package in core_packages.items():
        try:
            __import__(module)
        except ImportError:
            missing.append(package)

    optional_packages = {
        "openmc": ("OpenMC", "pip install openmc"),
        "mpi4py": ("mpi4py", "pip install mpi4py"),
        "matplotlib": ("matplotlib", "pip install matplotlib"),
    }

    for module, (name, install_cmd) in optional_packages.items():
        try:
            __import__(module)
            print(f"  [OK] {name}")
        except ImportError:
            print(f"  [WARNING] {name} not found - {install_cmd}")

    if missing:
        print("\nMissing core packages:")
        for pkg in missing:
            print(f"  pip install {pkg}")
        return False

    return True


def run_serial(config_file: str = "config.yaml", args=None):
    """串行运行"""
    print("=" * 60)
    print("  Running in SERIAL mode")
    print("=" * 60)

    from coupled_simulation import CoupledSimulation, load_config

    config = load_config(config_file)
    config["simulation"]["mpi_procs"] = 1

    if args and args.no_adaptive_mesh:
        config["adaptive_mesh"]["enabled"] = False
        print("  Adaptive mesh: DISABLED")

    if args and args.no_fft:
        config["optimization"]["use_fft"] = False
        print("  FFT solver: DISABLED")

    simulation = CoupledSimulation(config)
    return simulation.run()


def run_mpi(config_file: str = "config.yaml", args=None):
    """MPI 并行运行"""
    print("=" * 60)
    print("  Running in MPI parallel mode")
    print("=" * 60)

    from mpi4py import MPI
    from coupled_simulation import CoupledSimulation, load_config

    comm = MPI.COMM_WORLD
    rank = comm.Get_rank()
    size = comm.Get_size()

    if rank == 0:
        print(f"  MPI processes: {size}")

    config = load_config(config_file)
    config["simulation"]["mpi_procs"] = size

    if args and args.no_adaptive_mesh:
        config["adaptive_mesh"]["enabled"] = False
        if rank == 0:
            print("  Adaptive mesh: DISABLED")

    if args and args.no_fft:
        config["optimization"]["use_fft"] = False
        if rank == 0:
            print("  FFT solver: DISABLED")

    simulation = CoupledSimulation(config)
    return simulation.run()


def main():
    parser = argparse.ArgumentParser(
        description="Neutronics-Thermal-Hydraulics Coupled Simulation"
    )
    parser.add_argument(
        "--config", "-c",
        default="config.yaml",
        help="Configuration file (default: config.yaml)"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check dependencies only"
    )
    parser.add_argument(
        "--force-serial",
        action="store_true",
        help="Force serial execution"
    )
    parser.add_argument(
        "--no-adaptive-mesh",
        action="store_true",
        help="Disable adaptive mesh refinement"
    )
    parser.add_argument(
        "--no-fft",
        action="store_true",
        help="Disable FFT solver acceleration"
    )

    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  NEUTRONICS - THERMAL-HYDRAULICS COUPLED SIMULATION")
    print("=" * 60 + "\n")

    print("Checking dependencies...")
    deps_ok = check_dependencies()

    if args.check:
        if deps_ok:
            print("\nAll core dependencies are satisfied.")
        return 0

    try:
        from mpi4py import MPI
        comm = MPI.COMM_WORLD
        use_mpi = comm.Get_size() > 1 and not args.force_serial
    except ImportError:
        use_mpi = False

    if use_mpi:
        results = run_mpi(args.config, args)
    else:
        results = run_serial(args.config, args)

    return 0 if results.get("converged", False) else 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
中子输运-热工水力耦合模拟主程序
==================================
实现 Picard 迭代耦合方法
支持 MPI 并行计算

用法:
    python coupled_simulation.py [config.yaml]
    mpirun -n 4 python coupled_simulation.py [config.yaml]
"""

import os
import sys
import time
import argparse
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

import yaml

from neutronics.openmc_wrapper import OpenMCWrapper
from thermal_hydraulics.moose_wrapper import MOOSEWrapper
from data_transfer import DataTransfer
from adaptive_mesh import (
    AdaptiveMeshGenerator,
    MeshOptimizer,
    RefinementMode,
    create_adaptive_mesh_config
)


def load_config(config_file: str = "config.yaml") -> Dict[str, Any]:
    """
    加载配置文件

    Parameters
    ----------
    config_file : str
        配置文件路径

    Returns
    -------
    dict
        配置参数字典
    """
    config_path = Path(config_file)
    if not config_path.exists():
        print(f"Warning: Config file '{config_file}' not found, using defaults")
        return get_default_config()

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    return config


def get_default_config() -> Dict[str, Any]:
    """
    获取默认配置

    Returns
    -------
    dict
        默认配置
    """
    return {
        "simulation": {
            "name": "PWR_pin_coupled",
            "max_iterations": 50,
            "convergence_criterion": 0.001,
            "relaxation_factor": 0.5,
            "mpi_procs": 1
        },
        "neutronics": {
            "code": "openmc",
            "num_batches": 100,
            "num_particles": 10000,
            "inactive_batches": 20,
            "energy_groups": 2,
            "temperature_dependent": True,
            "cross_section_library": "endfb71_hdf5"
        },
        "geometry": {
            "type": "pin_cell",
            "pitch": 1.26,
            "pin_radius": 0.45,
            "clad_inner_radius": 0.47,
            "clad_outer_radius": 0.55,
            "height": 300.0,
            "mesh_dimensions": [50, 50, 100]
        },
        "materials": {
            "fuel": {"name": "UO2", "density": 10.4, "enrichment": 4.5},
            "clad": {"name": "Zircaloy", "density": 6.55},
            "coolant": {"name": "H2O", "density": 0.75, "boron_ppm": 1000}
        },
        "thermal_hydraulics": {
            "code": "moose",
            "app_name": "thermal_hydraulics",
            "input_file": "thermal_hydraulics/th_input.i",
            "inlet_temperature": 565.0,
            "outlet_pressure": 15.5,
            "mass_flow_rate": 0.35,
            "heat_transfer_coefficient": 35000.0
        },
        "data_transfer": {
            "method": "conservative",
            "interpolation_order": 1,
            "scaling_power": 1.0
        },
        "output": {
            "directory": "output",
            "save_frequency": 1,
            "format": "hdf5",
            "verbosity": 2
        }
    }


class CoupledSimulation:
    """
    中子输运-热工水力耦合模拟主类

    实现 Picard 迭代方法：
    1. 中子输运计算功率分布
    2. 传递功率到热工水力模块
    3. 热工水力计算温度场
    4. 温度反馈到中子输运模块
    5. 检查收敛，不满足则继续迭代
    """

    def __init__(self, config: Dict[str, Any]):
        """
        初始化耦合模拟

        Parameters
        ----------
        config : dict
            配置参数字典
        """
        self.config = config
        self.sim_config = config["simulation"]
        self.output_config = config["output"]

        self.comm = self._initialize_mpi()

        self.max_iterations = self.sim_config["max_iterations"]
        self.convergence_criterion = self.sim_config["convergence_criterion"]
        self.relaxation_factor = self.sim_config["relaxation_factor"]

        self.neutronics_solver = None
        self.thermal_solver = None
        self.data_transfer = None

        self.adaptive_mesh_enabled = config.get("adaptive_mesh", {}).get("enabled", False)
        self.mesh_generator = None
        self.mesh_optimizer = None
        self.current_mesh = None
        self.adaptation_interval = config.get("optimization", {}).get("adaptation_interval", 3)

        self.iteration = 0
        self.converged = False
        self.convergence_history = []
        self.computation_times = []

        self.power_distribution = None
        self.temperature_field = None
        self.power_distribution_old = None
        self.temperature_field_old = None

        self.output_dir = Path(self.output_config.get("directory", "output"))
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self._initialize_solvers()

    def _initialize_mpi(self):
        """
        初始化 MPI

        Returns
        -------
        MPI.Comm
            MPI 通信子
        """
        try:
            from mpi4py import MPI
            comm = MPI.COMM_WORLD
            if comm.Get_rank() == 0:
                print(f"[MPI] Initialized with {comm.Get_size()} processes")
            return comm
        except ImportError:
            print("[MPI] mpi4py not found, running in serial mode")
            return None

    def _initialize_solvers(self):
        """初始化各个求解器"""
        if self.rank == 0:
            print("[Coupled] Initializing solvers...")

        self.neutronics_solver = OpenMCWrapper(self.config, self.comm)
        self.thermal_solver = MOOSEWrapper(self.config, self.comm)
        self.data_transfer = DataTransfer(self.config, self.comm)

        if self.adaptive_mesh_enabled:
            if self.rank == 0:
                print("[Coupled] Initializing adaptive mesh module...")

            if "adaptive_mesh" not in self.config:
                self.config.update(create_adaptive_mesh_config())

            self.mesh_generator = AdaptiveMeshGenerator(self.config, self.comm)
            self.mesh_optimizer = MeshOptimizer(self.config, self.comm)
            self.current_mesh = self.mesh_generator.generate_initial_mesh()

            if self.rank == 0:
                print(f"[Coupled] Adaptive mesh enabled with {len(self.current_mesh.cells)} cells")

        if self.rank == 0:
            print("[Coupled] Solvers initialized successfully")

    @property
    def rank(self) -> int:
        """获取当前进程编号"""
        return self.comm.Get_rank() if self.comm else 0

    @property
    def nprocs(self) -> int:
        """获取进程总数"""
        return self.comm.Get_size() if self.comm else 1

    def run(self) -> Dict[str, Any]:
        """
        运行耦合模拟

        Returns
        -------
        dict
            模拟结果
        """
        start_time = time.time()

        if self.rank == 0:
            self._print_header()

        for iteration in range(1, self.max_iterations + 1):
            self.iteration = iteration

            if self.rank == 0:
                print(f"\n{'='*60}")
                print(f"  Iteration {iteration}/{self.max_iterations}")
                print(f"{'='*60}")

            iter_start = time.time()

            try:
                self._run_neutronics_step()
                self._run_thermal_hydraulics_step()

                self._enforce_physical_constraints()

                if self.adaptive_mesh_enabled and \
                   self.mesh_optimizer.should_adapt(iteration):
                    self._adapt_mesh()

                converged, power_error, temp_error = self._check_convergence()

                self.convergence_history.append({
                    "iteration": iteration,
                    "power_error": power_error,
                    "temperature_error": temp_error,
                    "converged": converged
                })

                if self.rank == 0:
                    print(f"\n  Convergence check:")
                    print(f"    Power relative error:      {power_error:.6e}")
                    print(f"    Temperature relative error: {temp_error:.6e}")
                    print(f"    Criterion:                  {self.convergence_criterion:.6e}")
                    print(f"    Converged:                  {converged}")

                if converged:
                    self.converged = True
                    if self.rank == 0:
                        print(f"\n  *** Simulation converged at iteration {iteration} ***")
                    break

                self._apply_relaxation()

                self.power_distribution_old = self.power_distribution.copy()
                self.temperature_field_old = self.temperature_field.copy()

                if self.rank == 0:
                    self._save_iteration_data()

            except Exception as e:
                print(f"Error at iteration {iteration}: {e}")
                import traceback
                traceback.print_exc()
                raise

            iter_time = time.time() - iter_start
            self.computation_times.append(iter_time)

            if self.rank == 0:
                print(f"\n  Iteration time: {iter_time:.1f} seconds")

        total_time = time.time() - start_time

        results = self._gather_results(total_time)

        if self.rank == 0:
            self._print_summary(results)
            self._save_final_results(results)

        return results

    def _run_neutronics_step(self):
        """执行中子输运计算步骤"""
        if self.rank == 0:
            print("\n  [1/2] Neutronics calculation...")

        temperature_input = None
        if self.temperature_field is not None:
            temperature_input = self.temperature_field.copy()

        neutron_results = self.neutronics_solver.run_simulation(
            temperature_field=temperature_input
        )

        self.power_distribution = neutron_results["power_distribution"].copy()

        if self.rank == 0:
            print(f"  [1/2] Neutronics complete")
            print(f"        k-effective: {neutron_results.get('keff', (0, 0))[0]:.6f} "
                  f"± {neutron_results.get('keff', (0, 0))[1]:.6f}")

    def _run_thermal_hydraulics_step(self):
        """执行热工水力计算步骤"""
        if self.rank == 0:
            print("\n  [2/2] Thermal-Hydraulics calculation...")

        power_input = self.power_distribution.copy()

        if self.power_distribution_old is not None:
            initial_temp = self.temperature_field_old
        else:
            initial_temp = None

        th_results = self.thermal_solver.run_simulation(
            power_distribution=power_input,
            initial_temperature=initial_temp
        )

        self.temperature_field = th_results["temperature_field"].copy()

        if self.rank == 0:
            print(f"  [2/2] Thermal-Hydraulics complete")
            print(f"        Max temperature: {th_results['max_temperature']:.2f} K")
            print(f"        Min temperature: {th_results['min_temperature']:.2f} K")
            print(f"        Avg temperature: {th_results['avg_temperature']:.2f} K")

    def _check_convergence(self) -> Tuple[bool, float, float]:
        """
        检查收敛性

        Returns
        -------
        tuple
            (是否收敛, 功率误差, 温度误差)
        """
        if self.power_distribution_old is None or self.temperature_field_old is None:
            return False, float('inf'), float('inf')

        power_converged, power_error = self.data_transfer.check_convergence(
            self.power_distribution,
            self.power_distribution_old,
            self.convergence_criterion
        )

        temp_converged, temp_error = self.data_transfer.check_convergence(
            self.temperature_field,
            self.temperature_field_old,
            self.convergence_criterion
        )

        converged = power_converged and temp_converged

        return converged, power_error, temp_error

    def _apply_relaxation(self):
        """应用自适应松弛因子"""
        if self.power_distribution_old is not None:
            power_change = np.max(np.abs(
                self.power_distribution - self.power_distribution_old
            ))
            avg_power = np.max(np.abs(self.power_distribution)) + 1e-10
            power_ratio = power_change / avg_power

            adaptive_factor = self.relaxation_factor
            if power_ratio > 0.1:
                adaptive_factor = min(self.relaxation_factor, 0.3)
            elif power_ratio > 0.01:
                adaptive_factor = min(self.relaxation_factor, 0.5)

            self.power_distribution = self.data_transfer.compute_relaxation(
                self.power_distribution,
                self.power_distribution_old,
                adaptive_factor
            )

            if self.rank == 0:
                print(f"  Power change ratio: {power_ratio:.6f}")

        if self.temperature_field_old is not None:
            temp_change = np.max(np.abs(
                self.temperature_field - self.temperature_field_old
            ))
            avg_temp = np.max(np.abs(self.temperature_field)) + 1e-10
            temp_ratio = temp_change / avg_temp

            adaptive_factor = self.relaxation_factor
            if temp_ratio > 0.1:
                adaptive_factor = min(self.relaxation_factor, 0.3)
            elif temp_ratio > 0.01:
                adaptive_factor = min(self.relaxation_factor, 0.5)

            self.temperature_field = self.data_transfer.compute_relaxation(
                self.temperature_field,
                self.temperature_field_old,
                adaptive_factor
            )

            if self.rank == 0:
                print(f"  Temperature change ratio: {temp_ratio:.6f}")
                print(f"  Relaxation applied (factor: {adaptive_factor:.2f})")

    def _enforce_physical_constraints(self):
        """强制物理约束，防止非物理结果"""
        T_inlet = self.config["thermal_hydraulics"]["inlet_temperature"]
        T_MAX = 3000.0

        if self.temperature_field is not None:
            self.temperature_field = np.clip(
                self.temperature_field, T_inlet, T_MAX
            )

            if self.rank == 0:
                t_min = np.min(self.temperature_field)
                t_max = np.max(self.temperature_field)
                if t_max >= T_MAX * 0.99:
                    print(f"  Warning: Temperature near upper bound ({t_max:.1f} K)")

        if self.power_distribution is not None:
            self.power_distribution = np.abs(self.power_distribution)
            total_power = np.sum(self.power_distribution)
            if total_power > 0:
                self.power_distribution = self.power_distribution / total_power

            if self.rank == 0:
                print(f"  Physical constraints enforced")

    def _adapt_mesh(self):
        """执行自适应网格细化"""
        if self.rank == 0:
            print(f"\n  [Adaptive] Performing mesh adaptation...")

        old_cell_count = len(self.current_mesh.cells) if self.current_mesh else 0

        new_power, new_temp, new_mesh = self.mesh_optimizer.adapt_mesh(
            self.power_distribution,
            self.temperature_field
        )

        self.power_distribution = new_power
        self.temperature_field = new_temp
        self.current_mesh = new_mesh

        new_cell_count = len(new_mesh.cells)

        if self.power_distribution_old is not None:
            self.power_distribution_old = self.mesh_generator.transfer_field_to_mesh(
                self.power_distribution_old,
                self.current_mesh,
                new_mesh
            )

        if self.temperature_field_old is not None:
            self.temperature_field_old = self.mesh_generator.transfer_field_to_mesh(
                self.temperature_field_old,
                self.current_mesh,
                new_mesh
            )

        if self.rank == 0:
            print(f"  [Adaptive] Cell count: {old_cell_count} -> {new_cell_count}")
            if old_cell_count > 0:
                speedup = old_cell_count / max(new_cell_count, 1)
                print(f"  [Adaptive] Estimated speedup: {speedup:.2f}x")

    def _save_iteration_data(self):
        """保存迭代数据"""
        if self.iteration % self.output_config.get("save_frequency", 1) != 0:
            return

        iteration_dir = self.output_dir / f"iteration_{self.iteration:04d}"
        iteration_dir.mkdir(parents=True, exist_ok=True)

        np.save(iteration_dir / "power_distribution.npy", self.power_distribution)
        np.save(iteration_dir / "temperature_field.npy", self.temperature_field)

    def _gather_results(self, total_time: float) -> Dict[str, Any]:
        """
        收集模拟结果

        Parameters
        ----------
        total_time : float
            总计算时间

        Returns
        -------
        dict
            结果字典
        """
        results = {
            "simulation_name": self.sim_config["name"],
            "converged": self.converged,
            "total_iterations": self.iteration,
            "total_time_seconds": total_time,
            "max_iterations": self.max_iterations,
            "convergence_criterion": self.convergence_criterion,
            "convergence_history": self.convergence_history,
            "final_power_distribution": self.power_distribution,
            "final_temperature_field": self.temperature_field
        }

        if self.temperature_field is not None:
            results["max_temperature"] = float(np.max(self.temperature_field))
            results["min_temperature"] = float(np.min(self.temperature_field))
            results["avg_temperature"] = float(np.mean(self.temperature_field))

        return results

    def _print_header(self):
        """打印模拟标题"""
        print("\n" + "=" * 70)
        print("  NEUTRONICS - THERMAL-HYDRAULICS COUPLED SIMULATION")
        print("=" * 70)
        print(f"  Simulation:      {self.sim_config['name']}")
        print(f"  MPI processes:   {self.nprocs}")
        print(f"  Max iterations:  {self.max_iterations}")
        print(f"  Convergence:     {self.convergence_criterion}")
        print(f"  Relaxation:      {self.relaxation_factor}")
        print(f"  Mesh:            {self.config['geometry']['mesh_dimensions']}")
        print("=" * 70)

    def _print_summary(self, results: Dict[str, Any]):
        """打印结果摘要"""
        print("\n" + "=" * 70)
        print("  SIMULATION SUMMARY")
        print("=" * 70)
        print(f"  Status:              {'Converged' if results['converged'] else 'Not converged'}")
        print(f"  Total iterations:    {results['total_iterations']}")
        print(f"  Total time:          {results['total_time_seconds']:.2f} seconds")
        print(f"  Avg time/iteration:  {results['total_time_seconds']/max(results['total_iterations'], 1):.2f} seconds")
        print()

        if "max_temperature" in results:
            print(f"  Max temperature:     {results['max_temperature']:.2f} K")
            print(f"  Min temperature:     {results['min_temperature']:.2f} K")
            print(f"  Avg temperature:     {results['avg_temperature']:.2f} K")
            print()

        print("  Convergence history:")
        print("  " + "-" * 50)
        print(f"  {'Iter':>6} {'Power Error':>15} {'Temp Error':>15} {'Converged':>10}")
        print("  " + "-" * 50)
        for entry in results["convergence_history"]:
            print(f"  {entry['iteration']:>6} "
                  f"{entry['power_error']:>15.6e} "
                  f"{entry['temperature_error']:>15.6e} "
                  f"{str(entry['converged']):>10}")
        print("=" * 70 + "\n")

    def _save_final_results(self, results: Dict[str, Any]):
        """保存最终结果"""
        results_file = self.output_dir / "final_results.npz"

        save_dict = {
            "converged": np.array([results["converged"]]),
            "total_iterations": np.array([results["total_iterations"]]),
            "total_time": np.array([results["total_time_seconds"]]),
            "power_distribution": results["final_power_distribution"],
            "temperature_field": results["final_temperature_field"]
        }

        if "max_temperature" in results:
            save_dict["max_temperature"] = np.array([results["max_temperature"]])
            save_dict["min_temperature"] = np.array([results["min_temperature"]])
            save_dict["avg_temperature"] = np.array([results["avg_temperature"]])

        np.savez(results_file, **save_dict)

        history_file = self.output_dir / "convergence_history.csv"
        with open(history_file, "w") as f:
            f.write("iteration,power_error,temperature_error,converged\n")
            for entry in results["convergence_history"]:
                f.write(f"{entry['iteration']},{entry['power_error']:.6e},"
                       f"{entry['temperature_error']:.6e},{entry['converged']}\n")

        if self.rank == 0:
            print(f"  Results saved to: {results_file}")
            print(f"  Convergence history: {history_file}")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="Neutronics-Thermal-Hydraulics Coupled Simulation"
    )
    parser.add_argument(
        "config",
        nargs="?",
        default="config.yaml",
        help="Path to configuration file (default: config.yaml)"
    )
    parser.add_argument(
        "--verbosity",
        type=int,
        default=2,
        help="Verbosity level (0-3)"
    )

    args = parser.parse_args()

    try:
        config = load_config(args.config)
    except Exception as e:
        print(f"Error loading configuration: {e}")
        print("Using default configuration")
        config = get_default_config()

    simulation = CoupledSimulation(config)

    try:
        results = simulation.run()

        if simulation.rank == 0:
            if results["converged"]:
                print("\n✓ Simulation completed successfully!")
            else:
                print("\n✗ Simulation did not converge within maximum iterations")

        return 0 if results["converged"] else 1

    except KeyboardInterrupt:
        print("\n\nSimulation interrupted by user")
        return 130
    except Exception as e:
        print(f"\nError during simulation: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

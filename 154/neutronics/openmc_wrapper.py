"""
OpenMC 中子输运模块封装
========================
提供 3D 功率分布计算、温度相关截面更新等功能
支持 MPI 并行计算
"""

import os
import sys
import numpy as np
from pathlib import Path
from typing import Optional, Tuple, Dict, Any


class OpenMCWrapper:
    """OpenMC 中子输运求解器封装类"""

    def __init__(self, config: Dict[str, Any], comm=None):
        """
        初始化 OpenMC 封装

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

        self.neutronics_config = config["neutronics"]
        self.geometry_config = config["geometry"]
        self.materials_config = config["materials"]

        self.power_distribution = None
        self.mesh = None
        self.materials = None
        self.tally = None
        self.model = None

        self._initialize_openmc()

    def _initialize_openmc(self):
        """初始化 OpenMC 环境"""
        try:
            import openmc
            self.openmc = openmc
        except ImportError:
            raise ImportError(
                "OpenMC is not installed. Please install OpenMC: "
                "pip install openmc"
            )

        os.environ["OPENMC_CROSS_SECTIONS"] = (
            self.neutronics_config.get(
                "cross_section_library", "endfb71_hdf5"
            )
        )

        if self.rank == 0:
            print("[OpenMC] Initializing neutronics module...")

    def build_geometry(self):
        """构建 3D 几何模型"""
        if self.rank == 0:
            print("[OpenMC] Building geometry...")

        pitch = self.geometry_config["pitch"]
        pin_radius = self.geometry_config["pin_radius"]
        clad_inner = self.geometry_config["clad_inner_radius"]
        clad_outer = self.geometry_config["clad_outer_radius"]
        height = self.geometry_config["height"]

        fuel_cyl = self.openmc.ZCylinder(r=pin_radius)
        clad_inner_cyl = self.openmc.ZCylinder(r=clad_inner)
        clad_outer_cyl = self.openmc.ZCylinder(r=clad_outer)

        surface_min = self.openmc.ZPlane(z0=0.0)
        surface_max = self.openmc.ZPlane(z0=height)

        left = self.openmc.XPlane(x0=-pitch / 2)
        right = self.openmc.XPlane(x0=pitch / 2)
        bottom = self.openmc.YPlane(y0=-pitch / 2)
        top = self.openmc.YPlane(y0=pitch / 2)

        left.boundary_type = "reflective"
        right.boundary_type = "reflective"
        bottom.boundary_type = "reflective"
        top.boundary_type = "reflective"
        surface_min.boundary_type = "vacuum"
        surface_max.boundary_type = "vacuum"

        fuel_region = (-fuel_cyl & +surface_min & -surface_max)
        gap_region = (+fuel_cyl & -clad_inner_cyl &
                     +surface_min & -surface_max)
        clad_region = (+clad_inner_cyl & -clad_outer_cyl &
                      +surface_min & -surface_max)
        coolant_region = (+clad_outer_cyl &
                         +left & -right & +bottom & -top &
                         +surface_min & -surface_max)

        self._build_materials()

        fuel_cell = self.openmc.Cell(fill=self.fuel_material, region=fuel_region)
        gap_cell = self.openmc.Cell(fill=self.gap_material, region=gap_region)
        clad_cell = self.openmc.Cell(fill=self.clad_material, region=clad_region)
        coolant_cell = self.openmc.Cell(fill=self.coolant_material,
                                        region=coolant_region)

        root_universe = self.openmc.Universe(
            cells=[fuel_cell, gap_cell, clad_cell, coolant_cell]
        )

        self.geometry = self.openmc.Geometry(root_universe)

        if self.rank == 0:
            print("[OpenMC] Geometry built successfully")

    def _build_materials(self):
        """构建材料定义"""
        fuel_config = self.materials_config["fuel"]
        clad_config = self.materials_config["clad"]
        coolant_config = self.materials_config["coolant"]

        self.fuel_material = self.openmc.Material(name="fuel")
        self.fuel_material.set_density("g/cc", fuel_config["density"])
        self.fuel_material.add_nuclide("U234", 2.33e-06)
        self.fuel_material.add_nuclide("U235", fuel_config["enrichment"] / 100 * 0.035)
        self.fuel_material.add_nuclide("U238", 0.035 * (1 - fuel_config["enrichment"] / 100))
        self.fuel_material.add_nuclide("O16", 0.070)
        self.fuel_material.temperature = 900.0

        self.gap_material = self.openmc.Material(name="helium_gap")
        self.gap_material.set_density("g/cc", 0.00001)
        self.gap_material.add_nuclide("He4", 1.0)
        self.gap_material.temperature = 600.0

        self.clad_material = self.openmc.Material(name="cladding")
        self.clad_material.set_density("g/cc", clad_config["density"])
        self.clad_material.add_nuclide("Zr90", 0.5145)
        self.clad_material.add_nuclide("Zr91", 0.1122)
        self.clad_material.add_nuclide("Zr92", 0.1715)
        self.clad_material.add_nuclide("Zr94", 0.1738)
        self.clad_material.add_nuclide("Zr96", 0.0280)
        self.clad_material.temperature = 600.0

        self.coolant_material = self.openmc.Material(name="coolant")
        self.coolant_material.set_density("g/cc", coolant_config["density"])
        self.coolant_material.add_nuclide("H1", 2.0 / 3.0)
        self.coolant_material.add_nuclide("O16", 1.0 / 3.0)
        self.coolant_material.add_nuclide("B10", coolant_config["boron_ppm"] * 1e-6)
        self.coolant_material.temperature = 600.0

        self.materials = self.openmc.Materials(
            [self.fuel_material, self.gap_material,
             self.clad_material, self.coolant_material]
        )

    def build_mesh(self):
        """构建 3D 网格"""
        if self.rank == 0:
            print("[OpenMC] Building mesh...")

        mesh_dims = self.geometry_config["mesh_dimensions"]
        pitch = self.geometry_config["pitch"]
        height = self.geometry_config["height"]

        self.mesh = self.openmc.RegularMesh()
        self.mesh.dimension = mesh_dims
        self.mesh.lower_left = (-pitch / 2, -pitch / 2, 0.0)
        self.mesh.upper_right = (pitch / 2, pitch / 2, height)

        if self.rank == 0:
            print(f"[OpenMC] Mesh dimensions: {mesh_dims}")

    def build_tallies(self):
        """构建计数（Tally）"""
        if self.rank == 0:
            print("[OpenMC] Building tallies...")

        mesh_filter = self.openmc.MeshFilter(self.mesh)
        energy_filter = self.openmc.EnergyFilter(
            [0.0, 0.625e-6, 20.0e6]
        )

        self.power_tally = self.openmc.Tally(name="power_distribution")
        self.power_tally.filters = [mesh_filter, energy_filter]
        self.power_tally.scores = ["fission", "heating"]

        self.tallies = self.openmc.Tallies([self.power_tally])

    def build_settings(self):
        """构建模拟设置"""
        if self.rank == 0:
            print("[OpenMC] Building settings...")

        settings = self.openmc.Settings()
        settings.batches = self.neutronics_config["num_batches"]
        settings.inactive = self.neutronics_config["inactive_batches"]
        settings.particles = self.neutronics_config["num_particles"]
        settings.run_mode = "fixed source" if False else "eigenvalue"
        settings.temperature = {"T": 600.0, "range": (294, 2500)}
        settings.dagmc = False

        bounds = [
            -self.geometry_config["pitch"] / 2,
            -self.geometry_config["pitch"] / 2,
            0.0,
            self.geometry_config["pitch"] / 2,
            self.geometry_config["pitch"] / 2,
            self.geometry_config["height"]
        ]
        settings.source = self.openmc.Source(
            space=self.openmc.stats.Box(
                bounds[:3], bounds[3:]
            )
        )

        settings.verbosity = 2 if self.rank == 0 else 1
        self.settings = settings

    def run_simulation(self, temperature_field: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """
        运行中子输运模拟

        Parameters
        ----------
        temperature_field : np.ndarray, optional
            温度场数据，用于更新截面

        Returns
        -------
        dict
            包含功率分布和其他结果的字典
        """
        if temperature_field is not None:
            self._update_temperature(temperature_field)

        self.build_geometry()
        self.build_mesh()
        self.build_tallies()
        self.build_settings()

        self.model = self.openmc.Model(
            geometry=self.geometry,
            materials=self.materials,
            tallies=self.tallies,
            settings=self.settings
        )

        if self.rank == 0:
            print("[OpenMC] Running neutron transport simulation...")
            print(f"[OpenMC]   Batches: {self.neutronics_config['num_batches']}")
            print(f"[OpenMC]   Particles: {self.neutronics_config['num_particles']}")

        statepoint_file = self._run_openmc()

        self.power_distribution = self._extract_power_distribution(statepoint_file)

        if self.rank == 0:
            print(f"[OpenMC] Simulation complete")
            print(f"[OpenMC]   Average power density: {np.mean(self.power_distribution):.2f} W/m³")

        return {
            "power_distribution": self.power_distribution,
            "mesh": self.mesh,
            "keff": self._extract_keff(statepoint_file),
            "total_power": np.sum(self.power_distribution)
        }

    def _update_temperature(self, temperature_field: np.ndarray):
        """根据温度场更新材料温度"""
        avg_temp = np.mean(temperature_field) if temperature_field.size > 0 else 600.0

        self.fuel_material.temperature = min(max(avg_temp, 294), 2500)
        self.clad_material.temperature = 600.0
        self.coolant_material.temperature = 600.0

        if self.rank == 0:
            print(f"[OpenMC] Updating fuel temperature to {self.fuel_material.temperature:.1f} K")

    def _run_openmc(self) -> str:
        """执行 OpenMC 模拟"""
        cwd = os.getcwd()
        statepoint_dir = Path("output") / "openmc_statepoints"
        statepoint_dir.mkdir(parents=True, exist_ok=True)

        os.chdir(statepoint_dir)

        try:
            if self.nprocs > 1 and self.comm is not None:
                self.model.run(
                    particles=self.neutronics_config["num_particles"],
                    batches=self.neutronics_config["num_batches"]
                )
            else:
                self.model.run(
                    particles=self.neutronics_config["num_particles"],
                    batches=self.neutronics_config["num_batches"]
                )
        finally:
            os.chdir(cwd)

        import glob
        sp_files = sorted(statepoint_dir.glob("statepoint.*.h5"))
        if sp_files:
            return str(sp_files[-1])

        return str(statepoint_dir / "statepoint.100.h5")

    def _extract_power_distribution(self, statepoint_file: str) -> np.ndarray:
        """从状态点文件提取功率分布"""
        try:
            sp = self.openmc.StatePoint(statepoint_file)
            tally = sp.get_tally(name="power_distribution")

            mesh_dims = tuple(self.geometry_config["mesh_dimensions"])
            power_data = tally.get_slice(scores=["fission"]).mean
            power_data = power_data.reshape(mesh_dims)

            total_power = float(np.sum(power_data))
            if total_power > 0:
                power_data = power_data / total_power

            return power_data.astype(np.float64)

        except Exception as e:
            if self.rank == 0:
                print(f"[OpenMC] Warning: Using synthetic power data ({e})")
            return self._generate_synthetic_power()

    def _generate_synthetic_power(self) -> np.ndarray:
        """生成合成功率数据（用于测试或当OpenMC不可用时）"""
        mesh_dims = tuple(self.geometry_config["mesh_dimensions"])
        x = np.linspace(-1, 1, mesh_dims[0])
        y = np.linspace(-1, 1, mesh_dims[1])
        z = np.linspace(-1, 1, mesh_dims[2])

        X, Y, Z = np.meshgrid(x, y, z, indexing="ij")

        radial_dist = np.sqrt(X**2 + Y**2)
        power_profile = np.exp(-radial_dist**2 / 0.5) * (1.0 + 0.2 * np.sin(np.pi * Z))

        pin_mask = radial_dist < self.geometry_config["pin_radius"] / (
            self.geometry_config["pitch"] / 2
        )
        power_profile[~pin_mask] = 0.0

        total_power = np.sum(power_profile)
        if total_power > 0:
            power_profile = power_profile / total_power

        return power_profile.astype(np.float64)

    def _extract_keff(self, statepoint_file: str) -> Tuple[float, float]:
        """提取有效增殖因子"""
        try:
            sp = self.openmc.StatePoint(statepoint_file)
            keff = sp.keff
            return keff.nominal_value, keff.std_dev
        except Exception:
            return 1.0, 0.0

    def get_power_distribution(self) -> np.ndarray:
        """获取功率分布"""
        return self.power_distribution

    def get_mesh_centers(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """获取网格中心坐标"""
        mesh_dims = self.geometry_config["mesh_dimensions"]
        pitch = self.geometry_config["pitch"]
        height = self.geometry_config["height"]

        x = np.linspace(-pitch / 2, pitch / 2, mesh_dims[0] + 1)
        y = np.linspace(-pitch / 2, pitch / 2, mesh_dims[1] + 1)
        z = np.linspace(0.0, height, mesh_dims[2] + 1)

        x_centers = (x[:-1] + x[1:]) / 2
        y_centers = (y[:-1] + y[1:]) / 2
        z_centers = (z[:-1] + z[1:]) / 2

        return x_centers, y_centers, z_centers

    def get_mesh_volumes(self) -> np.ndarray:
        """计算每个网格单元的体积"""
        mesh_dims = tuple(self.geometry_config["mesh_dimensions"])
        pitch = self.geometry_config["pitch"]
        height = self.geometry_config["height"]

        dx = pitch / mesh_dims[0]
        dy = pitch / mesh_dims[1]
        dz = height / mesh_dims[2]
        volume = dx * dy * dz

        return np.full(mesh_dims, volume)

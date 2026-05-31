import os
import json
import h5py
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import shutil
import warnings

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    plt = None

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


@dataclass
class ExportConfig:
    export_dir: str = "exports"
    formats: List[str] = field(default_factory=lambda: ["csv", "json", "hdf5"])
    include_residuals: bool = True
    include_field_data: bool = True
    include_mesh: bool = True
    downsample_factor: int = 1
    image_dpi: int = 150
    image_format: str = "png"
    compression_level: int = 6
    export_interval: int = 1


@dataclass
class ExportResult:
    format: str
    filepath: str
    size_bytes: int
    created_at: str
    success: bool
    error_message: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "format": self.format,
            "filepath": self.filepath,
            "size_mb": self.size_bytes / (1024 ** 2),
            "created_at": self.created_at,
            "success": self.success,
            "error_message": self.error_message
        }


class ResultExporter:
    def __init__(self, config: Optional[ExportConfig] = None):
        self.config = config or ExportConfig()
        os.makedirs(self.config.export_dir, exist_ok=True)
        self._export_history: List[ExportResult] = []

    def export_task(self, task_id: str, task_data: Dict,
                     results_dir: str) -> List[ExportResult]:
        results = []
        task_export_dir = os.path.join(self.config.export_dir, task_id)
        os.makedirs(task_export_dir, exist_ok=True)

        for fmt in self.config.formats:
            try:
                if fmt == "csv":
                    result = self._export_csv(task_id, task_data, results_dir, task_export_dir)
                elif fmt == "json":
                    result = self._export_json(task_id, task_data, results_dir, task_export_dir)
                elif fmt == "hdf5":
                    result = self._export_hdf5(task_id, task_data, results_dir, task_export_dir)
                elif fmt in ["png", "jpg", "jpeg"]:
                    result = self._export_images(task_id, task_data, results_dir, task_export_dir, fmt)
                elif fmt == "vtk":
                    result = self._export_vtk(task_id, task_data, results_dir, task_export_dir)
                else:
                    result = ExportResult(
                        format=fmt,
                        filepath="",
                        size_bytes=0,
                        created_at=datetime.now().isoformat(),
                        success=False,
                        error_message=f"Unsupported format: {fmt}"
                    )
                results.append(result)
                self._export_history.append(result)
            except Exception as e:
                results.append(ExportResult(
                    format=fmt,
                    filepath="",
                    size_bytes=0,
                    created_at=datetime.now().isoformat(),
                    success=False,
                    error_message=str(e)
                ))

        return results

    def _export_csv(self, task_id: str, task_data: Dict,
                     results_dir: str, export_dir: str) -> ExportResult:
        filepath = os.path.join(export_dir, f"{task_id}_results.csv")

        data_rows = []
        snapshots_dir = os.path.join(results_dir, "tasks", task_id, "snapshots")

        if os.path.exists(snapshots_dir):
            for filename in sorted(os.listdir(snapshots_dir)):
                if filename.endswith(".h5"):
                    filepath_h5 = os.path.join(snapshots_dir, filename)
                    try:
                        with h5py.File(filepath_h5, 'r') as f:
                            row = {
                                "iteration": f.attrs.get("iteration", 0),
                                "time": f.attrs.get("time", 0.0),
                                "mass_residual": f.attrs.get("mass_residual", 0.0),
                                "momentum_residual": f.attrs.get("momentum_residual", 0.0),
                                "energy_residual": f.attrs.get("energy_residual", 0.0),
                                "velocity_mean": float(np.mean(f["velocity"])),
                                "pressure_mean": float(np.mean(f["pressure"])),
                            }
                            if "temperature" in f:
                                row["temperature_mean"] = float(np.mean(f["temperature"]))
                            data_rows.append(row)
                    except Exception:
                        continue

        if data_rows:
            df = pd.DataFrame(data_rows)
            df.to_csv(filepath, index=False)
        else:
            pd.DataFrame([{"task_id": task_id, "status": "no_data"}]).to_csv(filepath, index=False)

        size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
        return ExportResult(
            format="csv",
            filepath=filepath,
            size_bytes=size,
            created_at=datetime.now().isoformat(),
            success=True
        )

    def _export_json(self, task_id: str, task_data: Dict,
                      results_dir: str, export_dir: str) -> ExportResult:
        filepath = os.path.join(export_dir, f"{task_id}_metadata.json")

        info_file = os.path.join(results_dir, "tasks", task_id, "task_info.json")
        if os.path.exists(info_file):
            with open(info_file, 'r') as f:
                task_info = json.load(f)
        else:
            task_info = {}

        export_data = {
            "task_id": task_id,
            "exported_at": datetime.now().isoformat(),
            "task_info": task_info,
            "task_data": task_data,
            "result_statistics": self._compute_statistics(task_id, results_dir)
        }

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False, default=str)

        size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
        return ExportResult(
            format="json",
            filepath=filepath,
            size_bytes=size,
            created_at=datetime.now().isoformat(),
            success=True
        )

    def _export_hdf5(self, task_id: str, task_data: Dict,
                      results_dir: str, export_dir: str) -> ExportResult:
        filepath = os.path.join(export_dir, f"{task_id}_data.h5")
        snapshots_dir = os.path.join(results_dir, "tasks", task_id, "snapshots")

        with h5py.File(filepath, 'w') as f:
            f.attrs["task_id"] = task_id
            f.attrs["exported_at"] = datetime.now().isoformat()

            for key, value in task_data.items():
                if isinstance(value, (int, float, str)):
                    f.attrs[key] = value

            info_file = os.path.join(results_dir, "tasks", task_id, "task_info.json")
            if os.path.exists(info_file):
                with open(info_file, 'r') as f_info:
                    task_info = json.load(f_info)
                for key, value in task_info.items():
                    if isinstance(value, (int, float, str)):
                        f.attrs[f"task_{key}"] = value

            if os.path.exists(snapshots_dir) and self.config.include_field_data:
                snapshots_grp = f.create_group("snapshots")
                count = 0
                for filename in sorted(os.listdir(snapshots_dir)):
                    if filename.endswith(".h5") and count % self.config.export_interval == 0:
                        src_path = os.path.join(snapshots_dir, filename)
                        with h5py.File(src_path, 'r') as src_f:
                            snap_grp = snapshots_grp.create_group(f"iteration_{count:06d}")
                            for attr_name, attr_val in src_f.attrs.items():
                                snap_grp.attrs[attr_name] = attr_val
                            for dset_name in src_f.keys():
                                data = src_f[dset_name][:]
                                if self.config.downsample_factor > 1:
                                    data = data[::self.config.downsample_factor]
                                snap_grp.create_dataset(dset_name, data=data,
                                                        compression="gzip",
                                                        compression_opts=self.config.compression_level)
                    count += 1

            stats = self._compute_statistics(task_id, results_dir)
            stats_grp = f.create_group("statistics")
            for key, value in stats.items():
                if isinstance(value, (int, float, str)):
                    stats_grp.attrs[key] = value

        size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
        return ExportResult(
            format="hdf5",
            filepath=filepath,
            size_bytes=size,
            created_at=datetime.now().isoformat(),
            success=True
        )

    def _export_images(self, task_id: str, task_data: Dict,
                        results_dir: str, export_dir: str,
                        image_format: str) -> ExportResult:
        if not HAS_MATPLOTLIB:
            return ExportResult(
                format=image_format,
                filepath="",
                size_bytes=0,
                created_at=datetime.now().isoformat(),
                success=False,
                error_message="matplotlib not available"
            )

        images_dir = os.path.join(export_dir, "images")
        os.makedirs(images_dir, exist_ok=True)

        snapshots_dir = os.path.join(results_dir, "tasks", task_id, "snapshots")
        if not os.path.exists(snapshots_dir):
            return ExportResult(
                format=image_format,
                filepath=images_dir,
                size_bytes=0,
                created_at=datetime.now().isoformat(),
                success=False,
                error_message="No snapshots found"
            )

        saved_files = []
        for filename in sorted(os.listdir(snapshots_dir)):
            if filename.endswith(".h5"):
                filepath_h5 = os.path.join(snapshots_dir, filename)
                try:
                    with h5py.File(filepath_h5, 'r') as f:
                        iteration = f.attrs.get("iteration", 0)
                        velocity = np.array(f["velocity"])
                        pressure = np.array(f["pressure"])

                        fig, axes = plt.subplots(1, 3, figsize=(18, 5))

                        im0 = axes[0].pcolormesh(velocity[:, 0].reshape(-1, 1) if velocity.ndim == 2 else velocity[:, 0],
                                                  cmap='coolwarm')
                        axes[0].set_title(f"Velocity X - Iter {iteration}")
                        plt.colorbar(im0, ax=axes[0])

                        im1 = axes[1].pcolormesh(velocity[:, 1].reshape(-1, 1) if velocity.ndim == 2 else velocity[:, 1],
                                                  cmap='coolwarm')
                        axes[1].set_title(f"Velocity Y - Iter {iteration}")
                        plt.colorbar(im1, ax=axes[1])

                        im2 = axes[2].pcolormesh(pressure.reshape(-1, 1) if pressure.ndim == 1 else pressure,
                                                  cmap='viridis')
                        axes[2].set_title(f"Pressure - Iter {iteration}")
                        plt.colorbar(im2, ax=axes[2])

                        plt.tight_layout()
                        img_path = os.path.join(images_dir, f"field_iter_{iteration:06d}.{image_format}")
                        plt.savefig(img_path, dpi=self.config.image_dpi, bbox_inches='tight')
                        plt.close(fig)
                        saved_files.append(img_path)
                except Exception:
                    continue

        total_size = sum(os.path.getsize(f) for f in saved_files if os.path.exists(f))

        return ExportResult(
            format=image_format,
            filepath=images_dir,
            size_bytes=total_size,
            created_at=datetime.now().isoformat(),
            success=len(saved_files) > 0,
            error_message=None if saved_files else "No images generated"
        )

    def _export_vtk(self, task_id: str, task_data: Dict,
                     results_dir: str, export_dir: str) -> ExportResult:
        filepath = os.path.join(export_dir, f"{task_id}_legacy.vtk")

        snapshots_dir = os.path.join(results_dir, "tasks", task_id, "snapshots")
        if not os.path.exists(snapshots_dir):
            return ExportResult(
                format="vtk",
                filepath="",
                size_bytes=0,
                created_at=datetime.now().isoformat(),
                success=False,
                error_message="No snapshots found"
            )

        files = sorted([f for f in os.listdir(snapshots_dir) if f.endswith(".h5")])
        if not files:
            return ExportResult(
                format="vtk",
                filepath="",
                size_bytes=0,
                created_at=datetime.now().isoformat(),
                success=False,
                error_message="No h5 snapshots found"
            )

        latest_file = os.path.join(snapshots_dir, files[-1])
        with h5py.File(latest_file, 'r') as f:
            velocity = np.array(f["velocity"])
            pressure = np.array(f["pressure"])
            iteration = f.attrs.get("iteration", 0)

        with open(filepath, 'w') as f:
            f.write("# vtk DataFile Version 3.0\n")
            f.write(f"CFD Results - Task {task_id}\n")
            f.write("ASCII\n")
            f.write("DATASET UNSTRUCTURED_GRID\n")
            f.write(f"POINTS {len(velocity)} float\n")
            for i in range(len(velocity)):
                f.write(f"{i} 0 0\n")
            f.write(f"\nPOINT_DATA {len(velocity)}\n")
            f.write("VECTORS velocity float\n")
            for vel in velocity:
                f.write(f"{vel[0]} {vel[1]} 0\n")
            f.write("\nSCALARS pressure float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for p in pressure:
                f.write(f"{p}\n")

        size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
        return ExportResult(
            format="vtk",
            filepath=filepath,
            size_bytes=size,
            created_at=datetime.now().isoformat(),
            success=True
        )

    def _compute_statistics(self, task_id: str, results_dir: str) -> Dict:
        snapshots_dir = os.path.join(results_dir, "tasks", task_id, "snapshots")
        stats = {}

        if not os.path.exists(snapshots_dir):
            return stats

        all_velocities = []
        all_pressures = []
        all_temperatures = []
        iterations = []
        mass_residuals = []

        for filename in sorted(os.listdir(snapshots_dir)):
            if filename.endswith(".h5"):
                filepath_h5 = os.path.join(snapshots_dir, filename)
                try:
                    with h5py.File(filepath_h5, 'r') as f:
                        iterations.append(f.attrs.get("iteration", 0))
                        mass_residuals.append(f.attrs.get("mass_residual", 0.0))
                        vel = np.array(f["velocity"])
                        pres = np.array(f["pressure"])
                        all_velocities.append(vel)
                        all_pressures.append(pres)
                        if "temperature" in f:
                            all_temperatures.append(np.array(f["temperature"]))
                except Exception:
                    continue

        if all_velocities:
            all_vel = np.concatenate(all_velocities)
            stats["velocity_min"] = float(np.min(all_vel))
            stats["velocity_max"] = float(np.max(all_vel))
            stats["velocity_mean"] = float(np.mean(all_vel))
            stats["velocity_std"] = float(np.std(all_vel))

        if all_pressures:
            all_pres = np.concatenate(all_pressures)
            stats["pressure_min"] = float(np.min(all_pres))
            stats["pressure_max"] = float(np.max(all_pres))
            stats["pressure_mean"] = float(np.mean(all_pres))
            stats["pressure_std"] = float(np.std(all_pres))

        if all_temperatures:
            all_temp = np.concatenate(all_temperatures)
            stats["temperature_min"] = float(np.min(all_temp))
            stats["temperature_max"] = float(np.max(all_temp))
            stats["temperature_mean"] = float(np.mean(all_temp))
            stats["temperature_std"] = float(np.std(all_temp))

        if mass_residuals:
            stats["final_mass_residual"] = mass_residuals[-1]
            stats["initial_mass_residual"] = mass_residuals[0]
            stats["convergence_ratio"] = mass_residuals[-1] / max(mass_residuals[0], 1e-20)

        stats["total_snapshots"] = len(iterations)
        stats["total_iterations"] = iterations[-1] if iterations else 0

        return stats

    def export_all_tasks(self, results_dir: str,
                          task_ids: Optional[List[str]] = None) -> Dict[str, List[ExportResult]]:
        all_results = {}

        if task_ids is None:
            tasks_dir = os.path.join(results_dir, "tasks")
            if os.path.exists(tasks_dir):
                task_ids = [d for d in os.listdir(tasks_dir)
                             if os.path.isdir(os.path.join(tasks_dir, d))]
            else:
                task_ids = []

        for task_id in task_ids:
            task_data = {"task_id": task_id}
            all_results[task_id] = self.export_task(task_id, task_data, results_dir)

        return all_results

    def batch_export(self, export_requests: List[Tuple[str, Dict, str]]) -> Dict[str, List[ExportResult]]:
        results = {}
        for task_id, task_data, results_dir in export_requests:
            results[task_id] = self.export_task(task_id, task_data, results_dir)
        return results

    def get_export_history(self) -> List[ExportResult]:
        return self._export_history

    def get_export_summary(self) -> Dict:
        if not self._export_history:
            return {}

        successful = [r for r in self._export_history if r.success]
        failed = [r for r in self._export_history if not r.success]
        total_size = sum(r.size_bytes for r in successful)

        return {
            "total_exports": len(self._export_history),
            "successful": len(successful),
            "failed": len(failed),
            "total_size_mb": total_size / (1024 ** 2),
            "formats_used": list(set(r.format for r in self._export_history)),
            "latest_export": self._export_history[-1].to_dict() if self._export_history else None
        }

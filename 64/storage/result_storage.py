import os
import json
import h5py
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
import shutil
from core import FluidState
from core.convergence_checker import ResidualData


@dataclass
class StorageConfig:
    base_dir: str = "results"
    use_hdf5: bool = True
    compression: bool = True
    max_snapshots_per_file: int = 100
    save_initial_state: bool = True
    save_final_state: bool = True
    save_residual_history: bool = True
    save_mesh_data: bool = True


@dataclass
class TaskRecord:
    task_id: str
    task_name: str
    parameters: Dict[str, Any]
    created_at: str
    status: str = "running"
    final_metrics: Optional[Dict] = None
    convergence_metrics: Optional[Dict] = None
    snapshot_count: int = 0

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "task_name": self.task_name,
            "parameters": self.parameters,
            "created_at": self.created_at,
            "status": self.status,
            "final_metrics": self.final_metrics,
            "convergence_metrics": self.convergence_metrics,
            "snapshot_count": self.snapshot_count
        }


class ResultStorage:
    def __init__(self, config: Optional[StorageConfig] = None):
        self.config = config or StorageConfig()
        self._ensure_directories()
        self._task_records: Dict[str, TaskRecord] = {}
        self._load_existing_tasks()

    def _ensure_directories(self):
        os.makedirs(self.config.base_dir, exist_ok=True)
        os.makedirs(os.path.join(self.config.base_dir, "tasks"), exist_ok=True)
        os.makedirs(os.path.join(self.config.base_dir, "snapshots"), exist_ok=True)
        os.makedirs(os.path.join(self.config.base_dir, "exports"), exist_ok=True)

    def _load_existing_tasks(self):
        tasks_dir = os.path.join(self.config.base_dir, "tasks")
        for filename in os.listdir(tasks_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(tasks_dir, filename)
                try:
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                    task_id = data.get("task_id", filename.replace(".json", ""))
                    self._task_records[task_id] = TaskRecord(
                        task_id=task_id,
                        task_name=data.get("task_name", ""),
                        parameters=data.get("parameters", {}),
                        created_at=data.get("created_at", ""),
                        status=data.get("status", "unknown"),
                        final_metrics=data.get("final_metrics"),
                        convergence_metrics=data.get("convergence_metrics"),
                        snapshot_count=data.get("snapshot_count", 0)
                    )
                except Exception:
                    continue

    def initialize_task(self, task_id: str, task_name: str, parameters: Dict[str, Any]):
        task_dir = self.get_task_path(task_id)
        os.makedirs(task_dir, exist_ok=True)
        os.makedirs(os.path.join(task_dir, "snapshots"), exist_ok=True)

        record = TaskRecord(
            task_id=task_id,
            task_name=task_name,
            parameters=parameters,
            created_at=datetime.now().isoformat()
        )
        self._task_records[task_id] = record
        self._save_task_record(task_id)

    def get_task_path(self, task_id: str) -> str:
        return os.path.join(self.config.base_dir, "tasks", task_id)

    def _save_task_record(self, task_id: str):
        if task_id not in self._task_records:
            return
        record = self._task_records[task_id]
        filepath = os.path.join(self.get_task_path(task_id), "task_info.json")
        with open(filepath, 'w') as f:
            json.dump(record.to_dict(), f, indent=2)

    def save_snapshot(self, task_id: str, iteration: int, state: FluidState, residual: ResidualData):
        if task_id not in self._task_records:
            raise ValueError(f"Task {task_id} not initialized")

        task_dir = self.get_task_path(task_id)
        snapshot_dir = os.path.join(task_dir, "snapshots")

        if self.config.use_hdf5:
            self._save_snapshot_hdf5(snapshot_dir, iteration, state, residual)
        else:
            self._save_snapshot_npz(snapshot_dir, iteration, state, residual)

        self._task_records[task_id].snapshot_count += 1
        self._save_task_record(task_id)

    def _save_snapshot_hdf5(self, snapshot_dir: str, iteration: int, state: FluidState, residual: ResidualData):
        filename = os.path.join(snapshot_dir, f"snapshot_{iteration:06d}.h5")
        with h5py.File(filename, 'w') as f:
            f.attrs["iteration"] = iteration
            f.attrs["time"] = state.time
            f.attrs["mass_residual"] = residual.mass_residual
            f.attrs["momentum_residual"] = residual.momentum_residual
            f.attrs["energy_residual"] = residual.energy_residual

            f.create_dataset("velocity", data=state.velocity, compression="gzip" if self.config.compression else None)
            f.create_dataset("pressure", data=state.pressure, compression="gzip" if self.config.compression else None)
            if state.temperature is not None:
                f.create_dataset("temperature", data=state.temperature, compression="gzip" if self.config.compression else None)
            if state.density_field is not None:
                f.create_dataset("density", data=state.density_field, compression="gzip" if self.config.compression else None)

            residual_grp = f.create_group("residuals")
            for k, v in residual.residuals.items():
                residual_grp.attrs[k] = v

    def _save_snapshot_npz(self, snapshot_dir: str, iteration: int, state: FluidState, residual: ResidualData):
        filename = os.path.join(snapshot_dir, f"snapshot_{iteration:06d}.npz")
        data = {
            "velocity": state.velocity,
            "pressure": state.pressure,
            "iteration": iteration,
            "time": state.time,
            "mass_residual": residual.mass_residual,
            "momentum_residual": residual.momentum_residual,
            "energy_residual": residual.energy_residual
        }
        if state.temperature is not None:
            data["temperature"] = state.temperature
        if state.density_field is not None:
            data["density"] = state.density_field
        np.savez(filename, **data)

    def finalize_task(self, task_id: str, final_metrics: Dict, convergence_metrics: Dict):
        if task_id not in self._task_records:
            raise ValueError(f"Task {task_id} not initialized")

        record = self._task_records[task_id]
        record.status = "completed"
        record.final_metrics = final_metrics
        record.convergence_metrics = convergence_metrics
        self._save_task_record(task_id)

        self._save_summary_csv(task_id)

    def _save_summary_csv(self, task_id: str):
        task_dir = self.get_task_path(task_id)
        snapshot_dir = os.path.join(task_dir, "snapshots")

        data_rows = []
        for filename in sorted(os.listdir(snapshot_dir)):
            if filename.endswith(".h5"):
                filepath = os.path.join(snapshot_dir, filename)
                try:
                    with h5py.File(filepath, 'r') as f:
                        row = {
                            "iteration": f.attrs.get("iteration", 0),
                            "time": f.attrs.get("time", 0.0),
                            "mass_residual": f.attrs.get("mass_residual", 0.0),
                            "momentum_residual": f.attrs.get("momentum_residual", 0.0),
                            "energy_residual": f.attrs.get("energy_residual", 0.0)
                        }
                        data_rows.append(row)
                except Exception:
                    continue

        if data_rows:
            df = pd.DataFrame(data_rows)
            csv_path = os.path.join(task_dir, "residual_history.csv")
            df.to_csv(csv_path, index=False)

    def load_snapshot(self, task_id: str, iteration: int) -> Optional[Dict]:
        task_dir = self.get_task_path(task_id)
        snapshot_dir = os.path.join(task_dir, "snapshots")

        h5_path = os.path.join(snapshot_dir, f"snapshot_{iteration:06d}.h5")
        npz_path = os.path.join(snapshot_dir, f"snapshot_{iteration:06d}.npz")

        if os.path.exists(h5_path):
            return self._load_snapshot_hdf5(h5_path)
        elif os.path.exists(npz_path):
            return self._load_snapshot_npz(npz_path)
        return None

    def _load_snapshot_hdf5(self, filepath: str) -> Dict:
        with h5py.File(filepath, 'r') as f:
            data = {
                "iteration": f.attrs.get("iteration", 0),
                "time": f.attrs.get("time", 0.0),
                "mass_residual": f.attrs.get("mass_residual", 0.0),
                "momentum_residual": f.attrs.get("momentum_residual", 0.0),
                "energy_residual": f.attrs.get("energy_residual", 0.0),
                "velocity": np.array(f["velocity"]),
                "pressure": np.array(f["pressure"])
            }
            if "temperature" in f:
                data["temperature"] = np.array(f["temperature"])
            if "density" in f:
                data["density"] = np.array(f["density"])
            return data

    def _load_snapshot_npz(self, filepath: str) -> Dict:
        data = np.load(filepath, allow_pickle=True)
        return {k: data[k] for k in data.files}

    def export_task_results(self, task_id: str, export_format: str = "csv") -> str:
        task_dir = self.get_task_path(task_id)
        export_dir = os.path.join(self.config.base_dir, "exports")
        os.makedirs(export_dir, exist_ok=True)

        if export_format == "csv":
            csv_path = os.path.join(task_dir, "residual_history.csv")
            if os.path.exists(csv_path):
                export_path = os.path.join(export_dir, f"{task_id}_residuals.csv")
                shutil.copy(csv_path, export_path)
                return export_path

        task_info_path = os.path.join(task_dir, "task_info.json")
        if os.path.exists(task_info_path):
            export_path = os.path.join(export_dir, f"{task_id}_info.json")
            shutil.copy(task_info_path, export_path)
            return export_path

        return ""

    def get_all_tasks(self) -> List[TaskRecord]:
        return list(self._task_records.values())

    def get_task_summary(self, task_id: str) -> Optional[Dict]:
        if task_id not in self._task_records:
            return None
        record = self._task_records[task_id]
        return record.to_dict()

    def delete_task(self, task_id: str) -> bool:
        task_dir = self.get_task_path(task_id)
        if os.path.exists(task_dir):
            shutil.rmtree(task_dir)
        if task_id in self._task_records:
            del self._task_records[task_id]
        return True

    def get_storage_stats(self) -> Dict:
        total_size = 0
        task_count = len(self._task_records)
        total_snapshots = sum(r.snapshot_count for r in self._task_records.values())

        for dirpath, dirnames, filenames in os.walk(self.config.base_dir):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                try:
                    total_size += os.path.getsize(fp)
                except OSError:
                    pass

        return {
            "base_directory": self.config.base_dir,
            "total_size_gb": total_size / (1024 ** 3),
            "task_count": task_count,
            "total_snapshots": total_snapshots,
            "use_hdf5": self.config.use_hdf5,
            "compression": self.config.compression
        }

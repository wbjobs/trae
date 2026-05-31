#!/usr/bin/env python3
"""
后处理和可视化工具
====================
用于可视化耦合模拟结果
"""

import numpy as np
from pathlib import Path
from typing import Optional, Tuple
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable


class ResultsVisualizer:
    """结果可视化类"""

    def __init__(self, output_dir: str = "output"):
        self.output_dir = Path(output_dir)
        self.figures_dir = self.output_dir / "figures"
        self.figures_dir.mkdir(parents=True, exist_ok=True)

    def plot_power_distribution(
        self,
        power_field: np.ndarray,
        slice_axis: str = "z",
        slice_index: Optional[int] = None,
        title: str = "Power Distribution"
    ):
        """绘制功率分布"""
        if slice_index is None:
            if slice_axis == "x":
                slice_index = power_field.shape[0] // 2
            elif slice_axis == "y":
                slice_index = power_field.shape[1] // 2
            else:
                slice_index = power_field.shape[2] // 2

        fig, ax = plt.subplots(1, 1, figsize=(10, 8))

        if slice_axis == "x":
            data = power_field[slice_index, :, :]
            xlabel, ylabel = "Y", "Z"
        elif slice_axis == "y":
            data = power_field[:, slice_index, :]
            xlabel, ylabel = "X", "Z"
        else:
            data = power_field[:, :, slice_index]
            xlabel, ylabel = "X", "Y"

        im = ax.imshow(data.T, origin="lower", cmap="hot", aspect="auto")
        plt.colorbar(im, ax=ax, label="Power Density (W/m³)")

        ax.set_xlabel(xlabel)
        ax.set_ylabel(ylabel)
        ax.set_title(f"{title}\n({slice_axis} = {slice_index})")

        fig.tight_layout()
        fig.savefig(self.figures_dir / f"power_distribution_{slice_axis}_{slice_index}.png", dpi=150)
        plt.close(fig)

    def plot_temperature_field(
        self,
        temperature_field: np.ndarray,
        slice_axis: str = "z",
        slice_index: Optional[int] = None,
        title: str = "Temperature Field"
    ):
        """绘制温度场"""
        if slice_index is None:
            if slice_axis == "x":
                slice_index = temperature_field.shape[0] // 2
            elif slice_axis == "y":
                slice_index = temperature_field.shape[1] // 2
            else:
                slice_index = temperature_field.shape[2] // 2

        fig, ax = plt.subplots(1, 1, figsize=(10, 8))

        if slice_axis == "x":
            data = temperature_field[slice_index, :, :]
            xlabel, ylabel = "Y", "Z"
        elif slice_axis == "y":
            data = temperature_field[:, slice_index, :]
            xlabel, ylabel = "X", "Z"
        else:
            data = temperature_field[:, :, slice_index]
            xlabel, ylabel = "X", "Y"

        im = ax.imshow(data.T, origin="lower", cmap="RdYlBu_r", aspect="auto")
        plt.colorbar(im, ax=ax, label="Temperature (K)")

        ax.set_xlabel(xlabel)
        ax.set_ylabel(ylabel)
        ax.set_title(f"{title}\n({slice_axis} = {slice_index})")

        fig.tight_layout()
        fig.savefig(self.figures_dir / f"temperature_field_{slice_axis}_{slice_index}.png", dpi=150)
        plt.close(fig)

    def plot_convergence_history(self, history_file: str = "convergence_history.csv"):
        """绘制收敛历史"""
        import csv

        file_path = self.output_dir / history_file
        if not file_path.exists():
            print(f"Warning: {history_file} not found")
            return

        iterations = []
        power_errors = []
        temp_errors = []

        with open(file_path, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                iterations.append(int(row["iteration"]))
                power_errors.append(float(row["power_error"]))
                temp_errors.append(float(row["temperature_error"]))

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

        ax1.semilogy(iterations, power_errors, "r-o", markersize=3)
        ax1.set_xlabel("Iteration")
        ax1.set_ylabel("Power Relative Error")
        ax1.set_title("Power Convergence")
        ax1.grid(True, alpha=0.3)

        ax2.semilogy(iterations, temp_errors, "b-o", markersize=3)
        ax2.set_xlabel("Iteration")
        ax2.set_ylabel("Temperature Relative Error")
        ax2.set_title("Temperature Convergence")
        ax2.grid(True, alpha=0.3)

        fig.tight_layout()
        fig.savefig(self.figures_dir / "convergence_history.png", dpi=150)
        plt.close(fig)

    def plot_axial_profiles(
        self,
        power_field: np.ndarray,
        temperature_field: np.ndarray
    ):
        """绘制轴向分布"""
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

        z_indices = np.arange(power_field.shape[2])
        axial_power = np.mean(power_field, axis=(0, 1))
        axial_temp = np.mean(temperature_field, axis=(0, 1))

        ax1.plot(z_indices, axial_power / np.max(axial_power), "r-", linewidth=2)
        ax1.set_xlabel("Axial Node")
        ax1.set_ylabel("Normalized Power")
        ax1.set_title("Axial Power Distribution")
        ax1.grid(True, alpha=0.3)

        ax2.plot(z_indices, axial_temp, "b-", linewidth=2)
        ax2.set_xlabel("Axial Node")
        ax2.set_ylabel("Temperature (K)")
        ax2.set_title("Axial Temperature Distribution")
        ax2.grid(True, alpha=0.3)

        fig.tight_layout()
        fig.savefig(self.figures_dir / "axial_profiles.png", dpi=150)
        plt.close(fig)

    def plot_comparison(
        self,
        field1: np.ndarray,
        field2: np.ndarray,
        field1_name: str = "Field 1",
        field2_name: str = "Field 2"
    ):
        """绘制两个场的比较"""
        fig, axes = plt.subplots(1, 3, figsize=(15, 5))

        mid_z = field1.shape[2] // 2

        im1 = axes[0].imshow(field1[:, :, mid_z].T, origin="lower", cmap="RdYlBu_r")
        axes[0].set_title(field1_name)
        plt.colorbar(im1, ax=axes[0])

        im2 = axes[1].imshow(field2[:, :, mid_z].T, origin="lower", cmap="RdYlBu_r")
        axes[1].set_title(field2_name)
        plt.colorbar(im2, ax=axes[1])

        diff = np.abs(field1 - field2)
        im3 = axes[2].imshow(diff[:, :, mid_z].T, origin="lower", cmap="magma")
        axes[2].set_title("Absolute Difference")
        plt.colorbar(im3, ax=axes[2])

        for ax in axes:
            ax.set_xlabel("X")
            ax.set_ylabel("Y")

        fig.tight_layout()
        fig.savefig(self.figures_dir / "field_comparison.png", dpi=150)
        plt.close(fig)


def visualize_results(output_dir: str = "output"):
    """可视化所有结果"""
    visualizer = ResultsVisualizer(output_dir)

    results_file = Path(output_dir) / "final_results.npz"
    if results_file.exists():
        data = np.load(results_file)

        if "power_distribution" in data:
            visualizer.plot_power_distribution(data["power_distribution"])

        if "temperature_field" in data:
            visualizer.plot_temperature_field(data["temperature_field"])
            visualizer.plot_axial_profiles(
                data.get("power_distribution", np.zeros_like(data["temperature_field"])),
                data["temperature_field"]
            )

    visualizer.plot_convergence_history()

    print(f"Figures saved to: {visualizer.figures_dir}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Visualize coupled simulation results")
    parser.add_argument("--output", default="output", help="Output directory")
    args = parser.parse_args()

    visualize_results(args.output)

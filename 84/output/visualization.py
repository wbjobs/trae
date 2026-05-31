import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from enum import Enum
import logging
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
import matplotlib.dates as mdates
from mpl_toolkits.mplot3d import Axes3D

from core import (
    PropagationResult,
    OrbitDeviationAnalysis,
    ForecastResult,
    const
)
from data_io import ObservationData


class PlotType(Enum):
    """图表类型枚举"""
    ORBIT_3D = "orbit_3d"
    POSITION_TIME = "position_time"
    VELOCITY_TIME = "velocity_time"
    DEVIATION_TIME = "deviation_time"
    ELEMENT_DEVIATION = "element_deviation"
    FITTING_RESULT = "fitting_result"
    FORECAST = "forecast"
    RESIDUALS = "residuals"
    PERIODOGRAM = "periodogram"
    MULTI_BODY = "multi_body"


@dataclass
class VisualizationConfig:
    """可视化配置"""
    output_dir: str = "output"
    dpi: int = 150
    figure_size: Tuple[int, int] = (12, 8)
    style: str = "default"
    show_grid: bool = True
    show_legend: bool = True
    save_png: bool = True
    save_pdf: bool = False
    interactive: bool = False


class Visualizer:
    """结果可视化器"""
    
    def __init__(self, config: VisualizationConfig = None):
        self.config = config or VisualizationConfig()
        self.output_dir = Path(self.config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger(__name__)
        
        plt.style.use(self.config.style)
        self._colormap = plt.cm.viridis
    
    def plot_orbit_3d(
        self,
        result: PropagationResult,
        filename: Optional[str] = None,
        show_central_body: bool = True,
        central_body_radius: float = const.R_EARTH
    ) -> Path:
        """绘制3D轨道图"""
        filename = filename or f"{result.body_name}_orbit_3d"
        
        fig = plt.figure(figsize=self.config.figure_size)
        ax = fig.add_subplot(111, projection='3d')
        
        pos = result.position / 1000
        
        ax.plot(pos[:, 0], pos[:, 1], pos[:, 2], label='轨道', linewidth=1)
        ax.scatter(pos[0, 0], pos[0, 1], pos[0, 2], color='red', s=50, label='起点', zorder=5)
        ax.scatter(pos[-1, 0], pos[-1, 1], pos[-1, 2], color='green', s=50, label='终点', zorder=5)
        
        if show_central_body:
            u, v = np.mgrid[0:2*np.pi:20j, 0:np.pi:10j]
            x = central_body_radius / 1000 * np.cos(u) * np.sin(v)
            y = central_body_radius / 1000 * np.sin(u) * np.sin(v)
            z = central_body_radius / 1000 * np.cos(v)
            ax.plot_surface(x, y, z, color='blue', alpha=0.3, label='中心天体')
        
        ax.set_xlabel('X (km)')
        ax.set_ylabel('Y (km)')
        ax.set_zlabel('Z (km)')
        ax.set_title(f'{result.body_name} 轨道 - 3D视图')
        
        if self.config.show_legend:
            ax.legend()
        
        if self.config.show_grid:
            ax.grid(True)
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_position_time(
        self,
        result: PropagationResult,
        filename: Optional[str] = None
    ) -> Path:
        """绘制位置-时间图"""
        filename = filename or f"{result.body_name}_position_time"
        
        fig, axes = plt.subplots(3, 1, figsize=(self.config.figure_size[0], self.config.figure_size[1] * 1.2))
        
        time = result.time - result.time[0]
        pos = result.position / 1000
        
        labels = ['X', 'Y', 'Z']
        for i, ax in enumerate(axes):
            ax.plot(time, pos[:, i], label=f'{labels[i]} 位置')
            ax.set_ylabel(f'{labels[i]} (km)')
            if self.config.show_grid:
                ax.grid(True)
            if self.config.show_legend:
                ax.legend()
        
        axes[-1].set_xlabel('时间 (天)')
        axes[0].set_title(f'{result.body_name} 位置随时间变化')
        
        plt.tight_layout()
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_deviation_time(
        self,
        analysis: OrbitDeviationAnalysis,
        filename: Optional[str] = None,
        log_scale: bool = False
    ) -> Path:
        """绘制偏差-时间图"""
        filename = filename or f"{analysis.body_name}_deviation_time"
        
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=self.config.figure_size)
        
        time = analysis.time - analysis.time[0]
        
        ax1.plot(time, analysis.position_deviation, label='位置偏差', color='blue')
        ax1.set_ylabel('位置偏差 (m)')
        ax1.set_title(f'{analysis.body_name} 轨道摄动偏差')
        if log_scale:
            ax1.set_yscale('log')
        if self.config.show_grid:
            ax1.grid(True)
        if self.config.show_legend:
            ax1.legend()
        
        ax2.plot(time, analysis.velocity_deviation, label='速度偏差', color='red')
        ax2.set_xlabel('时间 (天)')
        ax2.set_ylabel('速度偏差 (m/s)')
        if log_scale:
            ax2.set_yscale('log')
        if self.config.show_grid:
            ax2.grid(True)
        if self.config.show_legend:
            ax2.legend()
        
        plt.tight_layout()
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_element_deviations(
        self,
        analysis: OrbitDeviationAnalysis,
        filename: Optional[str] = None
    ) -> Path:
        """绘制各轨道根数偏差图"""
        if not analysis.element_deviations:
            return Path()
        
        filename = filename or f"{analysis.body_name}_element_deviations"
        
        elements = analysis.element_deviations
        n = len(elements)
        
        fig, axes = plt.subplots(n, 1, figsize=(self.config.figure_size[0], n * 3))
        if n == 1:
            axes = [axes]
        
        time = analysis.time - analysis.time[0]
        
        element_labels = {
            'a': '半长轴 (m)',
            'e': '偏心率',
            'i': '轨道倾角 (rad)',
            'omega': '升交点赤经 (rad)',
            'w': '近心点幅角 (rad)',
            'M': '平近点角 (rad)'
        }
        
        for i, (elem_name, elem_dev in elements.items():
            ax = axes[i]
            ax.plot(time, elem_dev, label=element_labels.get(elem_name, elem_name))
            ax.set_ylabel(element_labels.get(elem_name, elem_name))
            if self.config.show_grid:
                ax.grid(True)
        
        axes[-1].set_xlabel('时间 (天)')
        axes[0].set_title(f'{analysis.body_name} 轨道根数偏差')
        
        plt.tight_layout()
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_forecast(
        self,
        forecast: ForecastResult,
        body_name: str,
        element_type: str,
        historical_time: Optional[np.ndarray] = None,
        historical_data: Optional[np.ndarray] = None,
        filename: Optional[str] = None
    ) -> Path:
        """绘制预测结果图"""
        filename = filename or f"{body_name}_{element_type}_forecast"
        
        fig, ax = plt.subplots(figsize=self.config.figure_size)
        
        if historical_time is not None and historical_data is not None:
            hist_time = historical_time - historical_time[0]
            ax.plot(hist_time, historical_data, label='历史数据', color='blue', alpha=0.7)
        
        forecast_time = forecast.time - (historical_time[0] if historical_time is not None else forecast.time[0])
        ax.plot(forecast_time, forecast.forecast, label='预测值', color='red', linewidth=2)
        ax.fill_between(
            forecast_time,
            forecast.confidence_lower,
            forecast.confidence_upper,
            color='red',
            alpha=0.2,
            label='95% 置信区间'
        )
        
        ax.set_xlabel('时间 (天)')
        ax.set_ylabel(f'{element_type} 偏差')
        ax.set_title(f'{body_name} {element_type} 偏差预测')
        
        if self.config.show_grid:
            ax.grid(True)
        if self.config.show_legend:
            ax.legend()
        
        plt.tight_layout()
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_residuals(
        self,
        residuals: np.ndarray,
        body_name: str,
        filename: Optional[str] = None
    ) -> Path:
        """绘制残差分析图"""
        filename = filename or f"{body_name}_residuals"
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=self.config.figure_size)
        
        ax1.hist(residuals, bins=50, density=True, alpha=0.7, color='blue')
        ax1.set_xlabel('残差')
        ax1.set_ylabel('概率密度')
        ax1.set_title('残差分布')
        if self.config.show_grid:
            ax1.grid(True)
        
        ax2.scatter(range(len(residuals)), residuals, alpha=0.5, s=10)
        ax2.axhline(y=0, color='red', linestyle='--')
        ax2.set_xlabel('样本索引')
        ax2.set_ylabel('残差')
        ax2.set_title('残差散点图')
        if self.config.show_grid:
            ax2.grid(True)
        
        fig.suptitle(f'{body_name} 残差分析')
        plt.tight_layout()
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_periodogram(
        self,
        analysis: OrbitDeviationAnalysis,
        filename: Optional[str] = None
    ) -> Path:
        """绘制周期图"""
        from scipy import signal
        
        filename = filename or f"{analysis.body_name}_periodogram"
        
        fig, ax = plt.subplots(figsize=self.config.figure_size)
        
        time = analysis.time
        deviation = analysis.position_deviation
        
        dt = np.median(np.diff(time)) * 86400
        f, Pxx = signal.periodogram(deviation - np.mean(deviation), fs=1/dt)
        
        ax.semilogy(f, Pxx)
        ax.set_xlabel('频率 (Hz)')
        ax.set_ylabel('功率谱密度')
        ax.set_title(f'{analysis.body_name} 周期图')
        
        if analysis.periodicity and 'dominant_frequency' in analysis.periodicity:
            dom_freq = analysis.periodicity['dominant_frequency']
            ax.axvline(x=dom_freq, color='red', linestyle='--', label=f'主导频率: {dom_freq:.2e} Hz')
            if self.config.show_legend:
                ax.legend()
        
        if self.config.show_grid:
            ax.grid(True)
        
        plt.tight_layout()
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_multi_body_orbits(
        self,
        results: Dict[str, PropagationResult],
        filename: Optional[str] = None
    ) -> Path:
        """绘制多体轨道对比图"""
        filename = filename or "multi_body_orbits"
        
        fig = plt.figure(figsize=self.config.figure_size)
        ax = fig.add_subplot(111, projection='3d')
        
        colors = self._colormap(np.linspace(0, 1, len(results)))
        
        for (name, result), color in zip(results.items(), colors):
            pos = result.position / 1000
            ax.plot(pos[:, 0], pos[:, 1], pos[:, 2], label=name, color=color, linewidth=1)
        
        ax.set_xlabel('X (km)')
        ax.set_ylabel('Y (km)')
        ax.set_zlabel('Z (km)')
        ax.set_title('多星体轨道对比')
        
        if self.config.show_legend:
            ax.legend()
        
        if self.config.show_grid:
            ax.grid(True)
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def plot_multi_body_deviations(
        self,
        analyses: Dict[str, OrbitDeviationAnalysis],
        filename: Optional[str] = None,
        log_scale: bool = False
    ) -> Path:
        """绘制多体偏差对比图"""
        filename = filename or "multi_body_deviations"
        
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=self.config.figure_size)
        
        colors = self._colormap(np.linspace(0, 1, len(analyses)))
        
        for (name, analysis), color in zip(analyses.items(), colors):
            time = analysis.time - analysis.time[0]
            ax1.plot(time, analysis.position_deviation, label=name, color=color)
            ax2.plot(time, analysis.velocity_deviation, label=name, color=color)
        
        ax1.set_ylabel('位置偏差 (m)')
        ax1.set_title('多星体位置偏差对比')
        if log_scale:
            ax1.set_yscale('log')
        if self.config.show_grid:
            ax1.grid(True)
        if self.config.show_legend:
            ax1.legend()
        
        ax2.set_xlabel('时间 (天)')
        ax2.set_ylabel('速度偏差 (m/s)')
        if log_scale:
            ax2.set_yscale('log')
        if self.config.show_grid:
            ax2.grid(True)
        
        plt.tight_layout()
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def create_dashboard(
        self,
        analysis: OrbitDeviationAnalysis,
        filename: Optional[str] = None
    ) -> Path:
        """创建综合分析仪表盘"""
        filename = filename or f"{analysis.body_name}_dashboard"
        
        fig = plt.figure(figsize=(16, 12))
        
        gs = fig.add_gridspec(3, 3, hspace=0.3, wspace=0.3)
        
        ax1 = fig.add_subplot(gs[0, :])
        time = analysis.time - analysis.time[0]
        ax1.plot(time, analysis.position_deviation, 'b-')
        ax1.set_ylabel('位置偏差 (m)')
        ax1.set_title(f'{analysis.body_name} 综合分析仪表盘')
        ax1.grid(True)
        
        ax2 = fig.add_subplot(gs[1, 0])
        ax2.plot(time, analysis.velocity_deviation, 'r-')
        ax2.set_ylabel('速度偏差 (m/s)')
        ax2.grid(True)
        
        ax3 = fig.add_subplot(gs[1, 1])
        if analysis.position_deviation is not None and len(analysis.position_deviation) > 0:
            ax3.hist(analysis.position_deviation, bins=50, alpha=0.7, color='green')
            ax3.set_xlabel('位置偏差 (m)')
            ax3.set_ylabel('频数')
            ax3.set_title('偏差分布')
        ax3.grid(True)
        
        ax4 = fig.add_subplot(gs[1, 2])
        stats = analysis.statistics
        if stats:
            stats_text = f"""
统计特征:
平均值: {stats.get('mean', 'N/A'):.2e} m
标准差: {stats.get('std', 'N/A'):.2e} m
RMSE: {stats.get('rmse', 'N/A'):.2e} m
偏度: {stats.get('skewness', 'N/A'):.2f}
峰度: {stats.get('kurtosis', 'N/A'):.2f}
        """
            ax4.text(0.1, 0.5, stats_text, fontsize=10, verticalalignment='center')
            ax4.axis('off')
            ax4.set_title('统计摘要')
        
        if analysis.periodicity:
            ax5 = fig.add_subplot(gs[2, :])
            from scipy import signal
            deviation = analysis.position_deviation
            dt = np.median(np.diff(analysis.time)) * 86400
            f, Pxx = signal.periodogram(deviation - np.mean(deviation), fs=1/dt)
            ax5.semilogy(f, Pxx)
            ax5.set_xlabel('频率 (Hz)')
            ax5.set_ylabel('功率谱密度')
            ax5.set_title('周期图分析')
            ax5.grid(True)
        
        filepath = self._save_figure(fig, filename)
        plt.close(fig)
        
        return filepath
    
    def _save_figure(self, fig: Figure, filename: str) -> Path:
        """保存图片"""
        filepath_png = self.output_dir / f"{filename}.png"
        fig.savefig(filepath_png, dpi=self.config.dpi, bbox_inches='tight')
        self.logger.info(f"已保存图表: {filepath_png}")
        
        if self.config.save_pdf:
            filepath_pdf = self.output_dir / f"{filename}.pdf"
            fig.savefig(filepath_pdf, bbox_inches='tight')
        
        return filepath_png
    
    def generate_all_plots(
        self,
        analysis: OrbitDeviationAnalysis,
        propagation_result: Optional[PropagationResult] = None
    ) -> List[Path]:
        """生成所有可用的图表"""
        filepaths = []
        
        if propagation_result:
            filepaths.append(self.plot_orbit_3d(propagation_result))
            filepaths.append(self.plot_position_time(propagation_result))
        
        filepaths.append(self.plot_deviation_time(analysis))
        filepaths.append(self.plot_element_deviations(analysis))
        filepaths.append(self.plot_periodogram(analysis))
        filepaths.append(self.create_dashboard(analysis))
        
        if analysis.fitting_results:
            for name, fitting in analysis.fitting_results.items():
                filepaths.append(self.plot_residuals(fitting.residuals, analysis.body_name, f"{analysis.body_name}_{name}_residuals"))
        
        if analysis.forecast_results:
            for elem_type, forecast in analysis.forecast_results.items():
                filepaths.append(self.plot_forecast(
                    forecast, analysis.body_name, elem_type,
                    analysis.time, analysis.position_deviation
                ))
        
        return filepaths

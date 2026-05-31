from dataclasses import dataclass, field
from typing import List, Dict, Optional
from enum import Enum

from core import PrecisionLevel, PerturbationType
from core import IntegrationMethod


@dataclass
class GlobalConfig:
    """全局配置"""
    precision: PrecisionLevel = PrecisionLevel.MEDIUM
    parallel: bool = True
    num_workers: Optional[int] = None
    log_level: str = "INFO"
    data_dir: str = "data"
    output_dir: str = "output"
    enable_logging: bool = True


@dataclass
class SimulationConfig:
    """模拟配置"""
    start_mjd: float = 51544.5
    end_mjd: float = 51544.5 + 365
    step_size: float = 600.0
    integration_method: IntegrationMethod = IntegrationMethod.RK4
    adaptive_step_size: bool = False
    tolerance: float = 1e-9
    output_interval: int = 1


@dataclass
class PerturbationConfig:
    """摄动配置"""
    enabled_perturbations: List[PerturbationType] = field(default_factory=lambda: [
        PerturbationType.J2,
        PerturbationType.THIRD_BODY_SUN,
        PerturbationType.THIRD_BODY_MOON,
    ])
    central_body_radius: float = 6378137.0
    cd: float = 2.2
    area_mass_ratio: float = 0.01


@dataclass
class OutputConfig:
    """输出配置"""
    save_csv: bool = True
    save_json: bool = True
    save_png: bool = True
    save_pdf: bool = False
    generate_report: bool = True
    report_format: str = "markdown"
    dpi: int = 150
    figure_size: tuple = (12, 8)


DEFAULT_CONFIG = GlobalConfig()
DEFAULT_SIMULATION = SimulationConfig()
DEFAULT_PERTURBATION = PerturbationConfig()
DEFAULT_OUTPUT = OutputConfig()


def get_config() -> GlobalConfig:
    """获取全局配置"""
    return DEFAULT_CONFIG


def set_precision(precision: PrecisionLevel):
    """设置全局精度级别"""
    DEFAULT_CONFIG.precision = precision

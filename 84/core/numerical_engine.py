import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Tuple, Any
from enum import Enum
import logging
from functools import partial

from .unit_conversion import const, orbital_elements_to_velocity, velocity_to_orbital_elements
from .orbit_parameters import CelestialBody, OrbitalElements, OrbitParameterImporter, create_solar_system_bodies, CentralBody
from .perturbation import PerturbationCalculator, PerturbationConfig, PerturbationType
from .batch_processor import (
    BatchOrbitPropagator, PropagationConfig, PropagationResult,
    IntegrationMethod
)
from .deviation_fitting import (
    DeviationAnalyzer, DeviationData, FittingResult, ForecastResult,
    FittingMethod, ForecastModel
)
from .interstellar_gravity import InterstellarGravityCalculator, GravityModelType
from .distributed_executor import DistributedOrbitExecutor, ComputationTask, TaskType, SchedulingStrategy
from .high_precision_kernel import HighPrecisionOrbitKernel, KernelConfig, SummationMethod, PrecisionMode
from .error_propagation import ErrorPropagationAnalyzer, UncertaintyBudgetManager
from .coordinate_systems import CoordinateConverter, ReferenceFrame, CoordinateSystem


class PrecisionLevel(Enum):
    """计算精度级别"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    ULTRA = "ultra"


PRECISION_CONFIG = {
    PrecisionLevel.LOW: {
        'step_size': 3600.0,
        'tolerance': 1e-6,
        'integration_method': IntegrationMethod.RK4,
        'perturbations': [PerturbationType.J2]
    },
    PrecisionLevel.MEDIUM: {
        'step_size': 600.0,
        'tolerance': 1e-9,
        'integration_method': IntegrationMethod.RK4,
        'perturbations': [PerturbationType.J2, PerturbationType.THIRD_BODY_SUN, PerturbationType.THIRD_BODY_MOON]
    },
    PrecisionLevel.HIGH: {
        'step_size': 60.0,
        'tolerance': 1e-12,
        'integration_method': IntegrationMethod.RK78,
        'perturbations': [
            PerturbationType.J2, PerturbationType.J3, PerturbationType.J4,
            PerturbationType.THIRD_BODY_SUN, PerturbationType.THIRD_BODY_MOON,
            PerturbationType.THIRD_BODY_PLANET
        ]
    },
    PrecisionLevel.ULTRA: {
        'step_size': 10.0,
        'tolerance': 1e-15,
        'integration_method': IntegrationMethod.RK78,
        'perturbations': [
            PerturbationType.J2, PerturbationType.J3, PerturbationType.J4,
            PerturbationType.THIRD_BODY_SUN, PerturbationType.THIRD_BODY_MOON,
            PerturbationType.THIRD_BODY_PLANET,
            PerturbationType.SOLAR_RADIATION_PRESSURE,
            PerturbationType.RELATIVISTIC
        ]
    }
}


@dataclass
class EngineConfig:
    """计算引擎配置"""
    precision: PrecisionLevel = PrecisionLevel.MEDIUM
    parallel: bool = True
    num_workers: Optional[int] = None
    enable_logging: bool = True
    log_level: str = "INFO"
    save_intermediate_results: bool = False
    intermediate_save_interval: int = 1000


@dataclass
class OrbitDeviationAnalysis:
    """轨道偏差分析结果"""
    body_name: str
    time: np.ndarray
    position_deviation: np.ndarray
    velocity_deviation: np.ndarray
    element_deviations: Dict[str, np.ndarray] = field(default_factory=dict)
    fitting_results: Dict[str, FittingResult] = field(default_factory=dict)
    forecast_results: Dict[str, ForecastResult] = field(default_factory=dict)
    statistics: Dict = field(default_factory=dict)
    periodicity: Dict = field(default_factory=dict)


class HighPrecisionOrbitEngine:
    """高精度轨道计算引擎"""
    
    def __init__(self, config: EngineConfig = None):
        self.config = config or EngineConfig()
        self.logger = self._setup_logger()
        
        precision_config = PRECISION_CONFIG[self.config.precision]
        
        self.perturbation_config = PerturbationConfig(
            enabled_perturbations=precision_config['perturbations']
        )
        
        self.propagation_config_template = PropagationConfig(
            start_mjd=const.MJD_J2000,
            end_mjd=const.MJD_J2000 + 365,
            step_size=precision_config['step_size'],
            integration_method=precision_config['integration_method'],
            tolerance=precision_config['tolerance'],
            adaptive_step_size=True
        )
        
        self.importer = OrbitParameterImporter()
        self.propagator = BatchOrbitPropagator(
            self.perturbation_config,
            self.config.num_workers
        )
        self.analyzer = DeviationAnalyzer()
        
        self.solar_system = create_solar_system_bodies()
        self.propagator.set_third_bodies(self.solar_system)
        
        self.target_bodies: Dict[str, CelestialBody] = {}
        self.analysis_results: Dict[str, OrbitDeviationAnalysis] = {}
        
        self.interstellar_gravity = InterstellarGravityCalculator()
        self.distributed_executor = DistributedOrbitExecutor(
            num_workers=self.config.num_workers,
            scheduling_strategy=SchedulingStrategy.PARALLEL
        )
        kernel_config = KernelConfig(
            precision_mode=PrecisionMode.DOUBLE,
            summation_method=SummationMethod.KAHAN
        )
        self.high_precision_kernel = HighPrecisionOrbitKernel(kernel_config)
        self.error_analyzer = ErrorPropagationAnalyzer()
        self.uncertainty_manager = UncertaintyBudgetManager()
        self.coordinate_converter = CoordinateConverter()
        self.reference_frame = ReferenceFrame(
            converter=self.coordinate_converter,
            current_frame=CoordinateSystem.ICRF,
            current_epoch=const.MJD_J2000
        )
        
        self.logger.info(f"计算引擎初始化完成，精度级别: {self.config.precision.value}")
    
    def _setup_logger(self) -> logging.Logger:
        """设置日志记录器"""
        logger = logging.getLogger('OrbitEngine')
        if self.config.enable_logging:
            logger.setLevel(getattr(logging, self.config.log_level, logging.INFO))
            if not logger.handlers:
                handler = logging.StreamHandler()
                formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                )
                handler.setFormatter(formatter)
                logger.addHandler(handler)
        return logger
    
    def add_target_body(self, body: CelestialBody):
        """添加目标天体"""
        self.target_bodies[body.name] = body
        self.logger.info(f"添加目标天体: {body.name}")
    
    def add_target_bodies(self, bodies: List[CelestialBody]):
        """批量添加目标天体"""
        for body in bodies:
            self.add_target_body(body)
    
    def load_bodies_from_csv(self, filepath: str):
        """从CSV文件加载天体"""
        bodies = self.importer.import_from_csv(filepath)
        self.add_target_bodies(bodies)
        self.logger.info(f"从CSV文件加载了 {len(bodies)} 个天体")
    
    def set_precision(self, precision: PrecisionLevel):
        """设置计算精度"""
        self.config.precision = precision
        precision_config = PRECISION_CONFIG[precision]
        
        self.perturbation_config.enabled_perturbations = precision_config['perturbations']
        self.propagation_config_template.step_size = precision_config['step_size']
        self.propagation_config_template.integration_method = precision_config['integration_method']
        self.propagation_config_template.tolerance = precision_config['tolerance']
        
        self.propagator = BatchOrbitPropagator(
            self.perturbation_config,
            self.config.num_workers
        )
        self.propagator.set_third_bodies(self.solar_system)
        
        self.logger.info(f"精度级别已更新为: {precision.value}")
    
    def propagate(
        self,
        body_name: str,
        start_mjd: float,
        end_mjd: float,
        include_perturbations: bool = True
    ) -> PropagationResult:
        """传播单个天体轨道"""
        if body_name not in self.target_bodies:
            raise ValueError(f"未找到天体: {body_name}")
        
        body = self.target_bodies[body_name]
        
        config = PropagationConfig(
            start_mjd=start_mjd,
            end_mjd=end_mjd,
            step_size=self.propagation_config_template.step_size,
            integration_method=self.propagation_config_template.integration_method,
            include_perturbations=include_perturbations,
            tolerance=self.propagation_config_template.tolerance,
            adaptive_step_size=self.propagation_config_template.adaptive_step_size
        )
        
        self.logger.info(f"开始传播天体 {body_name}，从 MJD {start_mjd} 到 {end_mjd}")
        result = self.propagator.propagate_body(body, config)
        self.logger.info(f"传播完成，共 {len(result.time)} 个时间步")
        
        return result
    
    def propagate_all(
        self,
        start_mjd: float,
        end_mjd: float,
        include_perturbations: bool = True
    ) -> Dict[str, PropagationResult]:
        """传播所有目标天体"""
        bodies = list(self.target_bodies.values())
        
        config = PropagationConfig(
            start_mjd=start_mjd,
            end_mjd=end_mjd,
            step_size=self.propagation_config_template.step_size,
            integration_method=self.propagation_config_template.integration_method,
            include_perturbations=include_perturbations,
            tolerance=self.propagation_config_template.tolerance,
            adaptive_step_size=self.propagation_config_template.adaptive_step_size
        )
        
        self.logger.info(f"开始批量传播 {len(bodies)} 个天体")
        results = self.propagator.propagate_multiple_bodies(
            bodies, config, parallel=self.config.parallel
        )
        self.logger.info(f"批量传播完成")
        
        return results
    
    def propagate_long_term(
        self,
        body_name: str,
        start_mjd: float,
        end_mjd: float,
        segments: int = 100,
        include_perturbations: bool = True
    ) -> PropagationResult:
        """长周期轨道传播"""
        if body_name not in self.target_bodies:
            raise ValueError(f"未找到天体: {body_name}")
        
        body = self.target_bodies[body_name]
        
        config = PropagationConfig(
            start_mjd=start_mjd,
            end_mjd=end_mjd,
            step_size=self.propagation_config_template.step_size,
            integration_method=self.propagation_config_template.integration_method,
            include_perturbations=include_perturbations,
            tolerance=self.propagation_config_template.tolerance,
            adaptive_step_size=self.propagation_config_template.adaptive_step_size
        )
        
        self.logger.info(f"开始长周期传播天体 {body_name}，从 MJD {start_mjd} 到 {end_mjd}，共 {segments} 段")
        result = self.propagator.propagate_long_term(body, config, segments)
        self.logger.info(f"长周期传播完成，共 {len(result.time)} 个时间步")
        
        return result
    
    def compute_orbit_deviation(
        self,
        body_name: str,
        start_mjd: float,
        end_mjd: float,
        reference_perturbations: bool = False
    ) -> OrbitDeviationAnalysis:
        """计算轨道摄动偏差"""
        self.logger.info(f"开始计算天体 {body_name} 的轨道摄动偏差")
        
        ref_result = self.propagate(body_name, start_mjd, end_mjd, include_perturbations=False)
        pert_result = self.propagate(body_name, start_mjd, end_mjd, include_perturbations=True)
        
        common_time, pos_dev, vel_dev = self.propagator.compute_deviations(
            ref_result, pert_result
        )
        
        analysis = OrbitDeviationAnalysis(
            body_name=body_name,
            time=common_time,
            position_deviation=pos_dev,
            velocity_deviation=vel_dev
        )
        
        self.analyzer.add_deviation_data(
            key=f"{body_name}_position",
            time=common_time,
            deviation=pos_dev,
            body_name=body_name,
            element_type="position"
        )
        
        element_deviations = self._compute_element_deviations(ref_result, pert_result)
        analysis.element_deviations = element_deviations
        
        analysis.statistics = self.analyzer.calculate_statistics(
            self.analyzer.deviations[f"{body_name}_position"]
        )
        
        analysis.periodicity = self.analyzer.analyze_periodicity(
            self.analyzer.deviations[f"{body_name}_position"]
        )
        
        self.analysis_results[body_name] = analysis
        self.logger.info(f"轨道偏差计算完成")
        
        return analysis
    
    def _compute_element_deviations(
        self,
        ref_result: PropagationResult,
        pert_result: PropagationResult
    ) -> Dict[str, np.ndarray]:
        """计算各轨道根数的偏差"""
        deviations = {}
        element_names = ['a', 'e', 'i', 'omega', 'w', 'M']
        
        ref_elements = np.array([
            velocity_to_orbital_elements(
                ref_result.position[i], ref_result.velocity[i],
                const.GM_EARTH
            )
            for i in range(len(ref_result.time))
        ])
        
        pert_elements = np.array([
            velocity_to_orbital_elements(
                pert_result.position[i], pert_result.velocity[i],
                const.GM_EARTH
            )
            for i in range(len(pert_result.time))
        ])
        
        for idx, name in enumerate(element_names):
            ref_vals = ref_elements[:, idx]
            pert_vals = pert_elements[:, idx]
            
            common_time = np.intersect1d(ref_result.time, pert_result.time)
            ref_interp = np.interp(common_time, ref_result.time, ref_vals)
            pert_interp = np.interp(common_time, pert_result.time, pert_vals)
            
            deviations[name] = np.abs(pert_interp - ref_interp)
        
        return deviations
    
    def fit_deviation(
        self,
        body_name: str,
        element_type: str = "position",
        methods: Optional[List[FittingMethod]] = None
    ) -> Dict[str, FittingResult]:
        """对偏差数据进行拟合"""
        key = f"{body_name}_{element_type}"
        if key not in self.analyzer.deviations:
            raise ValueError(f"未找到偏差数据: {key}")
        
        results = self.analyzer.auto_fit(key, preprocess=True)
        
        if body_name in self.analysis_results:
            self.analysis_results[body_name].fitting_results = results
        
        return results
    
    def forecast_deviation(
        self,
        body_name: str,
        element_type: str,
        forecast_horizon: float,
        model: ForecastModel = ForecastModel.TREND_EXTRAPOLATION
    ) -> ForecastResult:
        """预测偏差发展趋势"""
        key = f"{body_name}_{element_type}"
        if key not in self.analyzer.deviations:
            raise ValueError(f"未找到偏差数据: {key}")
        
        data = self.analyzer.deviations[key]
        last_time = data.time[-1]
        forecast_times = np.linspace(last_time, last_time + forecast_horizon, 1000)
        
        if model == ForecastModel.FOURIER_EXTRAPOLATION:
            result = self.analyzer.forecast_fourier(data, forecast_times)
        else:
            result = self.analyzer.forecast_trend(data, forecast_times, model)
        
        if body_name in self.analysis_results:
            self.analysis_results[body_name].forecast_results[element_type] = result
        
        return result
    
    def calibrate_results(
        self,
        body_name: str,
        observation_times: np.ndarray,
        observed_positions: np.ndarray,
        observation_uncertainties: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """利用观测数据校准计算结果"""
        if body_name not in self.propagator.results:
            raise ValueError(f"未找到天体 {body_name} 的传播结果")
        
        result = self.propagator.results[body_name]
        
        observation_times = np.asarray(observation_times, dtype=np.float64)
        observed_positions = np.asarray(observed_positions, dtype=np.float64)
        
        predicted_positions = np.zeros_like(observed_positions)
        for i in range(3):
            predicted_positions[:, i] = np.interp(
                observation_times, result.time, result.position[:, i]
            )
        
        residuals = observed_positions - predicted_positions
        residual_norms = np.linalg.norm(residuals, axis=1)
        
        with np.errstate(divide='ignore', invalid='ignore'):
            ratios = np.where(
                np.abs(predicted_positions) > 1e-10,
                observed_positions / predicted_positions,
                1.0
            )
            correction_factor = np.mean(ratios, axis=0)
        
        correction_factor = np.nan_to_num(correction_factor, nan=1.0, posinf=1.0, neginf=1.0)
        
        if len(residual_norms) == 0:
            mean_residual = 0.0
            std_residual = 0.0
            max_residual = 0.0
            rmse = 0.0
        else:
            mean_residual = float(np.mean(residual_norms))
            std_residual = float(np.std(residual_norms)) if len(residual_norms) > 1 else 0.0
            max_residual = float(np.max(residual_norms))
            rmse = float(np.sqrt(np.mean(residual_norms ** 2)))
        
        calibration = {
            'mean_residual': mean_residual,
            'std_residual': std_residual,
            'max_residual': max_residual,
            'rmse': rmse,
            'residuals': residuals,
            'residual_norms': residual_norms,
            'correction_factor': correction_factor
        }
        
        self.logger.info(
            f"校准完成 - 平均残差: {calibration['mean_residual']:.3f} m, "
            f"RMSE: {calibration['rmse']:.3f} m"
        )
        
        return calibration
    
    def multi_body_simulation(
        self,
        body_names: List[str],
        start_mjd: float,
        end_mjd: float,
        mutual_perturbation: bool = True
    ) -> Dict[str, PropagationResult]:
        """多星体同步轨道演算"""
        self.logger.info(f"开始多星体同步模拟，共 {len(body_names)} 个天体")
        
        results = {}
        valid_names = [name for name in body_names if name in self.target_bodies]
        
        if len(valid_names) == 0:
            self.logger.error("没有有效的天体名称，无法进行模拟")
            return results
        
        original_third_bodies = self.propagator.perturbation_calculator.third_bodies.copy()
        
        try:
            for body_name in valid_names:
                if mutual_perturbation:
                    other_bodies = {
                        name: self.target_bodies[name]
                        for name in valid_names if name != body_name
                    }
                    combined_third_bodies = {**self.solar_system, **other_bodies}
                    self.propagator.set_third_bodies(combined_third_bodies)
                
                try:
                    results[body_name] = self.propagate(body_name, start_mjd, end_mjd)
                except Exception as e:
                    self.logger.error(f"模拟天体 {body_name} 时出错: {e}")
                    continue
        finally:
            self.propagator.set_third_bodies(original_third_bodies)
        
        self.logger.info(f"多星体同步模拟完成，成功模拟 {len(results)} 个天体")
        return results
    
    def long_term_deviation_analysis(
        self,
        body_name: str,
        start_mjd: float,
        end_mjd: float,
        forecast_years: float = 10.0
    ) -> OrbitDeviationAnalysis:
        """长周期偏差分析与预测"""
        self.logger.info(f"开始天体 {body_name} 的长周期偏差分析")
        
        analysis = self.compute_orbit_deviation(body_name, start_mjd, end_mjd)
        
        self.fit_deviation(body_name, "position")
        
        forecast_days = forecast_years * 365.25
        self.forecast_deviation(body_name, "position", forecast_days)
        self.forecast_deviation(body_name, "position", forecast_days, ForecastModel.FOURIER_EXTRAPOLATION)
        
        self.logger.info("长周期偏差分析完成")
        return analysis
    
    def batch_analysis(
        self,
        body_names: List[str],
        start_mjd: float,
        end_mjd: float,
        parallel: bool = True
    ) -> Dict[str, OrbitDeviationAnalysis]:
        """批量分析多个天体的轨道偏差"""
        results = {}
        
        if parallel and len(body_names) > 1:
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.config.num_workers) as executor:
                future_to_body = {
                    executor.submit(
                        self.compute_orbit_deviation,
                        name, start_mjd, end_mjd
                    ): name
                    for name in body_names
                }
                
                for future in concurrent.futures.as_completed(future_to_body):
                    name = future_to_body[future]
                    try:
                        results[name] = future.result()
                    except Exception as e:
                        self.logger.error(f"分析天体 {name} 时出错: {e}")
        else:
            for name in body_names:
                try:
                    results[name] = self.compute_orbit_deviation(name, start_mjd, end_mjd)
                except Exception as e:
                    self.logger.error(f"分析天体 {name} 时出错: {e}")
        
        return results
    
    def get_engine_status(self) -> Dict[str, Any]:
        """获取引擎状态"""
        return {
            'precision': self.config.precision.value,
            'parallel': self.config.parallel,
            'num_workers': self.config.num_workers,
            'target_bodies': list(self.target_bodies.keys()),
            'solar_system_bodies': list(self.solar_system.keys()),
            'enabled_perturbations': [p.name for p in self.perturbation_config.enabled_perturbations],
            'integration_method': self.propagation_config_template.integration_method.value,
            'step_size': self.propagation_config_template.step_size,
            'tolerance': self.propagation_config_template.tolerance,
            'analysis_results': list(self.analysis_results.keys()),
            'reference_frame': {
                'current_frame': self.reference_frame.current_frame.name,
                'current_epoch': self.reference_frame.current_epoch
            },
            'high_precision_kernel': {
                'precision_mode': self.high_precision_kernel.config.precision_mode.name,
                'summation_method': self.high_precision_kernel.config.summation_method.name
            },
            'distributed_executor': {
                'scheduling_strategy': self.distributed_executor.scheduler.strategy.name,
                'available_workers': self.distributed_executor.num_workers
            }
        }
    
    def clear_all(self):
        """清空所有数据"""
        self.target_bodies.clear()
        self.propagator.clear_results()
        self.analysis_results.clear()
        self.analyzer.deviations.clear()
        self.analyzer.fitting_results.clear()
        self.analyzer.forecasts.clear()
        self.logger.info("已清空所有数据")
    
    def compute_interstellar_gravity(
        self,
        target_body: CelestialBody,
        source_bodies: Optional[List[CelestialBody]] = None,
        time_mjd: Optional[float] = None,
        model_type: GravityModelType = GravityModelType.NEWTONIAN
    ) -> np.ndarray:
        """计算星际引力耦合叠加
        
        Args:
            target_body: 目标天体
            source_bodies: 引力源天体列表（默认使用太阳系天体）
            time_mjd: 儒略日时间（默认使用J2000）
            model_type: 引力模型类型
            
        Returns:
            引力加速度矢量 (m/s²)
        """
        if source_bodies is None:
            source_bodies = list(self.solar_system.values())
        
        if time_mjd is None:
            time_mjd = const.MJD_J2000
        
        source_positions = []
        source_masses = []
        for body in source_bodies:
            if body.name != target_body.name:
                pos = body.get_position_at_mjd(time_mjd) if hasattr(body, 'get_position_at_mjd') else body.position
                source_positions.append(pos)
                source_masses.append(body.mass)
        
        target_pos = target_body.get_position_at_mjd(time_mjd) if hasattr(target_body, 'get_position_at_mjd') else target_body.position
        target_vel = target_body.velocity if hasattr(target_body, 'velocity') else None
        
        acceleration = self.interstellar_gravity.compute_total_gravity(
            target_pos=target_pos,
            target_vel=target_vel,
            source_bodies=source_bodies,
            time_mjd=time_mjd,
            model_type=model_type
        )
        
        self.logger.info(f"计算完成 {target_body.name} 的星际引力，加速度大小: {np.linalg.norm(acceleration):.6e} m/s²")
        
        return acceleration
    
    def execute_distributed_propagation(
        self,
        body_names: List[str],
        start_mjd: float,
        end_mjd: float,
        num_chunks: Optional[int] = None,
        include_perturbations: bool = True
    ) -> Dict[str, Any]:
        """分布式执行多体轨道传播
        
        Args:
            body_names: 天体名称列表
            start_mjd: 开始时间
            end_mjd: 结束时间
            num_chunks: 任务块数量
            include_perturbations: 是否包含摄动
            
        Returns:
            分布式执行结果
        """
        tasks = []
        for name in body_names:
            if name not in self.target_bodies:
                self.logger.warning(f"跳过未找到的天体: {name}")
                continue
            
            config = PropagationConfig(
                start_mjd=start_mjd,
                end_mjd=end_mjd,
                step_size=self.propagation_config_template.step_size,
                integration_method=self.propagation_config_template.integration_method,
                include_perturbations=include_perturbations,
                tolerance=self.propagation_config_template.tolerance,
                adaptive_step_size=self.propagation_config_template.adaptive_step_size
            )
            
            tasks.append(ComputationTask(
                task_id=f"propagate_{name}",
                task_type=TaskType.ORBIT_PROPAGATION,
                body=self.target_bodies[name],
                config=config,
                priority=1
            ))
        
        self.logger.info(f"开始分布式执行 {len(tasks)} 个传播任务")
        results = self.distributed_executor.execute_distributed(
            tasks=tasks,
            engine=self,
            num_chunks=num_chunks
        )
        self.logger.info(f"分布式执行完成")
        
        return results
    
    def compute_uncertainty_analysis(
        self,
        body_name: str,
        start_mjd: float,
        end_mjd: float,
        parameter_uncertainties: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """计算传播结果的不确定度分析
        
        Args:
            body_name: 天体名称
            start_mjd: 开始时间
            end_mjd: 结束时间
            parameter_uncertainties: 参数不确定度字典
            
        Returns:
            不确定度分析结果
        """
        if body_name not in self.target_bodies:
            raise ValueError(f"未找到天体: {body_name}")
        
        body = self.target_bodies[body_name]
        
        if parameter_uncertainties is None:
            parameter_uncertainties = {
                'semi_major_axis': 1e-6,
                'eccentricity': 1e-8,
                'inclination': 1e-8,
                'gm_central': 1e-6
            }
        
        nominal_params = {
            'semi_major_axis': body.elements.a if hasattr(body, 'elements') else body.semi_major_axis,
            'eccentricity': body.elements.e if hasattr(body, 'elements') else body.eccentricity,
            'inclination': body.elements.i if hasattr(body, 'elements') else body.inclination,
            'gm_central': const.GM_EARTH
        }
        
        self.uncertainty_manager.set_parameters(nominal_params, parameter_uncertainties)
        
        def propagation_func(params):
            try:
                test_body = body.copy()
                if hasattr(test_body, 'elements'):
                    test_body.elements.a = params['semi_major_axis']
                    test_body.elements.e = params['eccentricity']
                    test_body.elements.i = params['inclination']
                result = self.propagator.propagate_body(
                    test_body,
                    PropagationConfig(
                        start_mjd=start_mjd,
                        end_mjd=end_mjd,
                        step_size=self.propagation_config_template.step_size,
                        integration_method=self.propagation_config_template.integration_method,
                        include_perturbations=True
                    )
                )
                return result.position[-1]
            except Exception:
                return np.array([np.nan, np.nan, np.nan])
        
        mc_result = self.error_analyzer.monte_carlo_propagation(
            func=propagation_func,
            nominal_parameters=nominal_params,
            parameter_uncertainties=parameter_uncertainties,
            num_samples=500
        )
        
        analysis = {
            'mean_position': mc_result[0],
            'std_position': mc_result[1],
            'sensitivity_indices': mc_result[2],
            'uncertainty_budget': self.uncertainty_manager.budget
        }
        
        self.logger.info(f"完成 {body_name} 的不确定度分析，位置不确定度: {np.linalg.norm(analysis['std_position']):.6e} m")
        
        return analysis
    
    def transform_coordinates(
        self,
        position: np.ndarray,
        source_system: CoordinateSystem,
        target_system: CoordinateSystem,
        mjd: Optional[float] = None
    ) -> np.ndarray:
        """坐标系统转换
        
        Args:
            position: 位置矢量
            source_system: 源坐标系
            target_system: 目标坐标系
            mjd: 儒略日时间
            
        Returns:
            转换后的位置矢量
        """
        if mjd is None:
            mjd = const.MJD_J2000
        
        transformed = self.coordinate_converter.convert(
            position=position,
            source_system=source_system,
            target_system=target_system,
            mjd=mjd
        )
        
        return transformed
    
    def update_reference_frame(
        self,
        new_frame: Optional[CoordinateSystem] = None,
        new_epoch: Optional[float] = None
    ):
        """更新参考架
        
        Args:
            new_frame: 新的坐标系统
            new_epoch: 新的历元
        """
        if new_frame is not None:
            self.reference_frame.current_frame = new_frame
            self.logger.info(f"参考架已更新为: {new_frame.name}")
        
        if new_epoch is not None:
            self.reference_frame.current_epoch = new_epoch
            self.logger.info(f"参考架历元已更新为: MJD {new_epoch}")

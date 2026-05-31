import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Tuple, Any
from enum import Enum
import concurrent.futures
from multiprocessing import cpu_count
import logging
from .orbit_parameters import CelestialBody, OrbitalElements
from .perturbation import PerturbationCalculator, PerturbationConfig


class IntegrationMethod(Enum):
    """数值积分方法枚举"""
    EULER = "euler"
    RK4 = "rk4"
    RK78 = "rk78"
    VERLET = "verlet"
    ADAMS_BASHFORTH = "adams_bashforth"


@dataclass
class PropagationConfig:
    """轨道传播配置"""
    start_mjd: float
    end_mjd: float
    step_size: float
    integration_method: IntegrationMethod = IntegrationMethod.RK4
    include_perturbations: bool = True
    adaptive_step_size: bool = False
    tolerance: float = 1e-9
    output_interval: int = 1
    max_iterations: int = 10000000


@dataclass
class PropagationResult:
    """轨道传播结果"""
    body_name: str
    time: np.ndarray
    position: np.ndarray
    velocity: np.ndarray
    elements: Optional[List[OrbitalElements]] = None
    perturbations: Optional[List[Dict]] = None
    metadata: Dict = field(default_factory=dict)


class BatchOrbitPropagator:
    """批量轨道传播器"""
    
    def __init__(
        self,
        perturbation_config: PerturbationConfig = None,
        num_workers: int = None
    ):
        self.perturbation_calculator = PerturbationCalculator(perturbation_config)
        self.num_workers = num_workers or max(1, cpu_count() - 1)
        self.results: Dict[str, PropagationResult] = {}
        self.logger = logging.getLogger(__name__)
    
    def set_third_bodies(self, bodies: Dict[str, CelestialBody]):
        """设置第三体引力源"""
        self.perturbation_calculator.set_third_bodies(bodies)
    
    def _derivatives(
        self,
        state: np.ndarray,
        t: float,
        mjd: float,
        gm: float,
        config: PropagationConfig
    ) -> np.ndarray:
        """计算状态导数（带数值保护）"""
        r = np.asarray(state[:3], dtype=np.float64)
        v = np.asarray(state[3:], dtype=np.float64)
        
        r_mag = np.linalg.norm(r)
        if r_mag < 1e-6:
            return np.zeros(6, dtype=np.float64)
        
        r_mag_cubed = r_mag ** 3
        if r_mag_cubed < 1e-18:
            return np.zeros(6, dtype=np.float64)
        
        acc_kepler = -gm * r / r_mag_cubed
        
        if np.any(np.isnan(acc_kepler)) or np.any(np.isinf(acc_kepler)):
            return np.zeros(6, dtype=np.float64)
        
        if config.include_perturbations:
            try:
                pert_acc = self.perturbation_calculator.calculate_total_acceleration(
                    r, v, mjd, gm
                )
                acc_total = acc_kepler + pert_acc.total
            except Exception:
                acc_total = acc_kepler
        else:
            acc_total = acc_kepler
        
        if np.any(np.isnan(acc_total)) or np.any(np.isinf(acc_total)):
            acc_total = np.nan_to_num(acc_total, nan=0.0, posinf=0.0, neginf=0.0)
        
        result = np.concatenate([v, acc_total]).astype(np.float64)
        
        return result
    
    def _integrate_rk4(
        self,
        state0: np.ndarray,
        t0: float,
        dt: float,
        mjd0: float,
        gm: float,
        config: PropagationConfig
    ) -> np.ndarray:
        """四阶龙格-库塔积分"""
        mjd = mjd0 + t0 / 86400.0
        
        k1 = self._derivatives(state0, t0, mjd, gm, config)
        k2 = self._derivatives(state0 + 0.5 * dt * k1, t0 + 0.5 * dt, mjd, gm, config)
        k3 = self._derivatives(state0 + 0.5 * dt * k2, t0 + 0.5 * dt, mjd, gm, config)
        k4 = self._derivatives(state0 + dt * k3, t0 + dt, mjd, gm, config)
        
        return state0 + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
    
    def _integrate_rk78(
        self,
        state0: np.ndarray,
        t0: float,
        dt: float,
        mjd0: float,
        gm: float,
        config: PropagationConfig,
        _depth: int = 0
    ) -> np.ndarray:
        """RK78 Fehlberg积分（自适应步长）"""
        MAX_RECURSION_DEPTH = 50
        MIN_STEP_RATIO = 0.01
        
        if _depth > MAX_RECURSION_DEPTH:
            self.logger.warning(f"RK78积分达到最大递归深度 {MAX_RECURSION_DEPTH}，使用当前步长继续")
            k = np.zeros((13, 6))
            mjd = mjd0 + t0 / 86400.0
            c = np.array([0, 2/27, 1/9, 1/6, 5/12, 1/2, 5/6, 1/6, 2/3, 1/3, 1, 0, 1])
            a = [
                [],
                [2/27],
                [1/36, 1/12],
                [1/24, 0, 1/8],
                [5/12, 0, -25/16, 25/16],
                [1/20, 0, 0, 1/4, 1/5],
                [-25/108, 0, 0, 125/108, -65/27, 125/54],
                [31/300, 0, 0, 0, 61/225, -2/9, 13/900],
                [2, 0, 0, -53/6, 704/45, -107/9, 67/90, 3],
                [-91/108, 0, 0, 23/108, -976/135, 311/54, -19/60, 17/6, -1/12],
                [2383/4100, 0, 0, -341/164, 4496/1025, -301/82, 2133/4100, 45/82, 45/164, 18/41],
                [3/205, 0, 0, 0, 0, -6/41, -3/205, -3/41, 3/41, 6/41, 0],
                [-1777/4100, 0, 0, -341/164, 4496/1025, -289/82, 2193/4100, 51/82, 33/164, 12/41, 0, 1]
            ]
            for i in range(13):
                state_i = state0.copy()
                for j in range(i):
                    state_i += dt * a[i][j] * k[j]
                k[i] = self._derivatives(state_i, t0 + c[i] * dt, mjd, gm, config)
            b8 = np.array([0, 0, 0, 0, 0, 34/105, 9/35, 9/35, 9/280, 9/280, 0, 41/840, 41/840])
            return state0 + dt * np.dot(b8, k)
        
        c = np.array([0, 2/27, 1/9, 1/6, 5/12, 1/2, 5/6, 1/6, 2/3, 1/3, 1, 0, 1])
        a = [
            [],
            [2/27],
            [1/36, 1/12],
            [1/24, 0, 1/8],
            [5/12, 0, -25/16, 25/16],
            [1/20, 0, 0, 1/4, 1/5],
            [-25/108, 0, 0, 125/108, -65/27, 125/54],
            [31/300, 0, 0, 0, 61/225, -2/9, 13/900],
            [2, 0, 0, -53/6, 704/45, -107/9, 67/90, 3],
            [-91/108, 0, 0, 23/108, -976/135, 311/54, -19/60, 17/6, -1/12],
            [2383/4100, 0, 0, -341/164, 4496/1025, -301/82, 2133/4100, 45/82, 45/164, 18/41],
            [3/205, 0, 0, 0, 0, -6/41, -3/205, -3/41, 3/41, 6/41, 0],
            [-1777/4100, 0, 0, -341/164, 4496/1025, -289/82, 2193/4100, 51/82, 33/164, 12/41, 0, 1]
        ]
        b7 = np.array([41/840, 0, 0, 0, 0, 34/105, 9/35, 9/35, 9/280, 9/280, 41/840, 0, 0])
        b8 = np.array([0, 0, 0, 0, 0, 34/105, 9/35, 9/35, 9/280, 9/280, 0, 41/840, 41/840])
        
        k = np.zeros((13, 6))
        mjd = mjd0 + t0 / 86400.0
        
        for i in range(13):
            state_i = state0.copy()
            for j in range(i):
                state_i += dt * a[i][j] * k[j]
            k[i] = self._derivatives(state_i, t0 + c[i] * dt, mjd, gm, config)
        
        y7 = state0 + dt * np.dot(b7, k)
        y8 = state0 + dt * np.dot(b8, k)
        
        err = np.linalg.norm(y8 - y7)
        
        if config.adaptive_step_size and err > config.tolerance:
            dt_new = dt * 0.9 * (config.tolerance / err) ** 0.2
            min_dt = dt * MIN_STEP_RATIO
            dt_new = max(dt_new, min_dt)
            return self._integrate_rk78(state0, t0, dt_new, mjd0, gm, config, _depth + 1)
        
        return y8
    
    def _integrate_verlet(
        self,
        state: np.ndarray,
        prev_state: np.ndarray,
        t: float,
        dt: float,
        mjd0: float,
        gm: float,
        config: PropagationConfig
    ) -> np.ndarray:
        """Verlet积分（适合保守系统）"""
        mjd = mjd0 + t / 86400.0
        
        r = state[:3]
        v = state[3:]
        
        acc = self._derivatives(state, t, mjd, gm, config)[3:]
        
        r_new = 2 * r - prev_state[:3] + acc * dt ** 2
        
        state_new = state.copy()
        state_new[:3] = r_new
        
        acc_new = self._derivatives(state_new, t + dt, mjd, gm, config)[3:]
        
        v_new = (r_new - prev_state[:3]) / (2 * dt)
        
        return np.concatenate([r_new, v_new])
    
    def propagate_body(
        self,
        body: CelestialBody,
        config: PropagationConfig
    ) -> PropagationResult:
        """传播单个天体的轨道"""
        if body.elements is None:
            raise ValueError(f"天体 {body.name} 没有轨道元素")
        
        from .unit_conversion import orbital_elements_to_velocity
        
        r0, v0 = orbital_elements_to_velocity(
            body.elements.a, body.elements.e, body.elements.i,
            body.elements.omega, body.elements.w, body.elements.M,
            body.elements.gm
        )
        
        state0 = np.concatenate([r0, v0])
        
        t_start = 0.0
        t_end = (config.end_mjd - config.start_mjd) * 86400.0
        
        if t_end <= 0:
            raise ValueError(f"传播结束时间必须大于开始时间，当前跨度: {t_end} 秒")
        
        dt = config.step_size
        
        if dt <= 0:
            raise ValueError(f"时间步长必须为正数，当前值: {dt}")
        
        num_steps = int(np.ceil(t_end / dt)) + 1
        num_steps = min(num_steps, config.max_iterations)
        num_output = int(np.ceil(num_steps / config.output_interval))
        
        time_array = np.zeros(num_output)
        pos_array = np.zeros((num_output, 3))
        vel_array = np.zeros((num_output, 3))
        
        state = state0.copy()
        prev_state = state0.copy()
        
        output_idx = 0
        
        for step in range(num_steps):
            t = t_start + step * dt
            mjd = config.start_mjd + t / 86400.0
            
            if step % config.output_interval == 0 and output_idx < num_output:
                time_array[output_idx] = mjd
                pos_array[output_idx] = state[:3]
                vel_array[output_idx] = state[3:]
                output_idx += 1
            
            r_mag = np.linalg.norm(state[:3])
            if r_mag < 1e-6 or np.isnan(r_mag) or np.isinf(r_mag):
                self.logger.warning(f"天体 {body.name} 在步骤 {step} 出现异常位置 (r={r_mag:.2e})，提前终止")
                break
            
            if config.integration_method == IntegrationMethod.EULER:
                deriv = self._derivatives(state, t, mjd, body.elements.gm, config)
                state = state + dt * deriv
            elif config.integration_method == IntegrationMethod.RK4:
                state = self._integrate_rk4(state, t, dt, config.start_mjd, body.elements.gm, config)
            elif config.integration_method == IntegrationMethod.RK78:
                state = self._integrate_rk78(state, t, dt, config.start_mjd, body.elements.gm, config)
            elif config.integration_method == IntegrationMethod.VERLET:
                if step == 0:
                    state = self._integrate_rk4(state, t, dt, config.start_mjd, body.elements.gm, config)
                else:
                    new_state = self._integrate_verlet(state, prev_state, t, dt, config.start_mjd, body.elements.gm, config)
                    prev_state = state.copy()
                    state = new_state
            else:
                state = self._integrate_rk4(state, t, dt, config.start_mjd, body.elements.gm, config)
            
            if np.any(np.isnan(state)) or np.any(np.isinf(state)):
                self.logger.warning(f"天体 {body.name} 在步骤 {step} 出现数值溢出，提前终止")
                break
        
        return PropagationResult(
            body_name=body.name,
            time=time_array[:output_idx],
            position=pos_array[:output_idx],
            velocity=vel_array[:output_idx],
            metadata={
                'method': config.integration_method.value,
                'step_size': dt,
                'num_steps': output_idx,
                'start_mjd': config.start_mjd,
                'end_mjd': config.end_mjd,
                'terminated_early': output_idx < num_output
            }
        )
    
    def propagate_multiple_bodies(
        self,
        bodies: List[CelestialBody],
        config: PropagationConfig,
        parallel: bool = True
    ) -> Dict[str, PropagationResult]:
        """并行传播多个天体的轨道"""
        results = {}
        timeout_seconds = 3600
        
        if parallel and len(bodies) > 1 and self.num_workers > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.num_workers) as executor:
                future_to_body = {}
                for body in bodies:
                    try:
                        future = executor.submit(self.propagate_body, body, config)
                        future_to_body[future] = body
                    except Exception as e:
                        self.logger.error(f"提交天体 {body.name} 任务时出错: {e}")
                
                for future in concurrent.futures.as_completed(future_to_body, timeout=timeout_seconds):
                    body = future_to_body[future]
                    try:
                        result = future.result(timeout=300)
                        results[body.name] = result
                        self.results[body.name] = result
                        self.logger.info(f"天体 {body.name} 传播完成")
                    except concurrent.futures.TimeoutError:
                        self.logger.error(f"天体 {body.name} 传播超时")
                    except Exception as e:
                        self.logger.error(f"传播天体 {body.name} 时出错: {e}")
        else:
            for body in bodies:
                try:
                    result = self.propagate_body(body, config)
                    results[body.name] = result
                    self.results[body.name] = result
                    self.logger.info(f"天体 {body.name} 传播完成")
                except Exception as e:
                    self.logger.error(f"传播天体 {body.name} 时出错: {e}")
        
        return results
    
    def propagate_long_term(
        self,
        body: CelestialBody,
        config: PropagationConfig,
        intermediate_saves: int = 10
    ) -> PropagationResult:
        """长周期轨道传播，支持中间结果保存"""
        total_duration = config.end_mjd - config.start_mjd
        segment_duration = total_duration / intermediate_saves
        
        all_time = []
        all_pos = []
        all_vel = []
        
        current_mjd = config.start_mjd
        
        for i in range(intermediate_saves):
            segment_config = PropagationConfig(
                start_mjd=current_mjd,
                end_mjd=current_mjd + segment_duration,
                step_size=config.step_size,
                integration_method=config.integration_method,
                include_perturbations=config.include_perturbations,
                output_interval=config.output_interval,
                adaptive_step_size=config.adaptive_step_size,
                tolerance=config.tolerance
            )
            
            result = self.propagate_body(body, segment_config)
            
            all_time.extend(result.time)
            all_pos.extend(result.position)
            all_vel.extend(result.velocity)
            
            if i < intermediate_saves - 1:
                last_idx = len(result.time) - 1
                r_last = result.position[last_idx]
                v_last = result.velocity[last_idx]
                
                from .unit_conversion import velocity_to_orbital_elements
                a, e, inc, omega, w, f = velocity_to_orbital_elements(
                    r_last, v_last, body.elements.gm
                )
                E = 2 * np.arctan2(np.sqrt(1 - e) * np.sin(f / 2), np.sqrt(1 + e) * np.cos(f / 2))
                M = E - e * np.sin(E)
                
                body.elements = OrbitalElements(
                    a=a, e=e, i=inc, omega=omega, w=w, M=M,
                    epoch=result.time[-1],
                    central_body=body.elements.central_body
                )
            
            current_mjd += segment_duration
        
        return PropagationResult(
            body_name=body.name,
            time=np.array(all_time),
            position=np.array(all_pos),
            velocity=np.array(all_vel),
            metadata={
                'method': config.integration_method.value,
                'step_size': config.step_size,
                'segments': intermediate_saves,
                'total_duration_days': total_duration,
                'start_mjd': config.start_mjd,
                'end_mjd': config.end_mjd
            }
        )
    
    def compute_deviations(
        self,
        reference_result: PropagationResult,
        perturbed_result: PropagationResult
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """计算两个传播结果之间的偏差
        
        Returns:
            time: 时间轴
            pos_deviation: 位置偏差 (m)
            vel_deviation: 速度偏差 (m/s)
        """
        common_time = np.intersect1d(reference_result.time, perturbed_result.time)
        
        ref_interp_pos = np.array([
            np.interp(common_time, reference_result.time, reference_result.position[:, i])
            for i in range(3)
        ]).T
        
        pert_interp_pos = np.array([
            np.interp(common_time, perturbed_result.time, perturbed_result.position[:, i])
            for i in range(3)
        ]).T
        
        ref_interp_vel = np.array([
            np.interp(common_time, reference_result.time, reference_result.velocity[:, i])
            for i in range(3)
        ]).T
        
        pert_interp_vel = np.array([
            np.interp(common_time, perturbed_result.time, perturbed_result.velocity[:, i])
            for i in range(3)
        ]).T
        
        pos_deviation = np.linalg.norm(pert_interp_pos - ref_interp_pos, axis=1)
        vel_deviation = np.linalg.norm(pert_interp_vel - ref_interp_vel, axis=1)
        
        return common_time, pos_deviation, vel_deviation
    
    def get_result(self, body_name: str) -> Optional[PropagationResult]:
        """获取传播结果"""
        return self.results.get(body_name)
    
    def clear_results(self):
        """清空所有结果"""
        self.results.clear()

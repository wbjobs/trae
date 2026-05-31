import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Tuple
from enum import Enum, auto
from .unit_conversion import const
from .orbit_parameters import CelestialBody, OrbitalElements


class PerturbationType(Enum):
    """摄动类型枚举"""
    J2 = auto()
    J3 = auto()
    J4 = auto()
    THIRD_BODY_SUN = auto()
    THIRD_BODY_MOON = auto()
    THIRD_BODY_PLANET = auto()
    ATMOSPHERIC_DRAG = auto()
    SOLAR_RADIATION_PRESSURE = auto()
    RELATIVISTIC = auto()
    TIDAL = auto()


@dataclass
class PerturbationConfig:
    """摄动计算配置"""
    enabled_perturbations: List[PerturbationType] = field(default_factory=lambda: [
        PerturbationType.J2,
        PerturbationType.THIRD_BODY_SUN,
        PerturbationType.THIRD_BODY_MOON,
    ])
    j2_coefficient: float = const.J2_EARTH
    j3_coefficient: float = const.J3_EARTH
    j4_coefficient: float = const.J4_EARTH
    central_body_radius: float = const.R_EARTH
    cd: float = 2.2
    area_mass_ratio: float = 0.01
    solar_radiation_pressure: float = 4.56e-6
    reflectivity_coefficient: float = 1.0


@dataclass
class PerturbationAcceleration:
    """摄动加速度结果"""
    total: np.ndarray
    components: Dict[PerturbationType, np.ndarray] = field(default_factory=dict)
    
    @property
    def magnitude(self) -> float:
        return np.linalg.norm(self.total)


class PerturbationCalculator:
    """摄动因子计算器"""
    
    def __init__(self, config: PerturbationConfig = None):
        self.config = config or PerturbationConfig()
        self.third_bodies: Dict[str, CelestialBody] = {}
    
    def set_third_bodies(self, bodies: Dict[str, CelestialBody]):
        """设置第三体天体"""
        self.third_bodies = bodies
    
    def calculate_total_acceleration(
        self,
        r: np.ndarray,
        v: np.ndarray,
        mjd: float,
        central_body_gm: float = const.GM_EARTH
    ) -> PerturbationAcceleration:
        """计算总摄动加速度"""
        acceleration = np.zeros(3)
        components = {}
        
        for pert_type in self.config.enabled_perturbations:
            acc = self._calculate_perturbation(pert_type, r, v, mjd, central_body_gm)
            if acc is not None:
                components[pert_type] = acc
                acceleration += acc
        
        return PerturbationAcceleration(total=acceleration, components=components)
    
    def _calculate_perturbation(
        self,
        pert_type: PerturbationType,
        r: np.ndarray,
        v: np.ndarray,
        mjd: float,
        gm: float
    ) -> Optional[np.ndarray]:
        """计算指定类型的摄动加速度"""
        if pert_type == PerturbationType.J2:
            return self._j2_perturbation(r, gm)
        elif pert_type == PerturbationType.J3:
            return self._j3_perturbation(r, gm)
        elif pert_type == PerturbationType.J4:
            return self._j4_perturbation(r, gm)
        elif pert_type == PerturbationType.THIRD_BODY_SUN:
            sun = self.third_bodies.get('Sun')
            if sun:
                return self._third_body_perturbation(r, sun, mjd, gm)
        elif pert_type == PerturbationType.THIRD_BODY_MOON:
            moon = self.third_bodies.get('Moon')
            if moon:
                return self._third_body_perturbation(r, moon, mjd, gm)
        elif pert_type == PerturbationType.THIRD_BODY_PLANET:
            return self._planetary_perturbation(r, mjd, gm)
        elif pert_type == PerturbationType.ATMOSPHERIC_DRAG:
            return self._atmospheric_drag(r, v, mjd)
        elif pert_type == PerturbationType.SOLAR_RADIATION_PRESSURE:
            sun = self.third_bodies.get('Sun')
            if sun:
                return self._solar_radiation_pressure(r, sun, mjd)
        elif pert_type == PerturbationType.RELATIVISTIC:
            return self._relativistic_perturbation(r, v, gm)
        
        return None
    
    def _j2_perturbation(self, r: np.ndarray, gm: float) -> np.ndarray:
        """计算J2摄动加速度（地球扁率）"""
        r = np.asarray(r, dtype=np.float64)
        r_mag = np.linalg.norm(r)
        if r_mag < 1e-10:
            return np.zeros(3)
        
        R = self.config.central_body_radius
        J2 = self.config.j2_coefficient
        
        z_over_r2 = (r[2] / r_mag) ** 2
        factor = -1.5 * J2 * gm * (R ** 2) / (r_mag ** 5)
        x, y, z = r
        
        ax = factor * x * (1 - 5 * z_over_r2)
        ay = factor * y * (1 - 5 * z_over_r2)
        az = factor * z * (3 - 5 * z_over_r2)
        
        result = np.array([ax, ay, az], dtype=np.float64)
        result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)
        
        return result
    
    def _j3_perturbation(self, r: np.ndarray, gm: float) -> np.ndarray:
        """计算J3摄动加速度"""
        r = np.asarray(r, dtype=np.float64)
        r_mag = np.linalg.norm(r)
        if r_mag < 1e-10:
            return np.zeros(3)
        
        R = self.config.central_body_radius
        J3 = self.config.j3_coefficient
        
        z_over_r = r[2] / r_mag
        z_over_r2 = z_over_r ** 2
        factor = -2.5 * J3 * gm * (R ** 3) / (r_mag ** 7)
        x, y, z = r
        
        ax = factor * x * z * (3 - 7 * z_over_r2)
        ay = factor * y * z * (3 - 7 * z_over_r2)
        az = factor * (1.5 * r_mag ** 2 - 7 * z ** 2 + 3.5 * (z ** 2) * z_over_r2)
        
        result = np.array([ax, ay, az], dtype=np.float64)
        result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)
        
        return result
    
    def _j4_perturbation(self, r: np.ndarray, gm: float) -> np.ndarray:
        """计算J4摄动加速度"""
        r = np.asarray(r, dtype=np.float64)
        r_mag = np.linalg.norm(r)
        if r_mag < 1e-10:
            return np.zeros(3)
        
        R = self.config.central_body_radius
        J4 = self.config.j4_coefficient
        
        z_over_r2 = (r[2] / r_mag) ** 2
        z_over_r4 = z_over_r2 ** 2
        factor = 0.375 * J4 * gm * (R ** 4) / (r_mag ** 7)
        x, y, z = r
        
        ax = factor * x * (3 - 42 * z_over_r2 + 63 * z_over_r4)
        ay = factor * y * (3 - 42 * z_over_r2 + 63 * z_over_r4)
        az = factor * z * (15 - 70 * z_over_r2 + 63 * z_over_r4)
        
        result = np.array([ax, ay, az], dtype=np.float64)
        result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)
        
        return result
    
    def _third_body_perturbation(
        self,
        r: np.ndarray,
        third_body: CelestialBody,
        mjd: float,
        gm_central: float
    ) -> np.ndarray:
        """计算第三体摄动加速度"""
        r = np.asarray(r, dtype=np.float64)
        
        try:
            r3 = third_body.get_position(mjd)
        except Exception:
            return np.zeros(3)
        
        r3 = np.asarray(r3, dtype=np.float64)
        r_rel = r3 - r
        
        r_mag = np.linalg.norm(r)
        r3_mag = np.linalg.norm(r3)
        r_rel_mag = np.linalg.norm(r_rel)
        
        if r_rel_mag < 1e-10 or r3_mag < 1e-10:
            return np.zeros(3)
        
        gm3 = third_body.gm
        
        term1 = r_rel / (r_rel_mag ** 3)
        term2 = r3 / (r3_mag ** 3)
        
        acc = gm3 * (term1 - term2)
        
        result = np.asarray(acc, dtype=np.float64)
        result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)
        
        return result
    
    def _planetary_perturbation(self, r: np.ndarray, mjd: float, gm: float) -> np.ndarray:
        """计算行星摄动加速度"""
        total_acc = np.zeros(3)
        
        planet_names = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
        for name in planet_names:
            planet = self.third_bodies.get(name)
            if planet:
                total_acc += self._third_body_perturbation(r, planet, mjd, gm)
        
        return total_acc
    
    def _atmospheric_drag(self, r: np.ndarray, v: np.ndarray, mjd: float) -> np.ndarray:
        """计算大气阻力摄动加速度"""
        r_mag = np.linalg.norm(r)
        altitude = r_mag - self.config.central_body_radius
        
        if altitude < 0:
            return np.zeros(3)
        
        density = self._exponential_atmosphere_density(altitude)
        if density == 0:
            return np.zeros(3)
        
        v_rel = v
        v_mag = np.linalg.norm(v_rel)
        
        if v_mag == 0:
            return np.zeros(3)
        
        factor = -0.5 * self.config.cd * self.config.area_mass_ratio * density * v_mag
        return factor * v_rel
    
    def _exponential_atmosphere_density(self, altitude: float) -> float:
        """简化的指数大气模型"""
        if altitude < 100000:
            return 0
        
        if altitude < 200000:
            h0, rho0, H = 150000, 2.07e-9, 22522.0
        elif altitude < 300000:
            h0, rho0, H = 200000, 5.46e-10, 38500.0
        elif altitude < 400000:
            h0, rho0, H = 300000, 9.48e-11, 53298.0
        elif altitude < 500000:
            h0, rho0, H = 400000, 1.87e-11, 53298.0
        elif altitude < 600000:
            h0, rho0, H = 500000, 5.22e-12, 58715.0
        elif altitude < 700000:
            h0, rho0, H = 600000, 1.58e-12, 60828.0
        elif altitude < 800000:
            h0, rho0, H = 700000, 5.74e-13, 63822.0
        elif altitude < 900000:
            h0, rho0, H = 800000, 2.21e-13, 71835.0
        elif altitude < 1000000:
            h0, rho0, H = 900000, 8.89e-14, 88667.0
        else:
            return 0
        
        return rho0 * np.exp(-(altitude - h0) / H)
    
    def _solar_radiation_pressure(
        self,
        r: np.ndarray,
        sun: CelestialBody,
        mjd: float
    ) -> np.ndarray:
        """计算太阳辐射压摄动加速度"""
        r_sun = sun.get_position(mjd)
        r_rel = r - r_sun
        r_mag = np.linalg.norm(r_rel)
        
        if r_mag == 0:
            return np.zeros(3)
        
        au_r = r_mag / const.AU
        p = self.config.solar_radiation_pressure / (au_r ** 2)
        
        factor = p * self.config.reflectivity_coefficient * self.config.area_mass_ratio
        return factor * (r_rel / r_mag)
    
    def _relativistic_perturbation(self, r: np.ndarray, v: np.ndarray, gm: float) -> np.ndarray:
        """计算广义相对论摄动加速度（后牛顿近似）"""
        r = np.asarray(r, dtype=np.float64)
        v = np.asarray(v, dtype=np.float64)
        
        r_mag = np.linalg.norm(r)
        v_mag = np.linalg.norm(v)
        
        if r_mag < 1e-10:
            return np.zeros(3)
        
        c2 = const.C ** 2
        r_dot_v = np.dot(r, v)
        
        factor = gm / (c2 * r_mag ** 3)
        
        term1 = (4 * gm / r_mag - v_mag ** 2) * r
        term2 = 4 * r_dot_v * v
        
        acc = factor * (term1 + term2)
        
        result = np.asarray(acc, dtype=np.float64)
        result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)
        
        return result
    
    def calculate_orbital_element_rates(
        self,
        elements: OrbitalElements,
        mjd: float
    ) -> Dict[str, float]:
        """计算轨道根数的长期变化率（高斯摄动方程简化版）"""
        a, e, i, omega, w, M = elements.a, elements.e, elements.i, elements.omega, elements.w, elements.M
        gm = elements.gm
        
        r, v = self._elements_to_state(elements)
        pert_acc = self.calculate_total_acceleration(r, v, mjd, gm)
        acc = pert_acc.total
        
        n = np.sqrt(gm / a ** 3)
        h = np.sqrt(gm * a * (1 - e ** 2))
        p = a * (1 - e ** 2)
        
        r_mag = np.linalg.norm(r)
        f = self._true_anomaly(r, v, elements)
        
        u = w + f
        sin_u = np.sin(u)
        cos_u = np.cos(u)
        sin_i = np.sin(i)
        cos_i = np.cos(i)
        
        r_unit = r / r_mag
        h_unit = np.cross(r, v) / h
        t_unit = np.cross(h_unit, r_unit)
        
        acc_r = np.dot(acc, r_unit)
        acc_t = np.dot(acc, t_unit)
        acc_n = np.dot(acc, h_unit)
        
        da_dt = 2 * a ** 2 / h * (e * np.sin(f) * acc_r + p / r_mag * acc_t)
        
        de_dt = 1 / n / a * (np.sin(f) * acc_r + (np.cos(f) + np.cos(f + 2 * w) * e) / (1 + e * np.cos(f)) * acc_t)
        
        di_dt = r_mag * np.cos(u) / h * acc_n
        
        domega_dt = r_mag * np.sin(u) / (h * sin_i) * acc_n if sin_i != 0 else 0
        
        dw_dt = (h * acc_t / (gm * e) * (1 + e * np.cos(f)) - 
                 h * acc_r / (gm * e) * np.sin(f) * (2 + e * np.cos(f)) - 
                 r_mag * np.sin(u) * cos_i / (h * sin_i) * acc_n) if e != 0 and sin_i != 0 else 0
        
        dM_dt = n - 1 / (n * a * e) * ((1 + e * np.cos(f)) * np.cos(f) + 2 * e) * acc_r
        
        return {
            'a': da_dt,
            'e': de_dt,
            'i': di_dt,
            'omega': domega_dt,
            'w': dw_dt,
            'M': dM_dt
        }
    
    @staticmethod
    def _elements_to_state(elements: OrbitalElements) -> Tuple[np.ndarray, np.ndarray]:
        """轨道根数转状态矢量"""
        a, e, i, omega, w, M = elements.a, elements.e, elements.i, elements.omega, elements.w, elements.M
        
        E = M
        for _ in range(50):
            dE = (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
            E -= dE
            if abs(dE) < 1e-12:
                break
        
        f = 2 * np.arctan2(np.sqrt(1 + e) * np.sin(E / 2), np.sqrt(1 - e) * np.cos(E / 2))
        r_mag = a * (1 - e * np.cos(E))
        p = a * (1 - e ** 2)
        
        r_orbit = np.array([r_mag * np.cos(f), r_mag * np.sin(f), 0])
        v_orbit = np.array([-np.sqrt(elements.gm / p) * np.sin(f), 
                            np.sqrt(elements.gm / p) * (e + np.cos(f)), 0])
        
        R_omega = np.array([
            [np.cos(omega), -np.sin(omega), 0],
            [np.sin(omega), np.cos(omega), 0],
            [0, 0, 1]
        ])
        R_i = np.array([
            [1, 0, 0],
            [0, np.cos(i), -np.sin(i)],
            [0, np.sin(i), np.cos(i)]
        ])
        R_w = np.array([
            [np.cos(w), -np.sin(w), 0],
            [np.sin(w), np.cos(w), 0],
            [0, 0, 1]
        ])
        R = R_omega @ R_i @ R_w
        
        return R @ r_orbit, R @ v_orbit
    
    @staticmethod
    def _true_anomaly(r: np.ndarray, v: np.ndarray, elements: OrbitalElements) -> float:
        """计算真近点角"""
        r_mag = np.linalg.norm(r)
        h = np.cross(r, v)
        h_mag = np.linalg.norm(h)
        
        e_vec = ((np.dot(v, v) - elements.gm / r_mag) * r - np.dot(r, v) * v) / elements.gm
        e = np.linalg.norm(e_vec)
        
        if e == 0:
            return 0
        
        cos_f = np.dot(e_vec, r) / (e * r_mag)
        cos_f = np.clip(cos_f, -1.0, 1.0)
        f = np.arccos(cos_f)
        
        if np.dot(r, v) < 0:
            f = 2 * np.pi - f
        
        return f

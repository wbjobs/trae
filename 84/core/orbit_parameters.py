import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Union, Tuple
from enum import Enum
from .unit_conversion import (
    degrees_to_radians,
    au_to_meters,
    km_to_meters,
    const
)


class OrbitElementUnit(Enum):
    """轨道参数单位类型"""
    METERS = "meters"
    KILOMETERS = "kilometers"
    AU = "au"
    RADIANS = "radians"
    DEGREES = "degrees"


class CentralBody(Enum):
    """中心天体类型"""
    SUN = "sun"
    EARTH = "earth"
    MOON = "moon"
    MARS = "mars"
    JUPITER = "jupiter"
    SATURN = "saturn"


CENTRAL_BODY_GM = {
    CentralBody.SUN: const.GM_SUN,
    CentralBody.EARTH: const.GM_EARTH,
    CentralBody.MOON: const.GM_MOON,
    CentralBody.MARS: 4.282837e13,
    CentralBody.JUPITER: 1.2668653e17,
    CentralBody.SATURN: 3.7931187e16,
}


@dataclass
class OrbitalElements:
    """轨道根数数据类
    
    Args:
        a: 半长轴
        e: 偏心率
        i: 轨道倾角
        omega: 升交点赤经
        w: 近心点幅角
        M: 平近点角
        epoch: 历元（MJD）
        central_body: 中心天体
    """
    a: float
    e: float
    i: float
    omega: float
    w: float
    M: float
    epoch: float
    central_body: CentralBody = CentralBody.EARTH
    
    def to_si(self) -> 'OrbitalElements':
        """转换为SI单位（米、弧度）"""
        return OrbitalElements(
            a=self.a,
            e=self.e,
            i=self.i,
            omega=self.omega,
            w=self.w,
            M=self.M,
            epoch=self.epoch,
            central_body=self.central_body
        )
    
    @property
    def gm(self) -> float:
        """获取中心天体引力常数"""
        return CENTRAL_BODY_GM[self.central_body]
    
    @property
    def n(self) -> float:
        """平均运动角速度 (rad/s)"""
        return np.sqrt(self.gm / self.a ** 3)
    
    @property
    def period(self) -> float:
        """轨道周期 (s)"""
        return 2 * np.pi / self.n
    
    @property
    def p(self) -> float:
        """半通径 (m)"""
        return self.a * (1 - self.e ** 2)


@dataclass
class CelestialBody:
    """天体数据类"""
    name: str
    mass: float
    radius: float
    gm: float
    elements: Optional[OrbitalElements] = None
    ephemeris: Optional[Dict[float, np.ndarray]] = field(default_factory=dict)
    
    def get_position(self, mjd: float) -> np.ndarray:
        """获取指定历元的位置矢量"""
        if self.elements is None:
            raise ValueError("轨道元素未设置")
        
        if mjd in self.ephemeris:
            return self.ephemeris[mjd]
        
        return self._propagate_to(mjd)
    
    def _propagate_to(self, mjd: float) -> np.ndarray:
        """简单轨道外推"""
        dt = (mjd - self.elements.epoch) * const.DAY_SECONDS
        M = self.elements.M + self.elements.n * dt
        M = M % (2 * np.pi)
        
        E = self._solve_kepler(M, self.elements.e)
        f = 2 * np.arctan2(
            np.sqrt(1 + self.elements.e) * np.sin(E / 2),
            np.sqrt(1 - self.elements.e) * np.cos(E / 2)
        )
        
        r = self.elements.p / (1 + self.elements.e * np.cos(f))
        u = self.elements.w + f
        
        x = r * (np.cos(self.elements.omega) * np.cos(u) - 
                 np.sin(self.elements.omega) * np.sin(u) * np.cos(self.elements.i))
        y = r * (np.sin(self.elements.omega) * np.cos(u) + 
                 np.cos(self.elements.omega) * np.sin(u) * np.cos(self.elements.i))
        z = r * np.sin(u) * np.sin(self.elements.i)
        
        return np.array([x, y, z])
    
    @staticmethod
    def _solve_kepler(M: float, e: float, tol: float = 1e-12, max_iter: int = 100) -> float:
        """牛顿迭代法求解开普勒方程"""
        E = M if e < 0.8 else np.pi
        for _ in range(max_iter):
            dE = (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
            E -= dE
            if abs(dE) < tol:
                break
        return E


class OrbitParameterImporter:
    """轨道参数导入器"""
    
    def __init__(self):
        self.bodies: Dict[str, CelestialBody] = {}
    
    def import_from_tle(self, tle_line1: str, tle_line2: str, name: str = "Unknown") -> CelestialBody:
        """从TLE（两行轨道根数）格式导入
        
        TLE格式参考: https://celestrak.org/columns/v04n03/
        """
        line1 = tle_line1.strip()
        line2 = tle_line2.strip()
        
        epoch_year = int(line1[18:20])
        epoch_day = float(line1[20:32])
        epoch_year += 2000 if epoch_year < 57 else 1900
        
        from datetime import datetime, timedelta
        year_start = datetime(epoch_year, 1, 1)
        epoch_date = year_start + timedelta(days=epoch_day - 1)
        epoch_mjd = (epoch_date - datetime(1858, 11, 17)).total_seconds() / 86400.0
        
        i = degrees_to_radians(float(line2[8:16]))
        omega = degrees_to_radians(float(line2[17:25]))
        e = float('0.' + line2[26:33])
        w = degrees_to_radians(float(line2[34:42]))
        M = degrees_to_radians(float(line2[43:51]))
        n_rev = float(line2[52:63])
        n = n_rev * 2 * np.pi / 86400.0
        
        a = (const.GM_EARTH / n ** 2) ** (1.0 / 3.0)
        
        elements = OrbitalElements(
            a=a, e=e, i=i, omega=omega, w=w, M=M,
            epoch=epoch_mjd, central_body=CentralBody.EARTH
        )
        
        body = CelestialBody(
            name=name, mass=0, radius=0, gm=0, elements=elements
        )
        self.bodies[name] = body
        return body
    
    def import_from_kepler_elements(
        self,
        name: str,
        a: float,
        e: float,
        i: float,
        omega: float,
        w: float,
        M: float,
        epoch: float,
        central_body: CentralBody = CentralBody.SUN,
        units: Dict[str, OrbitElementUnit] = None
    ) -> CelestialBody:
        """从开普勒元素导入
        
        Args:
            name: 天体名称
            a: 半长轴
            e: 偏心率
            i: 轨道倾角
            omega: 升交点赤经
            w: 近心点幅角
            M: 平近点角
            epoch: 历元（MJD）
            central_body: 中心天体
            units: 各参数的单位
        """
        if units is None:
            units = {}
        
        a = float(a)
        e = float(e)
        i = float(i)
        omega = float(omega)
        w = float(w)
        M = float(M)
        epoch = float(epoch)
        
        a_unit = units.get('a', OrbitElementUnit.METERS)
        angle_unit = units.get('angles', OrbitElementUnit.RADIANS)
        
        if a_unit == OrbitElementUnit.AU:
            a = au_to_meters(a)
        elif a_unit == OrbitElementUnit.KILOMETERS:
            a = km_to_meters(a)
        
        MIN_SEMIMAJOR_AXIS = 1000.0
        MAX_SEMIMAJOR_AXIS = 1e18
        
        if a < MIN_SEMIMAJOR_AXIS:
            raise ValueError(f"半长轴过小: {a} m，最小值为 {MIN_SEMIMAJOR_AXIS} m")
        if a > MAX_SEMIMAJOR_AXIS:
            raise ValueError(f"半长轴过大: {a} m，最大值为 {MAX_SEMIMAJOR_AXIS} m")
        
        if e < 0.0 or e >= 1.0:
            raise ValueError(f"偏心率必须在 [0, 1) 范围内，当前值: {e}")
        
        if angle_unit == OrbitElementUnit.DEGREES:
            i = degrees_to_radians(i)
            omega = degrees_to_radians(omega)
            w = degrees_to_radians(w)
            M = degrees_to_radians(M)
        
        i = i % (2 * np.pi)
        omega = omega % (2 * np.pi)
        w = w % (2 * np.pi)
        M = M % (2 * np.pi)
        
        elements = OrbitalElements(
            a=a, e=e, i=i, omega=omega, w=w, M=M,
            epoch=epoch, central_body=central_body
        )
        
        body = CelestialBody(
            name=name, mass=0, radius=0,
            gm=CENTRAL_BODY_GM.get(central_body, const.GM_SUN),
            elements=elements
        )
        self.bodies[name] = body
        return body
    
    def import_from_csv(self, filepath: str) -> List[CelestialBody]:
        """从CSV文件批量导入轨道参数
        
        CSV格式:
        name,a,e,i,omega,w,M,epoch,central_body
        """
        import csv
        bodies = []
        
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                body = self.import_from_kepler_elements(
                    name=row['name'],
                    a=float(row['a']),
                    e=float(row['e']),
                    i=float(row['i']),
                    omega=float(row['omega']),
                    w=float(row['w']),
                    M=float(row['M']),
                    epoch=float(row['epoch']),
                    central_body=CentralBody(row.get('central_body', 'sun')),
                    units={
                        'a': OrbitElementUnit(row.get('a_unit', 'meters')),
                        'angles': OrbitElementUnit(row.get('angle_unit', 'radians'))
                    }
                )
                bodies.append(body)
        
        return bodies
    
    def get_body(self, name: str) -> Optional[CelestialBody]:
        """获取指定天体"""
        return self.bodies.get(name)
    
    def list_bodies(self) -> List[str]:
        """列出所有已导入的天体"""
        return list(self.bodies.keys())


def create_solar_system_bodies() -> Dict[str, CelestialBody]:
    """创建太阳系主要天体的简化模型"""
    bodies = {}
    
    sun = CelestialBody(
        name="Sun",
        mass=1.989e30,
        radius=const.R_SUN,
        gm=const.GM_SUN
    )
    bodies["Sun"] = sun
    
    planets_data = [
        ("Mercury", 57.909e9, 0.2056, 7.005, 48.331, 29.124, 174.796, 0.330e24, 2439.7e3),
        ("Venus", 108.210e9, 0.0067, 3.395, 76.680, 54.884, 50.115, 4.867e24, 6051.8e3),
        ("Earth", 149.598e9, 0.0167, 0.000, 0.0, 114.207, 357.529, 5.972e24, const.R_EARTH),
        ("Mars", 227.920e9, 0.0935, 1.850, 49.558, 286.502, 19.373, 0.642e24, 3389.5e3),
        ("Jupiter", 778.570e9, 0.0489, 1.303, 100.492, 273.867, 20.020, 1898e24, 69911e3),
        ("Saturn", 1433.530e9, 0.0565, 2.489, 113.642, 339.391, 317.020, 568e24, 58232e3),
    ]
    
    for name, a, e, i_deg, omega_deg, w_deg, M_deg, mass, radius in planets_data:
        elements = OrbitalElements(
            a=a, e=e,
            i=degrees_to_radians(i_deg),
            omega=degrees_to_radians(omega_deg),
            w=degrees_to_radians(w_deg),
            M=degrees_to_radians(M_deg),
            epoch=const.MJD_J2000,
            central_body=CentralBody.SUN
        )
        body = CelestialBody(
            name=name, mass=mass, radius=radius,
            gm=const.G * mass, elements=elements
        )
        bodies[name] = body
    
    return bodies

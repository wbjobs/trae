import math
from dataclasses import dataclass
from typing import Union, Tuple
import numpy as np


@dataclass
class PhysicalConstants:
    """物理常数集合（高精度）"""
    G = 6.67430e-11
    C = 299792458.0
    AU = 149597870700.0
    GM_SUN = 1.32712440018e20
    GM_EARTH = 3.986004418e14
    GM_MOON = 4.9048695e12
    R_SUN = 6.957e8
    R_EARTH = 6378137.0
    R_MOON = 1737400.0
    MJD_J2000 = 51544.5
    DAY_SECONDS = 86400.0
    YEAR_DAYS = 365.25
    J2_EARTH = 1.08262668e-3
    J3_EARTH = -2.532656485e-6
    J4_EARTH = -1.619621591e-6


const = PhysicalConstants()


def au_to_meters(au: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """天文单位(AU)转米"""
    return au * const.AU


def meters_to_au(meters: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """米转天文单位(AU)"""
    return meters / const.AU


def km_to_meters(km: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """千米转米"""
    return km * 1000.0


def meters_to_km(meters: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """米转千米"""
    return meters / 1000.0


def degrees_to_radians(deg: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """角度转弧度"""
    return np.deg2rad(deg)


def radians_to_degrees(rad: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """弧度转角度"""
    return np.rad2deg(rad)


def days_to_seconds(days: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """天转秒"""
    return days * const.DAY_SECONDS


def seconds_to_days(seconds: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """秒转天"""
    return seconds / const.DAY_SECONDS


def julian_date_to_mjd(jd: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """儒略日(JD)转约化儒略日(MJD)"""
    return jd - 2400000.5


def mjd_to_julian_date(mjd: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """约化儒略日(MJD)转儒略日(JD)"""
    return mjd + 2400000.5


def mjd_to_years(mjd: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """约化儒略日转年（相对于J2000）"""
    return (mjd - const.MJD_J2000) / const.YEAR_DAYS


def years_to_mjd(years: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """年（相对于J2000）转约化儒略日"""
    return years * const.YEAR_DAYS + const.MJD_J2000


def orbital_period_to_semi_major_axis(period: float, gm: float = const.GM_SUN) -> float:
    """根据开普勒第三定律，由轨道周期计算半长轴"""
    return (gm * (period / (2 * math.pi)) ** 2) ** (1.0 / 3.0)


def semi_major_axis_to_orbital_period(a: float, gm: float = const.GM_SUN) -> float:
    """根据开普勒第三定律，由半长轴计算轨道周期"""
    return 2 * math.pi * math.sqrt(a ** 3 / gm)


def mean_motion(a: float, gm: float = const.GM_SUN) -> float:
    """计算平均运动角速度 (rad/s)"""
    return math.sqrt(gm / a ** 3)


def velocity_to_orbital_elements(r: np.ndarray, v: np.ndarray, gm: float = const.GM_EARTH) -> Tuple[float, float, float, float, float, float]:
    """由位置速度矢量计算轨道根数
    
    Args:
        r: 位置矢量 (m)
        v: 速度矢量 (m/s)
        gm: 中心天体引力常数
        
    Returns:
        a: 半长轴 (m)
        e: 偏心率
        i: 轨道倾角 (rad)
        omega: 升交点赤经 (rad)
        w: 近心点幅角 (rad)
        f: 真近点角 (rad)
    """
    r = np.asarray(r, dtype=np.float64)
    v = np.asarray(v, dtype=np.float64)
    
    r_mag = np.linalg.norm(r)
    v_mag = np.linalg.norm(v)
    
    if r_mag < 1e-10:
        raise ValueError("位置矢量的模长太小，可能导致数值不稳定")
    
    h = np.cross(r, v)
    h_mag = np.linalg.norm(h)
    
    if h_mag < 1e-10:
        raise ValueError("角动量太小，轨道为径向轨道")
    
    n = np.cross(np.array([0.0, 0.0, 1.0]), h)
    n_mag = np.linalg.norm(n)
    
    e_vec = ((v_mag ** 2 - gm / r_mag) * r - np.dot(r, v) * v) / gm
    e = np.linalg.norm(e_vec)
    e = np.clip(e, 0.0, 0.999999999)
    
    xi = v_mag ** 2 / 2 - gm / r_mag
    if abs(xi) < 1e-15:
        a = np.inf
    else:
        a = -gm / (2 * xi)
    
    cos_i = h[2] / h_mag
    cos_i = np.clip(cos_i, -1.0, 1.0)
    i = np.arccos(cos_i)
    
    if n_mag < 1e-10:
        omega = 0.0
    else:
        cos_omega = n[0] / n_mag
        cos_omega = np.clip(cos_omega, -1.0, 1.0)
        omega = np.arccos(cos_omega)
        if n[1] < 0:
            omega = 2 * np.pi - omega
    
    if n_mag < 1e-10 or e < 1e-10:
        w = 0.0
    else:
        cos_w = np.dot(n, e_vec) / (n_mag * e)
        cos_w = np.clip(cos_w, -1.0, 1.0)
        w = np.arccos(cos_w)
        if e_vec[2] < 0:
            w = 2 * np.pi - w
    
    if e < 1e-10:
        f = 0.0
    else:
        cos_f = np.dot(e_vec, r) / (e * r_mag)
        cos_f = np.clip(cos_f, -1.0, 1.0)
        f = np.arccos(cos_f)
        if np.dot(r, v) < 0:
            f = 2 * np.pi - f
    
    return a, e, i, omega, w, f


def orbital_elements_to_velocity(a: float, e: float, i: float, omega: float, w: float, f: float, gm: float = const.GM_EARTH) -> Tuple[np.ndarray, np.ndarray]:
    """由轨道根数计算位置速度矢量
    
    Args:
        a: 半长轴 (m)
        e: 偏心率
        i: 轨道倾角 (rad)
        omega: 升交点赤经 (rad)
        w: 近心点幅角 (rad)
        f: 真近点角 (rad)
        gm: 中心天体引力常数
        
    Returns:
        r: 位置矢量 (m)
        v: 速度矢量 (m/s)
    """
    a = float(a)
    e = float(e)
    i = float(i)
    omega = float(omega)
    w = float(w)
    f = float(f)
    gm = float(gm)
    
    if a <= 0:
        raise ValueError(f"半长轴必须为正数，当前值: {a}")
    if e < 0 or e >= 1:
        raise ValueError(f"偏心率必须在 [0, 1) 范围内，当前值: {e}")
    
    p = a * (1 - e ** 2)
    r_mag = p / (1 + e * np.cos(f))
    
    r_orbit = np.array([r_mag * np.cos(f), r_mag * np.sin(f), 0.0], dtype=np.float64)
    
    h = np.sqrt(gm * p)
    v_orbit = np.array([-gm / h * np.sin(f), gm / h * (e + np.cos(f)), 0.0], dtype=np.float64)
    
    cos_omega = np.cos(omega)
    sin_omega = np.sin(omega)
    cos_i = np.cos(i)
    sin_i = np.sin(i)
    cos_w = np.cos(w)
    sin_w = np.sin(w)
    
    R = np.array([
        [cos_omega * cos_w - sin_omega * sin_w * cos_i, -cos_omega * sin_w - sin_omega * cos_w * cos_i, sin_omega * sin_i],
        [sin_omega * cos_w + cos_omega * sin_w * cos_i, -sin_omega * sin_w + cos_omega * cos_w * cos_i, -cos_omega * sin_i],
        [sin_w * sin_i, cos_w * sin_i, cos_i]
    ], dtype=np.float64)
    
    r = R @ r_orbit
    v = R @ v_orbit
    
    return r, v

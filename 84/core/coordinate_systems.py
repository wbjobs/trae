import numpy as np
from dataclasses import dataclass, field
from typing import Tuple, Optional, Dict, Any
from enum import Enum

from .unit_conversion import const, degrees_to_radians, radians_to_degrees


class CoordinateSystem(Enum):
    """坐标系统"""
    ICRF = "icrf"
    J2000_EQUATORIAL = "j2000_equatorial"
    ECLIPTIC = "ecliptic"
    GALACTIC = "galactic"
    HORIZONTAL = "horizontal"
    ORBITAL = "orbital"
    BODY_FIXED = "body_fixed"


class TimeSystem(Enum):
    """时间系统"""
    UTC = "utc"
    TT = "tt"
    TDB = "tdb"
    TAI = "tai"
    GPS = "gps"


@dataclass
class CoordinateTransformation:
    """坐标变换参数"""
    source_system: CoordinateSystem
    target_system: CoordinateSystem
    rotation_matrix: np.ndarray
    translation_vector: Optional[np.ndarray] = None
    scale_factor: float = 1.0
    epoch_mjd: float = const.MJD_J2000


@dataclass
class ObservationCoordinates:
    """观测坐标"""
    system: CoordinateSystem
    right_ascension: Optional[float] = None
    declination: Optional[float] = None
    longitude: Optional[float] = None
    latitude: Optional[float] = None
    l: Optional[float] = None
    b: Optional[float] = None
    azimuth: Optional[float] = None
    elevation: Optional[float] = None
    distance: Optional[float] = None
    radial_velocity: Optional[float] = None
    epoch_mjd: float = const.MJD_J2000
    
    def to_cartesian(self) -> np.ndarray:
        """转换为笛卡尔坐标"""
        if self.distance is None:
            r = 1.0
        else:
            r = self.distance
        
        if self.right_ascension is not None and self.declination is not None:
            ra = self.right_ascension
            dec = self.declination
            return np.array([
                r * np.cos(dec) * np.cos(ra),
                r * np.cos(dec) * np.sin(ra),
                r * np.sin(dec)
            ])
        elif self.longitude is not None and self.latitude is not None:
            lon = self.longitude
            lat = self.latitude
            return np.array([
                r * np.cos(lat) * np.cos(lon),
                r * np.cos(lat) * np.sin(lon),
                r * np.sin(lat)
            ])
        elif self.l is not None and self.b is not None:
            l = self.l
            b = self.b
            return np.array([
                r * np.cos(b) * np.cos(l),
                r * np.cos(b) * np.sin(l),
                r * np.sin(b)
            ])
        elif self.azimuth is not None and self.elevation is not None:
            az = self.azimuth
            el = self.elevation
            return np.array([
                r * np.cos(el) * np.cos(az),
                r * np.cos(el) * np.sin(az),
                r * np.sin(el)
            ])
        else:
            raise ValueError("坐标信息不完整，无法转换为笛卡尔坐标")


class CoordinateConverter:
    """坐标转换器"""
    
    def __init__(self):
        self._initialize_transformations()
    
    def _initialize_transformations(self):
        """初始化变换矩阵"""
        self._transformations: Dict[Tuple[CoordinateSystem, CoordinateSystem], CoordinateTransformation] = {}
        
        self._transformations[(CoordinateSystem.J2000_EQUATORIAL, CoordinateSystem.ECLIPTIC)] = \
            self._get_ecliptic_rotation(const.MJD_J2000)
        
        self._transformations[(CoordinateSystem.ECLIPTIC, CoordinateSystem.J2000_EQUATORIAL)] = \
            self._get_inverse_ecliptic_rotation(const.MJD_J2000)
        
        self._transformations[(CoordinateSystem.J2000_EQUATORIAL, CoordinateSystem.GALACTIC)] = \
            self._get_galactic_rotation()
        
        self._transformations[(CoordinateSystem.GALACTIC, CoordinateSystem.J2000_EQUATORIAL)] = \
            self._get_inverse_galactic_rotation()
    
    def _get_ecliptic_rotation(self, mjd: float) -> CoordinateTransformation:
        """获取黄道旋转矩阵（J2000平黄道）"""
        epsilon = degrees_to_radians(23.43928)
        
        R = np.array([
            [1.0, 0.0, 0.0],
            [0.0, np.cos(epsilon), np.sin(epsilon)],
            [0.0, -np.sin(epsilon), np.cos(epsilon)]
        ])
        
        return CoordinateTransformation(
            source_system=CoordinateSystem.J2000_EQUATORIAL,
            target_system=CoordinateSystem.ECLIPTIC,
            rotation_matrix=R,
            epoch_mjd=mjd
        )
    
    def _get_inverse_ecliptic_rotation(self, mjd: float) -> CoordinateTransformation:
        """获取逆黄道旋转矩阵"""
        epsilon = degrees_to_radians(23.43928)
        
        R = np.array([
            [1.0, 0.0, 0.0],
            [0.0, np.cos(epsilon), -np.sin(epsilon)],
            [0.0, np.sin(epsilon), np.cos(epsilon)]
        ])
        
        return CoordinateTransformation(
            source_system=CoordinateSystem.ECLIPTIC,
            target_system=CoordinateSystem.J2000_EQUATORIAL,
            rotation_matrix=R,
            epoch_mjd=mjd
        )
    
    def _get_galactic_rotation(self) -> CoordinateTransformation:
        """获取银道旋转矩阵"""
        alpha_NGP = degrees_to_radians(192.85948)
        delta_NGP = degrees_to_radians(27.12825)
        l_omega = degrees_to_radians(122.93192)
        
        R1 = np.array([
            [np.cos(alpha_NGP), np.sin(alpha_NGP), 0.0],
            [-np.sin(alpha_NGP), np.cos(alpha_NGP), 0.0],
            [0.0, 0.0, 1.0]
        ])
        
        R2 = np.array([
            [1.0, 0.0, 0.0],
            [0.0, np.sin(delta_NGP), -np.cos(delta_NGP)],
            [0.0, np.cos(delta_NGP), np.sin(delta_NGP)]
        ])
        
        R3 = np.array([
            [np.cos(l_omega), np.sin(l_omega), 0.0],
            [-np.sin(l_omega), np.cos(l_omega), 0.0],
            [0.0, 0.0, 1.0]
        ])
        
        R = R3 @ R2 @ R1
        
        return CoordinateTransformation(
            source_system=CoordinateSystem.J2000_EQUATORIAL,
            target_system=CoordinateSystem.GALACTIC,
            rotation_matrix=R
        )
    
    def _get_inverse_galactic_rotation(self) -> CoordinateTransformation:
        """获取逆银道旋转矩阵"""
        R = self._get_galactic_rotation().rotation_matrix.T
        
        return CoordinateTransformation(
            source_system=CoordinateSystem.GALACTIC,
            target_system=CoordinateSystem.J2000_EQUATORIAL,
            rotation_matrix=R
        )
    
    def convert(
        self,
        position: np.ndarray,
        source_system: CoordinateSystem,
        target_system: CoordinateSystem,
        mjd: Optional[float] = None
    ) -> np.ndarray:
        """坐标转换
        
        Args:
            position: 输入位置向量
            source_system: 源坐标系
            target_system: 目标坐标系
            mjd: 儒略日时间（用于时变变换）
            
        Returns:
            转换后的位置向量
        """
        position = np.asarray(position, dtype=np.float64)
        
        if source_system == target_system:
            return position.copy()
        
        if (source_system, target_system) in self._transformations:
            transform = self._transformations[(source_system, target_system)]
        else:
            if (target_system, source_system) in self._transformations:
                inverse_transform = self._transformations[(target_system, source_system)]
                R_inv = inverse_transform.rotation_matrix.T
                return R_inv @ position
            else:
                raise ValueError(f"不支持的坐标变换: {source_system.value} -> {target_system.value}")
        
        result = transform.rotation_matrix @ position
        
        if transform.translation_vector is not None:
            result += transform.translation_vector
        
        return result * transform.scale_factor
    
    def to_spherical(self, position: np.ndarray) -> Tuple[float, float, float]:
        """笛卡尔坐标转球坐标
        
        Returns:
            (longitude, latitude, distance) [rad, rad, m]
        """
        position = np.asarray(position, dtype=np.float64)
        r = np.linalg.norm(position)
        
        if r < 1e-15:
            return 0.0, 0.0, 0.0
        
        lat = np.arcsin(position[2] / r)
        lon = np.arctan2(position[1], position[0])
        
        return lon, lat, r
    
    def apply_precession(
        self,
        position: np.ndarray,
        from_mjd: float,
        to_mjd: float
    ) -> np.ndarray:
        """应用岁差修正（IAU 2000A简化模型）
        
        Args:
            position: J2000赤道坐标
            from_mjd: 起始历元MJD
            to_mjd: 目标历元MJD
            
        Returns:
            岁差修正后的坐标
        """
        t = (to_mjd - from_mjd) / 36525.0
        
        zeta = degrees_to_radians(2306.2181 * t + 0.30188 * t**2 + 0.017998 * t**3) / 3600.0
        z = degrees_to_radians(2306.2181 * t + 1.09468 * t**2 + 0.018203 * t**3) / 3600.0
        theta = degrees_to_radians(2004.3109 * t - 0.42665 * t**2 - 0.041833 * t**3) / 3600.0
        
        R_z1 = np.array([
            [np.cos(zeta), np.sin(zeta), 0.0],
            [-np.sin(zeta), np.cos(zeta), 0.0],
            [0.0, 0.0, 1.0]
        ])
        
        R_y = np.array([
            [np.cos(theta), 0.0, -np.sin(theta)],
            [0.0, 1.0, 0.0],
            [np.sin(theta), 0.0, np.cos(theta)]
        ])
        
        R_z2 = np.array([
            [np.cos(z), np.sin(z), 0.0],
            [-np.sin(z), np.cos(z), 0.0],
            [0.0, 0.0, 1.0]
        ])
        
        R = R_z2 @ R_y @ R_z1
        
        return R @ position
    
    def apply_nutation(self, position: np.ndarray, mjd: float) -> np.ndarray:
        """应用章动修正（IAU 1980简化模型）
        
        Args:
            position: 平赤道坐标
            mjd: 儒略日时间
            
        Returns:
            真赤道坐标
        """
        t = (mjd - const.MJD_J2000) / 36525.0
        
        Omega = degrees_to_radians(125.04452 - 1934.136261 * t)
        
        delta_epsilon = degrees_to_radians(0.00256 * np.cos(Omega)) / 3600.0
        
        epsilon = degrees_to_radians(23.43928 + 0.0130042 * t)
        
        R_x = np.array([
            [1.0, 0.0, 0.0],
            [0.0, np.cos(epsilon + delta_epsilon), np.sin(epsilon + delta_epsilon)],
            [0.0, -np.sin(epsilon + delta_epsilon), np.cos(epsilon + delta_epsilon)]
        ])
        
        return R_x @ position
    
    def to_orbital_elements(
        self,
        position: np.ndarray,
        velocity: np.ndarray,
        gm: float = const.GM_EARTH
    ) -> Tuple[float, float, float, float, float, float]:
        """位置速度转轨道根数
        
        Returns:
            (a, e, i, omega, w, f) [m, -, rad, rad, rad, rad]
        """
        from .unit_conversion import velocity_to_orbital_elements
        return velocity_to_orbital_elements(position, velocity, gm)
    
    def from_orbital_elements(
        self,
        a: float,
        e: float,
        i: float,
        omega: float,
        w: float,
        f: float,
        gm: float = const.GM_EARTH
    ) -> Tuple[np.ndarray, np.ndarray]:
        """轨道根数转位置速度"""
        from .unit_conversion import orbital_elements_to_velocity
        return orbital_elements_to_velocity(a, e, i, omega, w, f, gm)


class ReferenceFrame:
    """参考架管理器"""
    
    def __init__(self):
        self.converter = CoordinateConverter()
        self.current_frame: CoordinateSystem = CoordinateSystem.J2000_EQUATORIAL
        self.current_epoch: float = const.MJD_J2000
    
    def set_frame(self, frame: CoordinateSystem, epoch: Optional[float] = None):
        """设置参考架"""
        self.current_frame = frame
        if epoch is not None:
            self.current_epoch = epoch
    
    def transform_to(
        self,
        position: np.ndarray,
        target_frame: CoordinateSystem,
        target_epoch: Optional[float] = None
    ) -> np.ndarray:
        """变换到目标参考架"""
        if target_epoch is None:
            target_epoch = self.current_epoch
        
        pos = position.copy()
        
        if self.current_frame != target_frame:
            pos = self.converter.convert(pos, self.current_frame, target_frame, self.current_epoch)
        
        if target_epoch != self.current_epoch:
            pos = self.converter.apply_precession(pos, self.current_epoch, target_epoch)
        
        return pos
    
    def get_frame_info(self) -> Dict[str, Any]:
        """获取参考架信息"""
        return {
            'frame': self.current_frame.value,
            'epoch_mjd': self.current_epoch,
            'epoch_datetime': self._mjd_to_datetime(self.current_epoch)
        }
    
    def _mjd_to_datetime(self, mjd: float) -> str:
        """MJD转日期字符串"""
        from datetime import datetime, timedelta
        jd = mjd + 2400000.5
        dt = datetime(1858, 11, 17) + timedelta(days=mjd)
        return dt.isoformat()


def get_earth_rotation_angle(mjd: float) -> float:
    """计算地球自转角（ERA）
    
    Args:
        mjd: 儒略日时间
        
    Returns:
        地球自转角 [rad]
    """
    d = mjd - const.MJD_J2000
    era = 2 * np.pi * (0.7790572732640 + 1.00273781191135448 * d)
    return era % (2 * np.pi)


def get_sidereal_time(mjd: float, longitude: float = 0.0) -> float:
    """计算恒星时
    
    Args:
        mjd: 儒略日时间
        longitude: 观测点经度 [rad]
        
    Returns:
        地方恒星时 [rad]
    """
    era = get_earth_rotation_angle(mjd)
    return (era + longitude) % (2 * np.pi)


@dataclass
class Observatory:
    """观测站"""
    name: str
    latitude: float
    longitude: float
    altitude: float = 0.0
    
    def get_geocentric_position(self, mjd: float) -> np.ndarray:
        """获取观测站的地心位置
        
        Args:
            mjd: 儒略日时间
            
        Returns:
            地心位置矢量 [m]
        """
        era = get_earth_rotation_angle(mjd)
        
        x = const.R_EARTH * np.cos(self.latitude) * np.cos(self.longitude + era)
        y = const.R_EARTH * np.cos(self.latitude) * np.sin(self.longitude + era)
        z = const.R_EARTH * np.sin(self.latitude)
        
        return np.array([x, y, z])
    
    def to_horizontal(
        self,
        target_position: np.ndarray,
        mjd: float
    ) -> Tuple[float, float, float]:
        """目标位置转地平坐标
        
        Args:
            target_position: 目标地心位置 [m]
            mjd: 儒略日时间
            
        Returns:
            (azimuth, elevation, distance) [rad, rad, m]
        """
        obs_pos = self.get_geocentric_position(mjd)
        rel_pos = target_position - obs_pos
        
        lst = get_sidereal_time(mjd, self.longitude)
        
        R_h = np.array([
            [np.sin(lst), -np.cos(lst), 0.0],
            [np.sin(self.latitude) * np.cos(lst), np.sin(self.latitude) * np.sin(lst), -np.cos(self.latitude)],
            [np.cos(self.latitude) * np.cos(lst), np.cos(self.latitude) * np.sin(lst), np.sin(self.latitude)]
        ])
        
        pos_h = R_h @ rel_pos
        
        az = np.arctan2(pos_h[0], -pos_h[1])
        el = np.arcsin(pos_h[2] / np.linalg.norm(pos_h))
        dist = np.linalg.norm(rel_pos)
        
        return az, el, dist

import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
from enum import Enum
import logging
from datetime import datetime, timedelta

from core import const
from .data_loader import ObservationData


class ObservationType(Enum):
    """观测类型枚举"""
    OPTICAL = "optical"
    RADAR = "radar"
    LASER = "laser"
    VLBI = "vlbi"
    GPS = "gps"
    MULTI = "multi"


class CoordinateSystem(Enum):
    """坐标系枚举"""
    ECI = "eci"
    ECEF = "ecef"
    GCRF = "gcrf"
    ITRF = "itrf"
    J2000 = "j2000"
    BARYCENTRIC = "barycentric"


@dataclass
class RawObservation:
    """原始观测数据"""
    time: float
    measurement: np.ndarray
    observation_type: ObservationType
    coordinate_system: CoordinateSystem
    uncertainty: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedObservation:
    """解析后的观测数据"""
    time_mjd: float
    position: np.ndarray
    velocity: Optional[np.ndarray] = None
    uncertainty: Optional[np.ndarray] = None
    coordinate_system: CoordinateSystem = CoordinateSystem.GCRF
    observation_type: ObservationType = ObservationType.OPTICAL
    residuals: Optional[np.ndarray] = None
    weight: float = 1.0


class ObservationParser:
    """观测数据解析器"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.parsed_observations: Dict[str, List[ParsedObservation]] = {}
    
    def parse_optical_observation(
        self,
        time: str,
        ra: float,
        dec: float,
        distance: Optional[float] = None,
        time_format: str = "iso"
    ) -> ParsedObservation:
        """解析光学观测数据（赤经赤纬）
        
        Args:
            time: 观测时间
            ra: 赤经（度）
            dec: 赤纬（度）
            distance: 距离（米），如果是测距观测
            time_format: 时间格式
        """
        mjd = self._parse_time(time, time_format)
        
        ra_rad = np.deg2rad(ra)
        dec_rad = np.deg2rad(dec)
        
        if distance is not None:
            position = np.array([
                distance * np.cos(dec_rad) * np.cos(ra_rad),
                distance * np.cos(dec_rad) * np.sin(ra_rad),
                distance * np.sin(dec_rad)
            ])
        else:
            position = np.array([
                np.cos(dec_rad) * np.cos(ra_rad),
                np.cos(dec_rad) * np.sin(ra_rad),
                np.sin(dec_rad)
            ])
        
        return ParsedObservation(
            time_mjd=mjd,
            position=position,
            coordinate_system=CoordinateSystem.GCRF,
            observation_type=ObservationType.OPTICAL
        )
    
    def parse_radar_observation(
        self,
        time: str,
        range_: float,
        range_rate: float,
        azimuth: float,
        elevation: float,
        time_format: str = "iso",
        station_position: Optional[np.ndarray] = None
    ) -> ParsedObservation:
        """解析雷达观测数据
        
        Args:
            time: 观测时间
            range_: 距离（米）
            range_rate: 距离变化率（m/s）
            azimuth: 方位角（度）
            elevation: 仰角（度）
            time_format: 时间格式
            station_position: 测站位置（ECEF坐标系，米）
        """
        mjd = self._parse_time(time, time_format)
        
        az_rad = np.deg2rad(azimuth)
        el_rad = np.deg2rad(elevation)
        
        line_of_sight = np.array([
            np.cos(el_rad) * np.cos(az_rad),
            np.cos(el_rad) * np.sin(az_rad),
            np.sin(el_rad)
        ])
        
        position = station_position + range_ * line_of_sight if station_position is not None else range_ * line_of_sight
        
        velocity = range_rate * line_of_sight
        
        return ParsedObservation(
            time_mjd=mjd,
            position=position,
            velocity=velocity,
            coordinate_system=CoordinateSystem.ECEF,
            observation_type=ObservationType.RADAR
        )
    
    def parse_laser_ranging(
        self,
        time: str,
        range_: float,
        time_format: str = "iso"
    ) -> ParsedObservation:
        """解析激光测距数据"""
        mjd = self._parse_time(time, time_format)
        
        return ParsedObservation(
            time_mjd=mjd,
            position=np.array([range_, 0, 0]),
            coordinate_system=CoordinateSystem.GCRF,
            observation_type=ObservationType.LASER,
            uncertainty=np.array([0.001, 0.001, 0.001])
        )
    
    def parse_state_vector(
        self,
        time: str,
        position: List[float],
        velocity: Optional[List[float]] = None,
        coordinate_system: CoordinateSystem = CoordinateSystem.GCRF,
        time_format: str = "iso"
    ) -> ParsedObservation:
        """解析状态矢量观测"""
        mjd = self._parse_time(time, time_format)
        
        return ParsedObservation(
            time_mjd=mjd,
            position=np.array(position),
            velocity=np.array(velocity) if velocity else None,
            coordinate_system=coordinate_system,
            observation_type=ObservationType.MULTI
        )
    
    def parse_tle_observation(
        self,
        tle_line1: str,
        tle_line2: str
    ) -> ParsedObservation:
        """从TLE中提取参考观测"""
        epoch_year = int(tle_line1[18:20])
        epoch_day = float(tle_line1[20:32])
        epoch_year += 2000 if epoch_year < 57 else 1900
        
        year_start = datetime(epoch_year, 1, 1)
        epoch_date = year_start + timedelta(days=epoch_day - 1)
        mjd = (epoch_date - datetime(1858, 11, 17)).total_seconds() / 86400.0
        
        a = (float(tle_line2[52:63]) * 2 * np.pi / 86400) ** (-2/3) * (const.GM_EARTH) ** (1/3)
        e = float('0.' + tle_line2[26:33])
        i = np.deg2rad(float(tle_line2[8:16]))
        omega = np.deg2rad(float(tle_line2[17:25]))
        w = np.deg2rad(float(tle_line2[34:42]))
        M = np.deg2rad(float(tle_line2[43:51]))
        
        E = M
        for _ in range(50):
            dE = (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
            E -= dE
            if abs(dE) < 1e-12:
                break
        
        f = 2 * np.arctan2(np.sqrt(1 + e) * np.sin(E / 2), np.sqrt(1 - e) * np.cos(E / 2))
        r_mag = a * (1 - e * np.cos(E))
        
        u = w + f
        x = r_mag * (np.cos(omega) * np.cos(u) - np.sin(omega) * np.sin(u) * np.cos(i))
        y = r_mag * (np.sin(omega) * np.cos(u) + np.cos(omega) * np.sin(u) * np.cos(i))
        z = r_mag * np.sin(u) * np.sin(i)
        
        return ParsedObservation(
            time_mjd=mjd,
            position=np.array([x, y, z]),
            coordinate_system=CoordinateSystem.GCRF,
            observation_type=ObservationType.MULTI
        )
    
    def parse_observation_batch(
        self,
        observations: List[RawObservation],
        body_name: str
    ) -> List[ParsedObservation]:
        """批量解析观测数据"""
        parsed = []
        
        for obs in observations:
            if obs.observation_type == ObservationType.OPTICAL:
                if len(obs.measurement) >= 2:
                    ra, dec = obs.measurement[0], obs.measurement[1]
                    distance = obs.measurement[2] if len(obs.measurement) > 2 else None
                    parsed_obs = self.parse_optical_observation(
                        str(obs.time), ra, dec, distance
                    )
                    parsed_obs.uncertainty = np.array([obs.uncertainty] * 3) if obs.uncertainty else None
                    parsed.append(parsed_obs)
            
            elif obs.observation_type == ObservationType.RADAR:
                if len(obs.measurement) >= 4:
                    parsed_obs = self.parse_radar_observation(
                        str(obs.time),
                        obs.measurement[0], obs.measurement[1],
                        obs.measurement[2], obs.measurement[3]
                    )
                    parsed.append(parsed_obs)
        
        self.parsed_observations[body_name] = parsed
        self.logger.info(f"已解析 {len(parsed)} 个观测数据，天体: {body_name}")
        
        return parsed
    
    def to_observation_data(
        self,
        parsed_obs: List[ParsedObservation],
        body_name: str
    ) -> ObservationData:
        """将解析后的观测转换为ObservationData格式"""
        times = np.array([obs.time_mjd for obs in parsed_obs])
        positions = np.array([obs.position for obs in parsed_obs])
        velocities = None
        
        if all(obs.velocity is not None for obs in parsed_obs):
            velocities = np.array([obs.velocity for obs in parsed_obs])
        
        uncertainties = None
        if all(obs.uncertainty is not None for obs in parsed_obs):
            uncertainties = np.array([np.linalg.norm(obs.uncertainty) for obs in parsed_obs])
        
        return ObservationData(
            body_name=body_name,
            time=times,
            position=positions,
            velocity=velocities,
            uncertainty=uncertainties,
            observation_type=parsed_obs[0].observation_type.value if parsed_obs else "optical"
        )
    
    def apply_outlier_rejection(
        self,
        observations: List[ParsedObservation],
        sigma_threshold: float = 3.0
    ) -> List[ParsedObservation]:
        """应用异常值剔除"""
        if len(observations) < 5:
            return observations
        
        positions = np.array([obs.position for obs in observations])
        mean_pos = np.mean(positions, axis=0)
        std_pos = np.std(positions, axis=0)
        
        filtered = []
        for obs in observations:
            deviation = np.abs(obs.position - mean_pos)
            if np.all(deviation < sigma_threshold * std_pos):
                filtered.append(obs)
        
        self.logger.info(f"异常值剔除: {len(observations)} -> {len(filtered)}")
        return filtered
    
    def interpolate_observations(
        self,
        observations: List[ParsedObservation],
        target_times: np.ndarray
    ) -> List[ParsedObservation]:
        """插值观测数据到指定时间点"""
        times = np.array([obs.time_mjd for obs in observations])
        positions = np.array([obs.position for obs in observations])
        
        if len(observations) < 2:
            return observations
        
        interp_positions = np.array([
            np.interp(target_times, times, positions[:, i])
            for i in range(3)
        ]).T
        
        interp_obs = []
        for t, pos in zip(target_times, interp_positions):
            interp_obs.append(ParsedObservation(
                time_mjd=t,
                position=pos,
                observation_type=ObservationType.MULTI
            ))
        
        return interp_obs
    
    def _parse_time(self, time_str: str, format: str) -> float:
        """解析时间为MJD"""
        try:
            if format == "iso":
                dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
            elif format == "jd":
                jd = float(time_str)
                return jd - 2400000.5
            elif format == "mjd":
                return float(time_str)
            else:
                dt = datetime.strptime(time_str, format)
            
            return (dt - datetime(1858, 11, 17)).total_seconds() / 86400.0
        
        except Exception as e:
            self.logger.warning(f"时间解析失败: {time_str}, 错误: {e}")
            return 0.0
    
    def coordinate_transform(
        self,
        observation: ParsedObservation,
        target_system: CoordinateSystem,
        mjd: Optional[float] = None
    ) -> ParsedObservation:
        """坐标系转换（简化版）"""
        if observation.coordinate_system == target_system:
            return observation
        
        mjd = mjd or observation.time_mjd
        gmst = self._calculate_gmst(mjd)
        
        if observation.coordinate_system == CoordinateSystem.ECEF and target_system == CoordinateSystem.ECI:
            R = np.array([
                [np.cos(gmst), -np.sin(gmst), 0],
                [np.sin(gmst), np.cos(gmst), 0],
                [0, 0, 1]
            ])
            new_pos = R @ observation.position
            new_vel = R @ observation.velocity if observation.velocity is not None else None
        elif observation.coordinate_system == CoordinateSystem.ECI and target_system == CoordinateSystem.ECEF:
            R = np.array([
                [np.cos(gmst), np.sin(gmst), 0],
                [-np.sin(gmst), np.cos(gmst), 0],
                [0, 0, 1]
            ])
            new_pos = R @ observation.position
            new_vel = R @ observation.velocity if observation.velocity is not None else None
        else:
            new_pos = observation.position
            new_vel = observation.velocity
        
        return ParsedObservation(
            time_mjd=observation.time_mjd,
            position=new_pos,
            velocity=new_vel,
            uncertainty=observation.uncertainty,
            coordinate_system=target_system,
            observation_type=observation.observation_type
        )
    
    @staticmethod
    def _calculate_gmst(mjd: float) -> float:
        """计算格林威治平恒星时（简化版）"""
        jd = mjd + 2400000.5
        T = (jd - 2451545.0) / 36525.0
        
        gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
        gmst += 0.0003032 * T ** 2
        
        return np.deg2rad(gmst % 360)

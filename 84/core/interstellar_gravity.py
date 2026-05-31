import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Callable
from enum import Enum

from .unit_conversion import const
from .orbit_parameters import CelestialBody, OrbitalElements


class GravityModelType(Enum):
    """引力模型类型"""
    NEWTONIAN = "newtonian"
    POST_NEWTONIAN = "post_newtonian"
    TIDAL = "tidal"
    RELATIVISTIC = "relativistic"


class CouplingStrength(Enum):
    """耦合强度级别"""
    WEAK = "weak"
    MODERATE = "moderate"
    STRONG = "strong"
    DOMINANT = "dominant"


@dataclass
class GravityInteraction:
    """引力相互作用描述"""
    body1_name: str
    body2_name: str
    acceleration: np.ndarray
    magnitude: float
    distance: float
    model_type: GravityModelType
    coupling_strength: CouplingStrength
    jacobian: Optional[np.ndarray] = None


@dataclass
class CouplingMatrix:
    """耦合矩阵"""
    body_names: List[str]
    matrix: np.ndarray
    threshold: float
    
    def get_strong_couplings(self) -> List[Tuple[int, int]]:
        """获取强耦合对"""
        couplings = []
        n = len(self.body_names)
        for i in range(n):
            for j in range(i + 1, n):
                if self.matrix[i, j] >= self.threshold:
                    couplings.append((i, j))
        return couplings
    
    def get_body_couplings(self, body_idx: int) -> List[int]:
        """获取与指定天体耦合的天体索引"""
        return [j for j in range(len(self.body_names)) 
                if j != body_idx and self.matrix[body_idx, j] >= self.threshold]


@dataclass
class GravityField:
    """引力场描述"""
    position: np.ndarray
    gravitational_potential: float
    acceleration: np.ndarray
    tidal_tensor: np.ndarray
    contributing_bodies: List[str]


class InterstellarGravityCalculator:
    """星际引力耦合叠加计算器"""
    
    def __init__(self, gravitational_constant: float = const.G):
        self.G = gravitational_constant
        self.interactions_log: List[GravityInteraction] = []
    
    def newtonian_acceleration(
        self,
        r1: np.ndarray,
        r2: np.ndarray,
        m2: float
    ) -> np.ndarray:
        """计算牛顿引力加速度
        
        Args:
            r1: 受力天体位置
            r2: 施力天体位置
            m2: 施力天体质量
            
        Returns:
            引力加速度矢量
        """
        r1 = np.asarray(r1, dtype=np.float128)
        r2 = np.asarray(r2, dtype=np.float128)
        
        r_rel = r2 - r1
        r_mag = np.linalg.norm(r_rel)
        
        if r_mag < 1e-15:
            return np.zeros(3, dtype=np.float128)
        
        acc = self.G * m2 * r_rel / (r_mag ** 3)
        return np.asarray(acc, dtype=np.float64)
    
    def post_newtonian_acceleration(
        self,
        r1: np.ndarray,
        v1: np.ndarray,
        r2: np.ndarray,
        v2: np.ndarray,
        m2: float
    ) -> np.ndarray:
        """计算后牛顿近似引力加速度（1PN）
        
        Args:
            r1: 受力天体位置
            v1: 受力天体速度
            r2: 施力天体位置
            v2: 施力天体速度
            m2: 施力天体质量
            
        Returns:
            后牛顿修正加速度
        """
        r1 = np.asarray(r1, dtype=np.float128)
        v1 = np.asarray(v1, dtype=np.float128)
        r2 = np.asarray(r2, dtype=np.float128)
        v2 = np.asarray(v2, dtype=np.float128)
        
        r_rel = r2 - r1
        v_rel = v2 - v1
        r_mag = np.linalg.norm(r_rel)
        
        if r_mag < 1e-15:
            return np.zeros(3, dtype=np.float128)
        
        c2 = const.C ** 2
        r_dot_v = np.dot(r_rel, v_rel)
        v1_sq = np.dot(v1, v1)
        v2_sq = np.dot(v2, v2)
        
        factor = self.G * m2 / (c2 * r_mag ** 3)
        
        term1 = (4 * self.G * m2 / r_mag - v1_sq - 2 * v2_sq + 4 * np.dot(v1, v2)) * r_rel
        term2 = 4 * r_dot_v * v_rel
        
        acc_pn = factor * (term1 + term2)
        
        return np.asarray(acc_pn, dtype=np.float64)
    
    def tidal_tensor(
        self,
        r: np.ndarray,
        source_positions: List[np.ndarray],
        source_masses: List[float]
    ) -> np.ndarray:
        """计算潮汐力张量
        
        Args:
            r: 计算点位置
            source_positions: 引力源位置列表
            source_masses: 引力源质量列表
            
        Returns:
            3x3 潮汐张量
        """
        r = np.asarray(r, dtype=np.float128)
        tidal = np.zeros((3, 3), dtype=np.float128)
        
        for pos, mass in zip(source_positions, source_masses):
            pos = np.asarray(pos, dtype=np.float128)
            r_rel = pos - r
            r_mag = np.linalg.norm(r_rel)
            
            if r_mag < 1e-15:
                continue
            
            factor = self.G * mass / (r_mag ** 5)
            r_outer = np.outer(r_rel, r_rel)
            
            tidal += factor * (3 * r_outer - r_mag ** 2 * np.eye(3))
        
        return np.asarray(tidal, dtype=np.float64)
    
    def compute_total_gravity(
        self,
        target_pos: np.ndarray,
        target_vel: Optional[np.ndarray],
        source_bodies: List[CelestialBody],
        time_mjd: float,
        model_type: GravityModelType = GravityModelType.NEWTONIAN,
        enable_logging: bool = False
    ) -> np.ndarray:
        """计算总引力加速度（叠加所有引力源）
        
        Args:
            target_pos: 目标天体位置
            target_vel: 目标天体速度（后牛顿模型需要）
            source_bodies: 引力源天体列表
            time_mjd: 儒略日时间
            model_type: 引力模型类型
            enable_logging: 是否记录相互作用
            
        Returns:
            总引力加速度
        """
        target_pos = np.asarray(target_pos, dtype=np.float64)
        total_acc = np.zeros(3, dtype=np.float64)
        
        if enable_logging:
            self.interactions_log.clear()
        
        for body in source_bodies:
            try:
                source_pos = body.get_position(time_mjd)
                
                if model_type == GravityModelType.POST_NEWTONIAN and target_vel is not None:
                    source_vel = body.get_velocity(time_mjd)
                    acc = self.post_newtonian_acceleration(
                        target_pos, target_vel,
                        source_pos, source_vel, body.mass
                    )
                else:
                    acc = self.newtonian_acceleration(target_pos, source_pos, body.mass)
                
                total_acc += acc
                
                if enable_logging:
                    r_rel = source_pos - target_pos
                    r_mag = np.linalg.norm(r_rel)
                    acc_mag = np.linalg.norm(acc)
                    coupling_strength = self._classify_coupling(acc_mag, r_mag, body.mass)
                    
                    interaction = GravityInteraction(
                        body1_name="target",
                        body2_name=body.name,
                        acceleration=acc.copy(),
                        magnitude=acc_mag,
                        distance=r_mag,
                        model_type=model_type,
                        coupling_strength=coupling_strength
                    )
                    self.interactions_log.append(interaction)
                    
            except Exception as e:
                continue
        
        return total_acc
    
    def compute_coupling_matrix(
        self,
        bodies: List[CelestialBody],
        time_mjd: float,
        threshold: float = 1e-15
    ) -> CouplingMatrix:
        """计算天体间的耦合矩阵
        
        Args:
            bodies: 天体列表
            time_mjd: 儒略日时间
            threshold: 耦合阈值
            
        Returns:
            耦合矩阵对象
        """
        n = len(bodies)
        matrix = np.zeros((n, n), dtype=np.float64)
        names = [body.name for body in bodies]
        
        positions = []
        masses = []
        for body in bodies:
            try:
                pos = body.get_position(time_mjd)
                positions.append(pos)
                masses.append(body.mass)
            except Exception:
                positions.append(np.zeros(3))
                masses.append(0.0)
        
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i, j] = 0.0
                    continue
                
                if masses[j] == 0.0:
                    matrix[i, j] = 0.0
                    continue
                
                acc = self.newtonian_acceleration(positions[i], positions[j], masses[j])
                matrix[i, j] = np.linalg.norm(acc)
        
        return CouplingMatrix(
            body_names=names,
            matrix=matrix,
            threshold=threshold
        )
    
    def compute_gravity_field(
        self,
        field_point: np.ndarray,
        source_bodies: List[CelestialBody],
        time_mjd: float
    ) -> GravityField:
        """计算空间某点的引力场
        
        Args:
            field_point: 场点位置
            source_bodies: 引力源天体列表
            time_mjd: 儒略日时间
            
        Returns:
            引力场对象
        """
        field_point = np.asarray(field_point, dtype=np.float64)
        
        potential = 0.0
        acceleration = np.zeros(3, dtype=np.float64)
        contributing = []
        
        source_positions = []
        source_masses = []
        
        for body in source_bodies:
            try:
                pos = body.get_position(time_mjd)
                r_rel = pos - field_point
                r_mag = np.linalg.norm(r_rel)
                
                if r_mag < 1e-15:
                    continue
                
                potential -= self.G * body.mass / r_mag
                acceleration += self.G * body.mass * r_rel / (r_mag ** 3)
                
                source_positions.append(pos)
                source_masses.append(body.mass)
                contributing.append(body.name)
            except Exception:
                continue
        
        tidal = self.tidal_tensor(field_point, source_positions, source_masses)
        
        return GravityField(
            position=field_point,
            gravitational_potential=float(potential),
            acceleration=acceleration,
            tidal_tensor=tidal,
            contributing_bodies=contributing
        )
    
    def _classify_coupling(
        self,
        acceleration_mag: float,
        distance: float,
        mass: float
    ) -> CouplingStrength:
        """分类耦合强度"""
        if acceleration_mag < 1e-12:
            return CouplingStrength.WEAK
        elif acceleration_mag < 1e-9:
            return CouplingStrength.MODERATE
        elif acceleration_mag < 1e-6:
            return CouplingStrength.STRONG
        else:
            return CouplingStrength.DOMINANT
    
    def hierarchical_summation(
        self,
        accelerations: List[np.ndarray],
        strategy: str = "kahan"
    ) -> np.ndarray:
        """层次化求和算法，减少浮点误差
        
        Args:
            accelerations: 加速度列表
            strategy: 求和策略 (kahan, pairwise, naive)
            
        Returns:
            求和结果
        """
        if not accelerations:
            return np.zeros(3)
        
        if strategy == "kahan":
            return self._kahan_summation(accelerations)
        elif strategy == "pairwise":
            return self._pairwise_summation(accelerations)
        else:
            return sum(accelerations)
    
    def _kahan_summation(self, values: List[np.ndarray]) -> np.ndarray:
        """Kahan求和算法"""
        s = np.zeros(3, dtype=np.float128)
        c = np.zeros(3, dtype=np.float128)
        
        for v in values:
            v = np.asarray(v, dtype=np.float128)
            y = v - c
            t = s + y
            c = (t - s) - y
            s = t
        
        return np.asarray(s, dtype=np.float64)
    
    def _pairwise_summation(self, values: List[np.ndarray]) -> np.ndarray:
        """成对求和算法"""
        if len(values) == 1:
            return values[0]
        elif len(values) == 2:
            return values[0] + values[1]
        else:
            mid = len(values) // 2
            return self._pairwise_summation(values[:mid]) + self._pairwise_summation(values[mid:])
    
    def get_interaction_summary(self) -> Dict:
        """获取相互作用统计摘要"""
        if not self.interactions_log:
            return {}
        
        total_acc = np.zeros(3)
        magnitudes = []
        
        for interaction in self.interactions_log:
            total_acc += interaction.acceleration
            magnitudes.append(interaction.magnitude)
        
        return {
            'num_interactions': len(self.interactions_log),
            'total_acceleration': total_acc,
            'total_magnitude': np.linalg.norm(total_acc),
            'mean_magnitude': np.mean(magnitudes) if magnitudes else 0,
            'max_magnitude': np.max(magnitudes) if magnitudes else 0,
            'min_magnitude': np.min(magnitudes) if magnitudes else 0
        }

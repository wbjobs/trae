import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Union
from enum import Enum
import os
import json
import csv
import logging
from pathlib import Path

from core import (
    CelestialBody,
    OrbitalElements,
    CentralBody,
    OrbitElementUnit,
    OrbitParameterImporter,
    const
)


class DataFormat(Enum):
    """数据格式枚举"""
    CSV = "csv"
    JSON = "json"
    TLE = "tle"
    OMM = "omm"
    CUSTOM = "custom"


@dataclass
class ObservationData:
    """观测数据容器"""
    body_name: str
    time: np.ndarray
    position: np.ndarray
    velocity: Optional[np.ndarray] = None
    uncertainty: Optional[np.ndarray] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    source: str = ""
    observation_type: str = "optical"


@dataclass
class EphemerisData:
    """星历数据容器"""
    body_name: str
    time: np.ndarray
    position: np.ndarray
    velocity: np.ndarray
    elements: Optional[np.ndarray] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    source: str = ""


class DataLoader:
    """数据加载器"""
    
    def __init__(self, base_dir: str = "data"):
        self.base_dir = Path(base_dir)
        self.raw_dir = self.base_dir / "raw"
        self.processed_dir = self.base_dir / "processed"
        
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        
        self.observations: Dict[str, ObservationData] = {}
        self.ephemerides: Dict[str, EphemerisData] = {}
        
        self.logger = logging.getLogger(__name__)
    
    def load_observations_from_csv(
        self,
        filepath: str,
        body_name: str = "",
        **kwargs
    ) -> ObservationData:
        """从CSV文件加载观测数据
        
        CSV格式要求:
        time (MJD), pos_x, pos_y, pos_z, [vel_x, vel_y, vel_z], [uncertainty]
        """
        df = pd.read_csv(filepath, **kwargs)
        
        time = df.iloc[:, 0].values
        pos_cols = [1, 2, 3] if 'pos_x' not in df.columns else ['pos_x', 'pos_y', 'pos_z']
        position = df[pos_cols].values
        
        velocity = None
        vel_cols = [4, 5, 6] if 'vel_x' not in df.columns else ['vel_x', 'vel_y', 'vel_z']
        if all(col in df.columns for col in vel_cols) if isinstance(vel_cols[0], str) else len(df.columns) >= 7:
            velocity = df[vel_cols].values
        
        uncertainty = None
        if 'uncertainty' in df.columns:
            uncertainty = df['uncertainty'].values
        
        obs = ObservationData(
            body_name=body_name or Path(filepath).stem,
            time=time,
            position=position,
            velocity=velocity,
            uncertainty=uncertainty,
            source=filepath,
            metadata={'columns': list(df.columns)}
        )
        
        self.observations[obs.body_name] = obs
        self.logger.info(f"已加载观测数据: {obs.body_name}, {len(time)} 个数据点")
        
        return obs
    
    def load_ephemeris_from_csv(
        self,
        filepath: str,
        body_name: str = "",
        **kwargs
    ) -> EphemerisData:
        """从CSV文件加载星历数据"""
        df = pd.read_csv(filepath, **kwargs)
        
        time = df.iloc[:, 0].values
        
        if 'pos_x' in df.columns:
            position = df[['pos_x', 'pos_y', 'pos_z']].values
            velocity = df[['vel_x', 'vel_y', 'vel_z']].values
        else:
            position = df.iloc[:, 1:4].values
            velocity = df.iloc[:, 4:7].values if len(df.columns) >= 7 else None
        
        elements = None
        if all(col in df.columns for col in ['a', 'e', 'i', 'omega', 'w', 'M']):
            elements = df[['a', 'e', 'i', 'omega', 'w', 'M']].values
        
        eph = EphemerisData(
            body_name=body_name or Path(filepath).stem,
            time=time,
            position=position,
            velocity=velocity,
            elements=elements,
            source=filepath
        )
        
        self.ephemerides[eph.body_name] = eph
        self.logger.info(f"已加载星历数据: {eph.body_name}, {len(time)} 个数据点")
        
        return eph
    
    def load_orbital_elements_from_csv(
        self,
        filepath: str,
        units: Dict[str, OrbitElementUnit] = None
    ) -> List[CelestialBody]:
        """从CSV文件加载轨道参数
        
        CSV格式:
        name,a,e,i,omega,w,M,epoch,central_body
        """
        importer = OrbitParameterImporter()
        bodies = importer.import_from_csv(filepath)
        self.logger.info(f"已从CSV加载 {len(bodies)} 个天体的轨道参数")
        return bodies
    
    def load_from_tle(
        self,
        filepath: str,
        names: Optional[List[str]] = None
    ) -> List[CelestialBody]:
        """从TLE文件加载轨道参数"""
        importer = OrbitParameterImporter()
        bodies = []
        
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        for i in range(0, len(lines), 2):
            if i + 1 >= len(lines):
                break
            
            line1 = lines[i].strip()
            line2 = lines[i + 1].strip()
            
            if line1.startswith('1 ') and line2.startswith('2 '):
                name = names[i // 2] if names and i // 2 < len(names) else f"Satellite_{i // 2}"
                body = importer.import_from_tle(line1, line2, name)
                bodies.append(body)
        
        self.logger.info(f"已从TLE文件加载 {len(bodies)} 个天体")
        return bodies
    
    def load_from_json(
        self,
        filepath: str
    ) -> Union[ObservationData, EphemerisData, List[CelestialBody]]:
        """从JSON文件加载数据"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        data_type = data.get('type', 'observation')
        
        if data_type == 'observation':
            obs = ObservationData(
                body_name=data.get('body_name', ''),
                time=np.array(data['time']),
                position=np.array(data['position']),
                velocity=np.array(data['velocity']) if 'velocity' in data else None,
                uncertainty=np.array(data['uncertainty']) if 'uncertainty' in data else None,
                metadata=data.get('metadata', {}),
                source=filepath,
                observation_type=data.get('observation_type', 'optical')
            )
            self.observations[obs.body_name] = obs
            return obs
        
        elif data_type == 'ephemeris':
            eph = EphemerisData(
                body_name=data.get('body_name', ''),
                time=np.array(data['time']),
                position=np.array(data['position']),
                velocity=np.array(data['velocity']),
                elements=np.array(data['elements']) if 'elements' in data else None,
                metadata=data.get('metadata', {}),
                source=filepath
            )
            self.ephemerides[eph.body_name] = eph
            return eph
        
        elif data_type == 'bodies':
            bodies = []
            importer = OrbitParameterImporter()
            
            for body_data in data.get('bodies', []):
                units = body_data.get('units', {})
                body = importer.import_from_kepler_elements(
                    name=body_data['name'],
                    a=body_data['a'],
                    e=body_data['e'],
                    i=body_data['i'],
                    omega=body_data['omega'],
                    w=body_data['w'],
                    M=body_data['M'],
                    epoch=body_data.get('epoch', const.MJD_J2000),
                    central_body=CentralBody(body_data.get('central_body', 'sun')),
                    units={
                        'a': OrbitElementUnit(units.get('a', 'meters')),
                        'angles': OrbitElementUnit(units.get('angles', 'radians'))
                    }
                )
                bodies.append(body)
            
            return bodies
        
        else:
            raise ValueError(f"未知的数据类型: {data_type}")
    
    def save_processed_data(
        self,
        data: Union[ObservationData, EphemerisData],
        filename: str,
        format: DataFormat = DataFormat.CSV
    ):
        """保存处理后的数据"""
        filepath = self.processed_dir / filename
        
        if format == DataFormat.CSV:
            if isinstance(data, ObservationData):
                df = pd.DataFrame({
                    'time': data.time,
                    'pos_x': data.position[:, 0],
                    'pos_y': data.position[:, 1],
                    'pos_z': data.position[:, 2]
                })
                if data.velocity is not None:
                    df['vel_x'] = data.velocity[:, 0]
                    df['vel_y'] = data.velocity[:, 1]
                    df['vel_z'] = data.velocity[:, 2]
                if data.uncertainty is not None:
                    df['uncertainty'] = data.uncertainty
                df.to_csv(filepath, index=False)
            
            elif isinstance(data, EphemerisData):
                df = pd.DataFrame({
                    'time': data.time,
                    'pos_x': data.position[:, 0],
                    'pos_y': data.position[:, 1],
                    'pos_z': data.position[:, 2],
                    'vel_x': data.velocity[:, 0],
                    'vel_y': data.velocity[:, 1],
                    'vel_z': data.velocity[:, 2]
                })
                if data.elements is not None:
                    df['a'] = data.elements[:, 0]
                    df['e'] = data.elements[:, 1]
                    df['i'] = data.elements[:, 2]
                    df['omega'] = data.elements[:, 3]
                    df['w'] = data.elements[:, 4]
                    df['M'] = data.elements[:, 5]
                df.to_csv(filepath, index=False)
        
        elif format == DataFormat.JSON:
            output = {
                'type': 'observation' if isinstance(data, ObservationData) else 'ephemeris',
                'body_name': data.body_name,
                'time': data.time.tolist(),
                'position': data.position.tolist(),
                'velocity': data.velocity.tolist() if data.velocity is not None else None,
                'metadata': data.metadata,
                'source': data.source
            }
            if isinstance(data, ObservationData):
                output['observation_type'] = data.observation_type
                output['uncertainty'] = data.uncertainty.tolist() if data.uncertainty is not None else None
            else:
                output['elements'] = data.elements.tolist() if data.elements is not None else None
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)
        
        self.logger.info(f"已保存处理后的数据: {filepath}")
    
    def list_raw_files(self) -> List[str]:
        """列出原始数据目录中的文件"""
        return [f.name for f in self.raw_dir.iterdir() if f.is_file()]
    
    def list_processed_files(self) -> List[str]:
        """列出处理后数据目录中的文件"""
        return [f.name for f in self.processed_dir.iterdir() if f.is_file()]
    
    def get_observation(self, body_name: str) -> Optional[ObservationData]:
        """获取观测数据"""
        return self.observations.get(body_name)
    
    def get_ephemeris(self, body_name: str) -> Optional[EphemerisData]:
        """获取星历数据"""
        return self.ephemerides.get(body_name)
    
    def clear_all(self):
        """清空所有加载的数据"""
        self.observations.clear()
        self.ephemerides.clear()

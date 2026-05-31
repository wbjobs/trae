import numpy as np
from typing import List, Tuple
import struct
import zlib

class PointCloudProcessor:
    def __init__(self):
        pass
    
    def load_point_cloud(self, filepath: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        ext = filepath.lower().split('.')[-1]
        
        if ext == 'las' or ext == 'laz':
            return self._load_las(filepath)
        elif ext == 'ply':
            return self._load_ply(filepath)
        else:
            raise ValueError(f"Unsupported file format: {ext}")
    
    def _load_las(self, filepath: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        import laspy
        las = laspy.read(filepath)
        
        points = np.stack([las.x, las.y, las.z], axis=-1).astype(np.float32)
        
        if hasattr(las, 'red') and hasattr(las, 'green') and hasattr(las, 'blue'):
            colors = np.stack([las.red, las.green, las.blue], axis=-1).astype(np.float32)
            if colors.max() > 1.0:
                colors /= 65535.0 if colors.max() > 255 else 255.0
        else:
            colors = np.ones_like(points, dtype=np.float32) * 0.7
        
        if hasattr(las, 'intensity'):
            features = las.intensity.astype(np.float32).reshape(-1, 1)
        else:
            features = np.zeros((points.shape[0], 1), dtype=np.float32)
        
        return points, colors, features
    
    def _load_ply(self, filepath: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        from plyfile import PlyData
        ply = PlyData.read(filepath)
        vertex = ply['vertex']
        
        points = np.stack([
            np.array(vertex['x'], dtype=np.float32),
            np.array(vertex['y'], dtype=np.float32),
            np.array(vertex['z'], dtype=np.float32)
        ], axis=-1)
        
        if 'red' in vertex and 'green' in vertex and 'blue' in vertex:
            colors = np.stack([
                np.array(vertex['red'], dtype=np.float32),
                np.array(vertex['green'], dtype=np.float32),
                np.array(vertex['blue'], dtype=np.float32)
            ], axis=-1)
            if colors.max() > 1.0:
                colors /= 255.0
        else:
            colors = np.ones_like(points, dtype=np.float32) * 0.7
        
        features = np.zeros((points.shape[0], 1), dtype=np.float32)
        if 'intensity' in vertex:
            features = np.array(vertex['intensity'], dtype=np.float32).reshape(-1, 1)
        
        return points, colors, features

class OctreeNode:
    def __init__(self, center: np.ndarray, half_size: float, depth: int):
        self.center = center
        self.half_size = half_size
        self.depth = depth
        self.children = []
        self.point_indices = []
        self.node_id = None
    
    def is_leaf(self) -> bool:
        return len(self.children) == 0

class OctreeLOD:
    def __init__(self, points: np.ndarray, max_depth: int = 8, max_points_per_node: int = 10000):
        self.points = points
        self.max_depth = max_depth
        self.max_points_per_node = max_points_per_node
        self.nodes = []
        self._node_counter = 0
        
        self.bounds_min = np.min(points, axis=0)
        self.bounds_max = np.max(points, axis=0)
        center = (self.bounds_min + self.bounds_max) / 2
        half_size = np.max(self.bounds_max - self.bounds_min) / 2
        
        self.root = OctreeNode(center, half_size, 0)
        self._build(self.root, np.arange(len(points)))
    
    def _build(self, node: OctreeNode, indices: np.ndarray):
        node.node_id = self._node_counter
        self._node_counter += 1
        self.nodes.append(node)
        
        if len(indices) <= self.max_points_per_node or node.depth >= self.max_depth:
            node.point_indices = indices.tolist()
            return
        
        offset = np.array([
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]
        ]) * (node.half_size / 2)
        
        for i in range(8):
            child_center = node.center + offset[i]
            child_half = node.half_size / 2
            child_node = OctreeNode(child_center, child_half, node.depth + 1)
            
            child_min = child_center - child_half
            child_max = child_center + child_half
            
            in_child = np.all((self.points[indices] >= child_min) & (self.points[indices] < child_max), axis=1)
            child_indices = indices[in_child]
            
            if len(child_indices) > 0:
                node.children.append(child_node)
                self._build(child_node, child_indices)
    
    def get_nodes_at_level(self, level: int) -> List[OctreeNode]:
        return [n for n in self.nodes if n.depth == level]
    
    def get_visible_nodes(self, view_proj_matrix: np.ndarray, lod_bias: float = 1.0) -> List[OctreeNode]:
        visible = []
        stack = [self.root]
        
        while stack:
            node = stack.pop()
            
            projected = self._project_bounding_box(node, view_proj_matrix)
            screen_size = self._calculate_screen_size(projected)
            
            threshold = 50.0 * lod_bias / (node.depth + 1)
            
            if screen_size < threshold or node.is_leaf():
                if len(node.point_indices) > 0:
                    visible.append(node)
            else:
                for child in node.children:
                    stack.append(child)
        
        return visible
    
    def _project_bounding_box(self, node: OctreeNode, view_proj: np.ndarray) -> np.ndarray:
        corners = []
        for dx in [-1, 1]:
            for dy in [-1, 1]:
                for dz in [-1, 1]:
                    corner = node.center + np.array([dx, dy, dz]) * node.half_size
                    corner_h = np.append(corner, 1.0)
                    projected = view_proj @ corner_h
                    projected = projected[:3] / projected[3]
                    corners.append(projected[:2])
        return np.array(corners)
    
    def _calculate_screen_size(self, projected: np.ndarray) -> float:
        min_xy = np.min(projected, axis=0)
        max_xy = np.max(projected, axis=0)
        return np.max(max_xy - min_xy)

class PointCloudCompressor:
    @staticmethod
    def compress_binary(points: np.ndarray, colors: np.ndarray = None, 
                        features: np.ndarray = None) -> bytes:
        data = bytearray()
        
        num_points = len(points)
        data.extend(struct.pack('I', num_points))
        
        data.extend(points.astype(np.float32).tobytes())
        
        if colors is not None:
            data.extend(struct.pack('B', 1))
            data.extend(colors.astype(np.float32).tobytes())
        else:
            data.extend(struct.pack('B', 0))
        
        if features is not None:
            data.extend(struct.pack('B', 1))
            data.extend(features.astype(np.float32).tobytes())
        else:
            data.extend(struct.pack('B', 0))
        
        return zlib.compress(bytes(data), level=6)
    
    @staticmethod
    def to_json_serializable(points: np.ndarray, colors: np.ndarray = None,
                              features: np.ndarray = None) -> dict:
        result = {
            'points': points.astype(np.float32).tolist(),
            'count': len(points)
        }
        
        if colors is not None:
            result['colors'] = colors.astype(np.float32).tolist()
        
        if features is not None:
            result['features'] = features.astype(np.float32).tolist()
        
        return result
    
    @staticmethod
    def downsample(points: np.ndarray, colors: np.ndarray = None,
                   features: np.ndarray = None, factor: int = 1) -> Tuple:
        if factor <= 1:
            return points, colors, features
        
        indices = np.arange(0, len(points), factor)
        
        result = (points[indices],)
        
        if colors is not None:
            result += (colors[indices],)
        else:
            result += (None,)
        
        if features is not None:
            result += (features[indices],)
        else:
            result += (None,)
        
        return result

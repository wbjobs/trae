import numpy as np
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass, field
import json


@dataclass
class MeshConfig:
    nx: int = 100
    ny: int = 100
    nz: int = 1
    x_min: float = 0.0
    x_max: float = 1.0
    y_min: float = 0.0
    y_max: float = 1.0
    z_min: float = 0.0
    z_max: float = 1.0
    mesh_type: str = "structured"
    refinement_level: int = 1
    boundary_zones: Dict[str, List[Tuple[int, int]]] = field(default_factory=dict)


@dataclass
class MeshData:
    nodes: np.ndarray
    elements: np.ndarray
    node_count: int
    element_count: int
    dx: float
    dy: float
    dz: float
    boundary_masks: Dict[str, np.ndarray] = field(default_factory=dict)
    quality_metrics: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "node_count": self.node_count,
            "element_count": self.element_count,
            "dx": float(self.dx),
            "dy": float(self.dy),
            "dz": float(self.dz),
            "nodes_shape": list(self.nodes.shape),
            "elements_shape": list(self.elements.shape),
            "quality_metrics": {k: float(v) for k, v in self.quality_metrics.items()}
        }

    def save(self, filepath: str):
        np.savez(
            filepath,
            nodes=self.nodes,
            elements=self.elements,
            boundary_masks=np.array([k for k in self.boundary_masks.keys()]),
            **{f"mask_{k}": v for k, v in self.boundary_masks.items()}
        )
        with open(filepath.replace('.npz', '_info.json'), 'w') as f:
            json.dump(self.to_dict(), f, indent=2)


class MeshGenerator:
    def __init__(self, config: Optional[MeshConfig] = None):
        self.config = config or MeshConfig()
        self.mesh: Optional[MeshData] = None

    def generate_structured_mesh(self) -> MeshData:
        nx, ny, nz = self.config.nx, self.config.ny, self.config.nz
        for _ in range(self.config.refinement_level - 1):
            nx = (nx - 1) * 2 + 1
            ny = (ny - 1) * 2 + 1
            nz = (nz - 1) * 2 + 1 if nz > 1 else 1

        x = np.linspace(self.config.x_min, self.config.x_max, nx)
        y = np.linspace(self.config.y_min, self.config.y_max, ny)
        z = np.linspace(self.config.z_min, self.config.z_max, nz)

        if nz == 1:
            X, Y = np.meshgrid(x, y, indexing='ij')
            nodes = np.stack([X.ravel(), Y.ravel()], axis=1)
        else:
            X, Y, Z = np.meshgrid(x, y, z, indexing='ij')
            nodes = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)

        dx = x[1] - x[0] if nx > 1 else 0.0
        dy = y[1] - y[0] if ny > 1 else 0.0
        dz = z[1] - z[0] if nz > 1 else 0.0

        elements = self._generate_elements(nx, ny, nz)
        boundary_masks = self._generate_boundary_masks(nx, ny, nz)
        quality_metrics = self._compute_mesh_quality(nodes, elements, dx, dy, dz)

        self.mesh = MeshData(
            nodes=nodes,
            elements=elements,
            node_count=nodes.shape[0],
            element_count=elements.shape[0],
            dx=dx,
            dy=dy,
            dz=dz,
            boundary_masks=boundary_masks,
            quality_metrics=quality_metrics
        )
        return self.mesh

    def _generate_elements(self, nx: int, ny: int, nz: int) -> np.ndarray:
        if nz == 1:
            elements = []
            for i in range(nx - 1):
                for j in range(ny - 1):
                    n0 = i * ny + j
                    n1 = (i + 1) * ny + j
                    n2 = (i + 1) * ny + (j + 1)
                    n3 = i * ny + (j + 1)
                    elements.append([n0, n1, n2, n3])
            return np.array(elements, dtype=np.int64)
        else:
            elements = []
            for i in range(nx - 1):
                for j in range(ny - 1):
                    for k in range(nz - 1):
                        n0 = (i * ny + j) * nz + k
                        n1 = ((i + 1) * ny + j) * nz + k
                        n2 = ((i + 1) * ny + (j + 1)) * nz + k
                        n3 = (i * ny + (j + 1)) * nz + k
                        n4 = (i * ny + j) * nz + (k + 1)
                        n5 = ((i + 1) * ny + j) * nz + (k + 1)
                        n6 = ((i + 1) * ny + (j + 1)) * nz + (k + 1)
                        n7 = (i * ny + (j + 1)) * nz + (k + 1)
                        elements.append([n0, n1, n2, n3, n4, n5, n6, n7])
            return np.array(elements, dtype=np.int64)

    def _generate_boundary_masks(self, nx: int, ny: int, nz: int) -> Dict[str, np.ndarray]:
        masks = {}
        total_nodes = nx * ny * nz

        idx = np.arange(total_nodes)
        if nz == 1:
            i = idx // ny
            j = idx % ny
            masks["left"] = (i == 0)
            masks["right"] = (i == nx - 1)
            masks["bottom"] = (j == 0)
            masks["top"] = (j == ny - 1)
            masks["interior"] = ~(masks["left"] | masks["right"] | masks["bottom"] | masks["top"])
        else:
            i = idx // (ny * nz)
            j = (idx % (ny * nz)) // nz
            k = idx % nz
            masks["left"] = (i == 0)
            masks["right"] = (i == nx - 1)
            masks["bottom"] = (j == 0)
            masks["top"] = (j == ny - 1)
            masks["front"] = (k == 0)
            masks["back"] = (k == nz - 1)
            masks["interior"] = ~(masks["left"] | masks["right"] | masks["bottom"] |
                                   masks["top"] | masks["front"] | masks["back"])

        for name, zones in self.config.boundary_zones.items():
            mask = np.zeros(total_nodes, dtype=bool)
            for (start, end) in zones:
                mask[start:end] = True
            masks[name] = mask

        return masks

    def _compute_mesh_quality(self, nodes: np.ndarray, elements: np.ndarray,
                               dx: float, dy: float, dz: float) -> Dict[str, float]:
        if elements.shape[1] == 4:
            areas = []
            for elem in elements:
                p0, p1, p2, p3 = nodes[elem]
                v1 = p1 - p0
                v2 = p3 - p0
                area = np.abs(np.cross(v1, v2))
                areas.append(area)
            areas = np.array(areas)
            expected_area = dx * dy
            return {
                "min_quality": np.min(areas) / expected_area,
                "max_quality": np.max(areas) / expected_area,
                "avg_quality": np.mean(areas) / expected_area,
                "aspect_ratio_max": max(dx, dy) / min(dx, dy) if min(dx, dy) > 0 else 1.0
            }
        elif elements.shape[1] == 8:
            volumes = []
            for elem in elements:
                p = nodes[elem]
                v1 = p[1] - p[0]
                v2 = p[3] - p[0]
                v3 = p[4] - p[0]
                volume = np.abs(np.dot(v1, np.cross(v2, v3)))
                volumes.append(volume)
            volumes = np.array(volumes)
            expected_volume = dx * dy * dz
            return {
                "min_quality": np.min(volumes) / expected_volume,
                "max_quality": np.max(volumes) / expected_volume,
                "avg_quality": np.mean(volumes) / expected_volume
            }
        return {}

    def refine_mesh(self, refinement_zones: Optional[List[Tuple[float, float, float, float]]] = None):
        if self.mesh is None:
            raise ValueError("Mesh must be generated first")

        if refinement_zones is None:
            self.config.refinement_level += 1
            return self.generate_structured_mesh()

        return self.mesh

    def get_mesh_info(self) -> Dict:
        if self.mesh is None:
            return {"status": "not_generated"}
        return self.mesh.to_dict()

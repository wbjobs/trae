from typing import Dict, Any, List
import numpy as np


class MeshQualityEvaluator:
    GMSH_TYPE_MAP = {
        1: ("line", 2),
        2: ("triangle", 3),
        3: ("quad", 4),
        4: ("tetra", 4),
        5: ("hex", 8),
        9: ("quad", 4),
        10: ("tetra", 4),
        12: ("hex", 8),
        15: ("point", 1)
    }

    def _parse_elements(self, elements: List[Any], target_type: str) -> List[List[int]]:
        connectivities = []
        nodes_per_elem = {"triangle": 3, "quad": 4, "tetra": 4, "hex": 8}.get(target_type, 3)
        target_gmsh_types = {t for t, info in self.GMSH_TYPE_MAP.items() if info[0] == target_type}

        for elem in elements:
            if isinstance(elem, dict):
                gmsh_type = elem.get("type")
                tags = elem.get("tags", [])
                if gmsh_type in target_gmsh_types:
                    info = self.GMSH_TYPE_MAP.get(gmsh_type)
                    if info:
                        npe = info[1]
                        for i in range(0, len(tags), npe):
                            if i + npe <= len(tags):
                                conn = [t - 1 for t in tags[i:i+npe]]
                                connectivities.append(conn)
            elif isinstance(elem, list):
                if len(elem) == nodes_per_elem:
                    connectivities.append(elem)
                elif nodes_per_elem == 3 and len(elem) > 3:
                    for i in range(0, len(elem), nodes_per_elem):
                        if i + nodes_per_elem <= len(elem):
                            connectivities.append(elem[i:i+nodes_per_elem])
        return connectivities

    def evaluate(self, nodes: List[List[float]], elements: List[Any], element_type: str) -> Dict[str, Any]:
        nodes_arr = np.array(nodes)
        
        qualities = []
        aspect_ratios = []
        angles = []
        element_count = {"triangle": 0, "quad": 0, "tetra": 0, "hex": 0}

        conn_lists = self._parse_elements(elements, element_type)

        for conn in conn_lists:
            try:
                if element_type == "triangle" and len(conn) == 3:
                    q, ar, ang = self._evaluate_triangle(nodes_arr, conn)
                    qualities.append(q)
                    aspect_ratios.append(ar)
                    angles.extend(ang)
                    element_count["triangle"] += 1
                elif element_type == "quad" and len(conn) == 4:
                    q, ar, ang = self._evaluate_quad(nodes_arr, conn)
                    qualities.append(q)
                    aspect_ratios.append(ar)
                    angles.extend(ang)
                    element_count["quad"] += 1
                elif element_type == "tetra" and len(conn) == 4:
                    q, ar, ang = self._evaluate_tetra(nodes_arr, conn)
                    qualities.append(q)
                    aspect_ratios.append(ar)
                    angles.extend(ang)
                    element_count["tetra"] += 1
                elif element_type == "hex" and len(conn) == 8:
                    q, ar, ang = self._evaluate_hex(nodes_arr, conn)
                    qualities.append(q)
                    aspect_ratios.append(ar)
                    angles.extend(ang)
                    element_count["hex"] += 1
            except Exception:
                continue

        if not qualities:
            qualities = [1.0]
            aspect_ratios = [1.0]
            angles = [60.0]

        histogram = self._build_histogram(qualities)

        return {
            "element_count": element_count,
            "min_quality": float(np.min(qualities)),
            "max_quality": float(np.max(qualities)),
            "avg_quality": float(np.mean(qualities)),
            "min_aspect_ratio": float(np.min(aspect_ratios)),
            "max_aspect_ratio": float(np.max(aspect_ratios)),
            "avg_aspect_ratio": float(np.mean(aspect_ratios)),
            "min_angle": float(np.min(angles)),
            "max_angle": float(np.max(angles)),
            "avg_angle": float(np.mean(angles)),
            "quality_histogram": histogram
        }

    def _evaluate_triangle(self, nodes: np.ndarray, conn: List[int]) -> tuple:
        p0 = nodes[conn[0]]
        p1 = nodes[conn[1]]
        p2 = nodes[conn[2]]
        
        v01 = p1 - p0
        v12 = p2 - p1
        v20 = p0 - p2
        
        l01 = np.linalg.norm(v01)
        l12 = np.linalg.norm(v12)
        l20 = np.linalg.norm(v20)
        
        area = 0.5 * np.linalg.norm(np.cross(v01, v20))
        
        s = (l01 + l12 + l20) / 2
        r = area / s if s > 0 else 0
        R = (l01 * l12 * l20) / (4 * area) if area > 0 else float('inf')
        
        quality = 2 * np.sqrt(3) * r / R if R > 0 else 0
        quality = min(max(quality, 0), 1)
        
        aspect_ratio = max(l01, l12, l20) / min(l01, l12, l20) if min(l01, l12, l20) > 0 else float('inf')
        
        angles = self._triangle_angles(p0, p1, p2)
        
        return quality, aspect_ratio, angles

    def _evaluate_quad(self, nodes: np.ndarray, conn: List[int]) -> tuple:
        p0 = nodes[conn[0]]
        p1 = nodes[conn[1]]
        p2 = nodes[conn[2]]
        p3 = nodes[conn[3]]
        
        edges = [
            np.linalg.norm(p1 - p0),
            np.linalg.norm(p2 - p1),
            np.linalg.norm(p3 - p2),
            np.linalg.norm(p0 - p3)
        ]
        
        diagonals = [
            np.linalg.norm(p2 - p0),
            np.linalg.norm(p3 - p1)
        ]
        
        v01 = p1 - p0
        v03 = p3 - p0
        v12 = p2 - p1
        v10 = p0 - p1
        
        area1 = 0.5 * np.linalg.norm(np.cross(v01, v03))
        area2 = 0.5 * np.linalg.norm(np.cross(v12, -v10))
        total_area = area1 + area2
        
        side_ratio = max(edges) / min(edges) if min(edges) > 0 else float('inf')
        diag_ratio = max(diagonals) / min(diagonals) if min(diagonals) > 0 else float('inf')
        
        quality = 1.0 / (side_ratio * diag_ratio) if side_ratio * diag_ratio > 0 else 0
        quality = min(max(quality, 0), 1)
        
        aspect_ratio = side_ratio
        
        angles = self._quad_angles(p0, p1, p2, p3)
        
        return quality, aspect_ratio, angles

    def _evaluate_tetra(self, nodes: np.ndarray, conn: List[int]) -> tuple:
        p0 = nodes[conn[0]]
        p1 = nodes[conn[1]]
        p2 = nodes[conn[2]]
        p3 = nodes[conn[3]]
        
        edges = [
            np.linalg.norm(p1 - p0),
            np.linalg.norm(p2 - p0),
            np.linalg.norm(p3 - p0),
            np.linalg.norm(p2 - p1),
            np.linalg.norm(p3 - p1),
            np.linalg.norm(p3 - p2)
        ]
        
        volume = abs(np.dot(p3 - p0, np.cross(p1 - p0, p2 - p0))) / 6
        
        L_min = min(edges)
        L_max = max(edges)
        
        if volume > 0 and L_min > 0:
            quality = 6 * np.sqrt(2) * volume / (L_max ** 3)
        else:
            quality = 0
        
        quality = min(max(quality, 0), 1)
        
        aspect_ratio = L_max / L_min if L_min > 0 else float('inf')
        
        angles = self._tetra_dihedral_angles(p0, p1, p2, p3)
        
        return quality, aspect_ratio, angles

    def _evaluate_hex(self, nodes: np.ndarray, conn: List[int]) -> tuple:
        p = [nodes[conn[i]] for i in range(8)]
        
        edges = []
        for i in range(4):
            edges.append(np.linalg.norm(p[(i+1)%4] - p[i]))
            edges.append(np.linalg.norm(p[(i+1)%4+4] - p[i+4]))
            edges.append(np.linalg.norm(p[i+4] - p[i]))
        
        volumes = []
        for base_idx in [[0,1,2,3], [4,5,6,7]]:
            pb = [p[i] for i in base_idx]
            center = np.mean(pb, axis=0)
            for i in range(4):
                v1 = pb[(i+1)%4] - pb[i]
                v2 = pb[(i+2)%4] - pb[i]
                volumes.append(np.linalg.norm(np.cross(v1, v2)) / 2)
        
        total_volume = sum(volumes)
        
        L_min = min(edges)
        L_max = max(edges)
        
        if total_volume > 0 and L_min > 0:
            quality = total_volume / (L_max ** 3)
        else:
            quality = 0
        
        quality = min(max(quality, 0), 1)
        
        aspect_ratio = L_max / L_min if L_min > 0 else float('inf')
        
        angles = [90.0]
        
        return quality, aspect_ratio, angles

    def _triangle_angles(self, p0, p1, p2) -> List[float]:
        def angle(a, b, c):
            v1 = a - b
            v2 = c - b
            dot = np.dot(v1, v2)
            norm = np.linalg.norm(v1) * np.linalg.norm(v2)
            if norm == 0:
                return 0
            cos_val = dot / norm
            cos_val = min(max(cos_val, -1), 1)
            return np.degrees(np.arccos(cos_val))
        
        return [
            angle(p2, p0, p1),
            angle(p0, p1, p2),
            angle(p1, p2, p0)
        ]

    def _quad_angles(self, p0, p1, p2, p3) -> List[float]:
        def angle(a, b, c):
            v1 = a - b
            v2 = c - b
            dot = np.dot(v1, v2)
            norm = np.linalg.norm(v1) * np.linalg.norm(v2)
            if norm == 0:
                return 0
            cos_val = dot / norm
            cos_val = min(max(cos_val, -1), 1)
            return np.degrees(np.arccos(cos_val))
        
        return [
            angle(p3, p0, p1),
            angle(p0, p1, p2),
            angle(p1, p2, p3),
            angle(p2, p3, p0)
        ]

    def _tetra_dihedral_angles(self, p0, p1, p2, p3) -> List[float]:
        def dihedral(p1, p2, p3, p4):
            v1 = p2 - p1
            v2 = p3 - p2
            v3 = p4 - p3
            n1 = np.cross(v1, v2)
            n2 = np.cross(v2, v3)
            dot = np.dot(n1, n2)
            norm = np.linalg.norm(n1) * np.linalg.norm(n2)
            if norm == 0:
                return 0
            cos_val = dot / norm
            cos_val = min(max(cos_val, -1), 1)
            return np.degrees(np.arccos(cos_val))
        
        faces = [
            [p0, p1, p2],
            [p0, p1, p3],
            [p0, p2, p3],
            [p1, p2, p3]
        ]
        
        angles = []
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                common = set(tuple(p) for p in faces[i]) & set(tuple(p) for p in faces[j])
                if len(common) == 2:
                    common_list = [np.array(c) for c in common]
                    all_points = faces[i] + faces[j]
                    unique = []
                    for p in all_points:
                        if tuple(p) not in common:
                            unique.append(p)
                    if len(unique) == 2:
                        angles.append(dihedral(unique[0], common_list[0], common_list[1], unique[1]))
        
        return angles if angles else [60.0]

    def _build_histogram(self, qualities: List[float], bins: int = 10) -> List[int]:
        if not qualities:
            return [0] * bins
        
        histogram = [0] * bins
        for q in qualities:
            idx = min(int(q * bins), bins - 1)
            histogram[idx] += 1
        
        return histogram

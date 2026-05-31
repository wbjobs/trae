import os
import json
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
import numpy as np

from app.config import settings


class GeometryService:
    SUPPORTED_FORMATS = {
        "2d": ["stl", "step", "iges", "igs"],
        "3d": ["stl", "step", "iges", "igs", "brep"]
    }

    def __init__(self):
        self.upload_dir = settings.UPLOAD_DIR

    def validate_format(self, filename: str, dimensions: int = 3) -> tuple[bool, str]:
        ext = Path(filename).suffix.lower().lstrip(".")
        formats = self.SUPPORTED_FORMATS["3d"] if dimensions == 3 else self.SUPPORTED_FORMATS["2d"]
        if ext in formats:
            return True, ext
        return False, f"Unsupported format: {ext}. Supported: {', '.join(formats)}"

    def save_upload(self, file_content: bytes, filename: str, project_id: int) -> str:
        ext = Path(filename).suffix.lower().lstrip(".")
        unique_name = f"{uuid.uuid4()}.{ext}"
        project_dir = self.upload_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        file_path = project_dir / unique_name
        file_path.write_bytes(file_content)
        return str(file_path)

    def create_parametric_geometry(self, geom_type: str, params: Dict[str, Any], project_id: int) -> Dict[str, Any]:
        project_dir = self.upload_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        
        unique_name = f"{uuid.uuid4()}.json"
        file_path = project_dir / unique_name

        geometry_data = {
            "type": geom_type,
            "params": params,
            "vertices": self._generate_vertices(geom_type, params),
            "faces": self._generate_faces(geom_type, params)
        }

        file_path.write_text(json.dumps(geometry_data))

        bbox = self._compute_bounding_box(geometry_data["vertices"])

        return {
            "file_path": str(file_path),
            "bounding_box": bbox,
            "geometry_data": geometry_data
        }

    def _generate_vertices(self, geom_type: str, params: Dict[str, Any]) -> List[List[float]]:
        geom_type = geom_type.lower()
        
        if geom_type == "rectangle":
            width = params.get("width", 1.0)
            height = params.get("height", 1.0)
            center = params.get("center", [0, 0, 0])
            cx, cy, cz = center
            return [
                [cx - width/2, cy - height/2, cz],
                [cx + width/2, cy - height/2, cz],
                [cx + width/2, cy + height/2, cz],
                [cx - width/2, cy + height/2, cz]
            ]
        elif geom_type == "circle":
            radius = params.get("radius", 1.0)
            segments = params.get("segments", 32)
            center = params.get("center", [0, 0, 0])
            cx, cy, cz = center
            vertices = []
            for i in range(segments):
                angle = 2 * np.pi * i / segments
                vertices.append([
                    cx + radius * np.cos(angle),
                    cy + radius * np.sin(angle),
                    cz
                ])
            return vertices
        elif geom_type == "cube":
            size = params.get("size", 1.0)
            center = params.get("center", [0, 0, 0])
            cx, cy, cz = center
            s = size / 2
            return [
                [cx - s, cy - s, cz - s],
                [cx + s, cy - s, cz - s],
                [cx + s, cy + s, cz - s],
                [cx - s, cy + s, cz - s],
                [cx - s, cy - s, cz + s],
                [cx + s, cy - s, cz + s],
                [cx + s, cy + s, cz + s],
                [cx - s, cy + s, cz + s]
            ]
        elif geom_type == "sphere":
            radius = params.get("radius", 1.0)
            phi_segments = params.get("phi_segments", 16)
            theta_segments = params.get("theta_segments", 12)
            center = params.get("center", [0, 0, 0])
            cx, cy, cz = center
            vertices = []
            for i in range(theta_segments + 1):
                theta = np.pi * i / theta_segments
                for j in range(phi_segments + 1):
                    phi = 2 * np.pi * j / phi_segments
                    x = cx + radius * np.sin(theta) * np.cos(phi)
                    y = cy + radius * np.sin(theta) * np.sin(phi)
                    z = cz + radius * np.cos(theta)
                    vertices.append([x, y, z])
            return vertices
        return [[0, 0, 0]]

    def _generate_faces(self, geom_type: str, params: Dict[str, Any]) -> List[List[int]]:
        geom_type = geom_type.lower()
        
        if geom_type == "rectangle":
            return [[0, 1, 2, 3]]
        elif geom_type == "circle":
            segments = params.get("segments", 32)
            faces = []
            for i in range(segments):
                faces.append([i, (i + 1) % segments])
            return faces
        elif geom_type == "cube":
            return [
                [0, 1, 2, 3],
                [4, 7, 6, 5],
                [0, 4, 5, 1],
                [2, 6, 7, 3],
                [1, 5, 6, 2],
                [3, 7, 4, 0]
            ]
        elif geom_type == "sphere":
            phi_segments = params.get("phi_segments", 16)
            theta_segments = params.get("theta_segments", 12)
            faces = []
            for i in range(theta_segments):
                for j in range(phi_segments):
                    idx1 = i * (phi_segments + 1) + j
                    idx2 = idx1 + 1
                    idx3 = (i + 1) * (phi_segments + 1) + j
                    idx4 = idx3 + 1
                    if i == 0:
                        faces.append([idx1, idx2, idx4])
                    elif i == theta_segments - 1:
                        faces.append([idx1, idx4, idx3])
                    else:
                        faces.append([idx1, idx2, idx4, idx3])
            return faces
        return []

    def _compute_bounding_box(self, vertices: List[List[float]]) -> Dict[str, Any]:
        if not vertices:
            return {"min": [0, 0, 0], "max": [1, 1, 1], "center": [0.5, 0.5, 0.5]}
        
        arr = np.array(vertices)
        min_coords = arr.min(axis=0).tolist()
        max_coords = arr.max(axis=0).tolist()
        center = ((arr.max(axis=0) + arr.min(axis=0)) / 2).tolist()
        
        return {
            "min": min_coords,
            "max": max_coords,
            "center": center,
            "size": (arr.max(axis=0) - arr.min(axis=0)).tolist()
        }

    def extract_geometry_preview(self, file_path: str, file_format: str) -> Dict[str, Any]:
        try:
            if file_format == "json":
                with open(file_path, "r") as f:
                    data = json.load(f)
                return {
                    "vertices": data.get("vertices", []),
                    "faces": data.get("faces", []),
                    "edges": []
                }
            elif file_format == "stl":
                return self._parse_stl(file_path)
            else:
                return self._generate_sample_preview(file_format)
        except Exception as e:
            return {"error": str(e), "vertices": [], "faces": [], "edges": []}

    def _parse_stl(self, file_path: str) -> Dict[str, Any]:
        try:
            import trimesh
            mesh = trimesh.load(file_path)

            repair_info = self._repair_mesh(mesh)

            return {
                "vertices": mesh.vertices.tolist(),
                "faces": mesh.faces.tolist(),
                "edges": [],
                "repair_info": repair_info
            }
        except ImportError:
            return self._generate_sample_preview("stl")

    def _repair_mesh(self, mesh) -> Dict[str, Any]:
        info = {
            "original_vertices": len(mesh.vertices),
            "original_faces": len(mesh.faces),
            "is_watertight": getattr(mesh, 'is_watertight', None),
            "has_inverted_normals": False,
            "repairs_performed": []
        }

        try:
            if hasattr(mesh, 'fill_holes'):
                before = len(mesh.faces)
                mesh.fill_holes()
                if len(mesh.faces) != before:
                    info["repairs_performed"].append("fill_holes")

            if hasattr(mesh, 'remove_degenerate_faces'):
                before = len(mesh.faces)
                mesh.remove_degenerate_faces()
                if len(mesh.faces) != before:
                    info["repairs_performed"].append("remove_degenerate_faces")

            if hasattr(mesh, 'remove_duplicate_faces'):
                before = len(mesh.faces)
                mesh.remove_duplicate_faces()
                if len(mesh.faces) != before:
                    info["repairs_performed"].append("remove_duplicate_faces")

            if hasattr(mesh, 'remove_unreferenced_vertices'):
                before = len(mesh.vertices)
                mesh.remove_unreferenced_vertices()
                if len(mesh.vertices) != before:
                    info["repairs_performed"].append("remove_unreferenced_vertices")

            if hasattr(mesh, 'fix_normals'):
                mesh.fix_normals()
                info["repairs_performed"].append("fix_normals")

            info["final_vertices"] = len(mesh.vertices)
            info["final_faces"] = len(mesh.faces)
            info["is_watertight_final"] = getattr(mesh, 'is_watertight', None)

        except Exception as e:
            info["repair_error"] = str(e)

        return info

    def _generate_sample_preview(self, file_format: str) -> Dict[str, Any]:
        return {
            "vertices": [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
            "faces": [[0, 1, 2, 3]],
            "edges": [[0, 1], [1, 2], [2, 3], [3, 0]],
            "note": f"Preview for {file_format} - install python-occ-core/trimesh for full support"
        }

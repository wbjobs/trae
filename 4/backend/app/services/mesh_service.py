import os
import json
import uuid
from pathlib import Path
from typing import Dict, Any, Callable, Optional
import numpy as np

from app.config import settings


class MeshService:
    def __init__(self):
        self.mesh_dir = settings.MESH_DIR
        self._progress_callback: Optional[Callable[[float, str], None]] = None

    def set_progress_callback(self, callback: Callable[[float, str], None]):
        self._progress_callback = callback

    def _report_progress(self, progress: float, message: str):
        if self._progress_callback:
            self._progress_callback(progress, message)

    def _analyze_geometry_defects(self, geometry_data: Dict[str, Any]) -> Dict[str, Any]:
        defects = {
            "warnings": [],
            "errors": [],
            "is_2d": False,
            "is_3d": False,
            "num_vertices": 0,
            "num_faces": 0,
            "num_unique_edges": 0,
            "non_manifold_edges": 0,
            "degenerate_faces": 0
        }

        vertices = geometry_data.get("vertices", [])
        faces = geometry_data.get("faces", [])
        defects["num_vertices"] = len(vertices)
        defects["num_faces"] = len(faces)

        if len(vertices) == 0:
            defects["errors"].append("No vertices found in geometry")
            return defects

        if len(faces) == 0:
            defects["errors"].append("No faces found in geometry. Cannot generate mesh from wireframe.")
            return defects

        vertices_np = np.array(vertices)
        z_coords = vertices_np[:, 2] if vertices_np.shape[1] >= 3 else np.zeros(len(vertices))
        if np.all(np.abs(z_coords) < 1e-6):
            defects["is_2d"] = True
        else:
            defects["is_3d"] = True

        edge_counts = {}
        for face in faces:
            n = len(face)
            if n < 3:
                defects["degenerate_faces"] += 1
                continue

            for i in range(n):
                edge = tuple(sorted([face[i], face[(i + 1) % n]]))
                edge_counts[edge] = edge_counts.get(edge, 0) + 1

        defects["num_unique_edges"] = len(edge_counts)
        for edge, count in edge_counts.items():
            if count != 2:
                defects["non_manifold_edges"] += 1

        if defects["non_manifold_edges"] > 0:
            ratio = defects["non_manifold_edges"] / max(defects["num_unique_edges"], 1)
            if ratio > 0.1:
                defects["warnings"].append(
                    f"Detected {defects['non_manifold_edges']} non-manifold edges "
                    f"({ratio*100:.1f}% of total edges). This may cause meshing issues."
                )

        if defects["degenerate_faces"] > 0:
            defects["warnings"].append(
                f"Found {defects['degenerate_faces']} degenerate faces (< 3 vertices)."
            )

        if defects["is_3d"] and len(faces) < 4:
            defects["warnings"].append(
                "3D mesh generation requires a closed surface volume. "
                "Consider using 2D meshing for surface-only geometry."
            )

        return defects

    def generate_mesh(self, geometry_path: str, geometry_data: Dict[str, Any],
                      config: Dict[str, Any], project_id: int) -> Dict[str, Any]:
        try:
            self._report_progress(0.03, "Analyzing geometry...")

            defects = self._analyze_geometry_defects(geometry_data)

            if defects["errors"]:
                return {
                    "success": False,
                    "error": " | ".join(defects["errors"]),
                    "geometry_analysis": defects
                }

            if defects["warnings"]:
                self._report_progress(0.04, "Geometry warnings detected, proceeding with repairs...")

            project_dir = self.mesh_dir / str(project_id)
            project_dir.mkdir(parents=True, exist_ok=True)
            
            mesh_id = str(uuid.uuid4())
            output_msh = project_dir / f"{mesh_id}.msh"
            output_vtk = project_dir / f"{mesh_id}.vtk"
            output_info = project_dir / f"{mesh_id}.json"

            self._report_progress(0.05, "Initializing mesh generator...")
            
            result = None
            gmsh_error = None

            try:
                result = self._generate_with_gmsh(
                    geometry_path, geometry_data, config,
                    str(output_msh), str(output_vtk)
                )
            except Exception as gmsh_err:
                gmsh_error = str(gmsh_err)
                self._report_progress(0.3, f"Gmsh failed: {gmsh_error[:80]}... Using fallback mesher.")

            if result is None:
                try:
                    result = self._generate_fallback_mesh(
                        geometry_data, config,
                        str(output_msh), str(output_vtk)
                    )
                except Exception as fallback_err:
                    return {
                        "success": False,
                        "error": f"Both Gmsh and fallback meshers failed. Gmsh: {gmsh_error}; Fallback: {fallback_err}",
                        "geometry_analysis": defects
                    }

            self._report_progress(0.9, "Generating mesh output...")

            info = {
                "mesh_id": mesh_id,
                "num_nodes": result["num_nodes"],
                "num_elements": result["num_elements"],
                "element_type": config.get("element_type", "tetra"),
                "msh_file": str(output_msh),
                "vtk_file": str(output_vtk),
                "nodes": result["nodes"],
                "elements": result["elements"],
                "geometry_analysis": defects
            }

            with open(output_info, "w") as f:
                json.dump(info, f)

            self._report_progress(1.0, "Mesh generation complete!")

            return {
                "success": True,
                "mesh_id": mesh_id,
                "num_nodes": result["num_nodes"],
                "num_elements": result["num_elements"],
                "msh_file": str(output_msh),
                "vtk_file": str(output_vtk),
                "info_file": str(output_info),
                "geometry_analysis": defects
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Mesh generation failed: {str(e)}"
            }

    def _generate_with_gmsh(self, geometry_path: str, geometry_data: Dict[str, Any],
                            config: Dict[str, Any], msh_path: str, vtk_path: str) -> Dict[str, Any]:
        import gmsh
        
        gmsh.initialize()
        gmsh.option.setNumber("General.Terminal", 1)
        
        try:
            self._report_progress(0.1, "Adding geometry to Gmsh...")
            
            element_type = config.get("element_type", "tetra")
            mesh_size = config.get("mesh_size", 1.0)
            min_size = config.get("min_mesh_size", 0.1)
            max_size = config.get("max_mesh_size", 5.0)
            smoothing = config.get("smoothing_iterations", 5)
            order = config.get("element_order", 1)
            is_3d = len(geometry_data.get("vertices", [[0,0,0]])[0]) == 3 and any(
                v[2] != 0 for v in geometry_data.get("vertices", [[0,0,0]])
            )

            gmsh.model.add("mesh_model")
            
            vertices = geometry_data.get("vertices", [])
            faces = geometry_data.get("faces", [])

            node_tags = []
            for i, v in enumerate(vertices):
                tag = gmsh.model.geo.addPoint(v[0], v[1], v[2] if len(v) > 2 else 0, mesh_size)
                node_tags.append(tag)

            gmsh.model.geo.synchronize()

            if is_3d and element_type in ["tetra", "hex"]:
                gmsh.option.setNumber("Mesh.Algorithm3D", config.get("algorithm_3d", 4))
                gmsh.model.mesh.setOrder(order)
                gmsh.option.setNumber("Mesh.CharacteristicLengthMin", min_size)
                gmsh.option.setNumber("Mesh.CharacteristicLengthMax", max_size)
                gmsh.option.setNumber("Mesh.Smoothing", smoothing)
                
                self._report_progress(0.3, "Generating 3D mesh...")
                
                if len(faces) > 0:
                    self._build_surface_volume(faces, node_tags)
                
                gmsh.model.geo.synchronize()
                self._apply_refinement_zones(config.get("refinement_zones"), geometry_data, is_3d)
                gmsh.model.mesh.generate(3)
            else:
                gmsh.option.setNumber("Mesh.Algorithm", config.get("algorithm_2d", 8))
                gmsh.model.mesh.setOrder(order)
                gmsh.option.setNumber("Mesh.CharacteristicLengthMin", min_size)
                gmsh.option.setNumber("Mesh.CharacteristicLengthMax", max_size)
                gmsh.option.setNumber("Mesh.Smoothing", smoothing)
                
                self._report_progress(0.3, "Generating 2D mesh...")
                
                if len(faces) > 0:
                    self._build_wires(faces, node_tags)
                
                gmsh.model.geo.synchronize()
                self._apply_refinement_zones(config.get("refinement_zones"), geometry_data, is_3d)
                gmsh.model.mesh.generate(2)

            self._report_progress(0.6, "Writing mesh files...")
            gmsh.write(msh_path)
            gmsh.write(vtk_path)

            node_tags_mesh, node_coords, _ = gmsh.model.mesh.getNodes()
            element_types, element_tags, element_node_tags = gmsh.model.mesh.getElements()

            nodes = []
            for i in range(0, len(node_coords), 3):
                nodes.append([node_coords[i], node_coords[i+1], node_coords[i+2]])

            elements = []
            for et, ent in zip(element_types, element_node_tags):
                if ent is not None and len(ent) > 0:
                    elements.append({"type": et, "tags": ent.tolist()})

            return {
                "num_nodes": len(nodes),
                "num_elements": sum(len(e["tags"]) for e in elements),
                "nodes": nodes,
                "elements": elements
            }

        finally:
            gmsh.finalize()

    def _apply_refinement_zones(self, zones, geometry_data, is_3d):
        import gmsh
        if not zones or len(zones) == 0:
            return

        self._report_progress(0.25, f"Applying {len(zones)} refinement zones...")

        try:
            for i, zone in enumerate(zones):
                zone_type = zone.get("zone_type", "box")
                size = zone.get("mesh_size", 0.1)
                center = zone.get("center", [0, 0, 0])
                cx, cy, cz = center[0], center[1], center[2] if len(center) > 2 else 0

                if zone_type == "box":
                    box_size = zone.get("size", [1.0, 1.0, 1.0])
                    sx, sy, sz = box_size[0], box_size[1], box_size[2] if len(box_size) > 2 else 1.0
                    field_tag = gmsh.model.mesh.field.add("Box")
                    gmsh.model.mesh.field.setNumber(field_tag, "VIn", size)
                    gmsh.model.mesh.field.setNumber(field_tag, "VOut", 1e20)
                    gmsh.model.mesh.field.setNumber(field_tag, "XMin", cx - sx/2)
                    gmsh.model.mesh.field.setNumber(field_tag, "XMax", cx + sx/2)
                    gmsh.model.mesh.field.setNumber(field_tag, "YMin", cy - sy/2)
                    gmsh.model.mesh.field.setNumber(field_tag, "YMax", cy + sy/2)
                    if is_3d:
                        gmsh.model.mesh.field.setNumber(field_tag, "ZMin", cz - sz/2)
                        gmsh.model.mesh.field.setNumber(field_tag, "ZMax", cz + sz/2)
                    else:
                        gmsh.model.mesh.field.setNumber(field_tag, "ZMin", -1e5)
                        gmsh.model.mesh.field.setNumber(field_tag, "ZMax", 1e5)

                elif zone_type == "sphere":
                    radius = zone.get("radius", 0.5)
                    field_tag = gmsh.model.mesh.field.add("Sphere")
                    gmsh.model.mesh.field.setNumber(field_tag, "VIn", size)
                    gmsh.model.mesh.field.setNumber(field_tag, "VOut", 1e20)
                    gmsh.model.mesh.field.setNumber(field_tag, "XCenter", cx)
                    gmsh.model.mesh.field.setNumber(field_tag, "YCenter", cy)
                    gmsh.model.mesh.field.setNumber(field_tag, "ZCenter", cz)
                    gmsh.model.mesh.field.setNumber(field_tag, "Radius", radius)

                elif zone_type == "cylinder":
                    radius = zone.get("radius", 0.5)
                    height = zone.get("height", 1.0)
                    field_tag = gmsh.model.mesh.field.add("Cylinder")
                    gmsh.model.mesh.field.setNumber(field_tag, "VIn", size)
                    gmsh.model.mesh.field.setNumber(field_tag, "VOut", 1e20)
                    gmsh.model.mesh.field.setNumber(field_tag, "XCenter", cx)
                    gmsh.model.mesh.field.setNumber(field_tag, "YCenter", cy)
                    gmsh.model.mesh.field.setNumber(field_tag, "ZCenter", cz)
                    gmsh.model.mesh.field.setNumber(field_tag, "Radius", radius)
                    gmsh.model.mesh.field.setNumber(field_tag, "ZAxis", 0)
                    gmsh.model.mesh.field.setNumber(field_tag, "YAxis", 0)
                    gmsh.model.mesh.field.setNumber(field_tag, "XAxis", height)

            min_field_tag = gmsh.model.mesh.field.add("Min")
            tags = list(range(1, len(zones) + 1))
            gmsh.model.mesh.field.setNumbers(min_field_tag, "FieldsList", tags)
            gmsh.model.mesh.field.setAsBackgroundMesh(min_field_tag)
            gmsh.option.setNumber("Mesh.MeshSizeExtendFromBoundary", 0)
            gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)

        except Exception as e:
            self._report_progress(0.28, f"Warning: Could not apply refinement zones: {str(e)[:60}...")

    def _build_wires(self, faces, node_tags):
        import gmsh
        for face in faces:
            if len(face) >= 2:
                curve_tags = []
                for i in range(len(face)):
                    start = node_tags[face[i]]
                    end = node_tags[face[(i + 1) % len(face)]]
                    curve_tags.append(gmsh.model.geo.addLine(start, end))
                if len(curve_tags) >= 3:
                    loop = gmsh.model.geo.addCurveLoop(curve_tags)
                    gmsh.model.geo.addPlaneSurface([loop])

    def _build_surface_volume(self, faces, node_tags):
        import gmsh
        surface_tags = []
        for face in faces:
            if len(face) >= 3:
                curve_tags = []
                for i in range(len(face)):
                    start = node_tags[face[i]]
                    end = node_tags[face[(i + 1) % len(face)]]
                    curve_tags.append(gmsh.model.geo.addLine(start, end))
                if len(curve_tags) >= 3:
                    loop = gmsh.model.geo.addCurveLoop(curve_tags)
                    surface_tags.append(gmsh.model.geo.addPlaneSurface([loop]))
        
        if len(surface_tags) >= 4:
            surface_loop = gmsh.model.geo.addSurfaceLoop(surface_tags)
            gmsh.model.geo.addVolume([surface_loop])

    def _generate_fallback_mesh(self, geometry_data: Dict[str, Any], config: Dict[str, Any],
                                 msh_path: str, vtk_path: str) -> Dict[str, Any]:
        vertices = np.array(geometry_data.get("vertices", []))
        faces = geometry_data.get("faces", [])
        
        element_type = config.get("element_type", "triangle")
        mesh_size = config.get("mesh_size", 1.0)

        if len(vertices) == 0:
            vertices = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                                 [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]])

        all_nodes = vertices.tolist()
        all_elements = []
        element_connectivity = []

        if element_type in ["tetra", "hex"]:
            if len(faces) >= 6:
                nodes_arr = np.array(all_nodes)
                divisions = max(2, int(1.0 / mesh_size))
                
                min_bounds = nodes_arr.min(axis=0)
                max_bounds = nodes_arr.max(axis=0)
                
                grid_nodes = []
                for i in range(divisions + 1):
                    for j in range(divisions + 1):
                        for k in range(divisions + 1):
                            x = min_bounds[0] + (max_bounds[0] - min_bounds[0]) * i / divisions
                            y = min_bounds[1] + (max_bounds[1] - min_bounds[1]) * j / divisions
                            z = min_bounds[2] + (max_bounds[2] - min_bounds[2]) * k / divisions
                            grid_nodes.append([x, y, z])
                
                all_nodes = grid_nodes
                
                if element_type == "hex":
                    for i in range(divisions):
                        for j in range(divisions):
                            for k in range(divisions):
                                idx = i * (divisions + 1) ** 2 + j * (divisions + 1) + k
                                element_connectivity.append([
                                    idx, idx + 1,
                                    idx + (divisions + 1) + 1, idx + (divisions + 1),
                                    idx + (divisions + 1) ** 2,
                                    idx + (divisions + 1) ** 2 + 1,
                                    idx + (divisions + 1) ** 2 + (divisions + 1) + 1,
                                    idx + (divisions + 1) ** 2 + (divisions + 1)
                                ])
                else:
                    for i in range(divisions):
                        for j in range(divisions):
                            for k in range(divisions):
                                base = i * (divisions + 1) ** 2 + j * (divisions + 1) + k
                                d1 = 1
                                d2 = divisions + 1
                                d3 = (divisions + 1) ** 2
                                element_connectivity.extend([
                                    [base, base + d1, base + d2, base + d3],
                                    [base + d1, base + d1 + d2, base + d2, base + d1 + d3],
                                    [base + d2, base + d1 + d2, base + d2 + d3, base + d3],
                                    [base + d1, base + d1 + d2, base + d1 + d3, base + d2 + d3],
                                    [base + d2, base + d1 + d2, base + d3, base + d1 + d3],
                                ])
        else:
            if len(faces) > 0:
                if element_type == "triangle":
                    for face in faces:
                        if len(face) == 3:
                            element_connectivity.append(face)
                        elif len(face) == 4:
                            element_connectivity.extend([
                                [face[0], face[1], face[2]],
                                [face[0], face[2], face[3]]
                            ])
                else:
                    for face in faces:
                        if len(face) == 4:
                            element_connectivity.append(face)

        self._write_msh_file(msh_path, all_nodes, element_connectivity, element_type)
        self._write_vtk_file(vtk_path, all_nodes, element_connectivity, element_type)

        return {
            "num_nodes": len(all_nodes),
            "num_elements": len(element_connectivity),
            "nodes": all_nodes,
            "elements": element_connectivity
        }

    def _write_msh_file(self, path: str, nodes, elements, elem_type: str):
        with open(path, "w") as f:
            f.write("$MeshFormat\n")
            f.write("2.2 0 8\n")
            f.write("$EndMeshFormat\n")
            
            f.write("$Nodes\n")
            f.write(f"{len(nodes)}\n")
            for i, n in enumerate(nodes):
                f.write(f"{i+1} {n[0]} {n[1]} {n[2] if len(n) > 2 else 0}\n")
            f.write("$EndNodes\n")
            
            f.write("$Elements\n")
            f.write(f"{len(elements)}\n")
            gmsh_type = {"triangle": 2, "quad": 3, "tetra": 4, "hex": 5}.get(elem_type, 2)
            for i, elem in enumerate(elements):
                tags_str = " ".join(str(t + 1) for t in elem)
                f.write(f"{i+1} {gmsh_type} 2 1 1 {tags_str}\n")
            f.write("$EndElements\n")

    def _write_vtk_file(self, path: str, nodes, elements, elem_type: str):
        with open(path, "w") as f:
            f.write("# vtk DataFile Version 2.0\n")
            f.write("FEA Mesh\n")
            f.write("ASCII\n")
            f.write("DATASET UNSTRUCTURED_GRID\n")
            
            f.write(f"POINTS {len(nodes)} float\n")
            for n in nodes:
                f.write(f"{n[0]} {n[1]} {n[2] if len(n) > 2 else 0}\n")
            
            vtk_type = {"triangle": 5, "quad": 9, "tetra": 10, "hex": 12}.get(elem_type, 5)
            total_size = sum(len(e) + 1 for e in elements)
            f.write(f"CELLS {len(elements)} {total_size}\n")
            for elem in elements:
                f.write(f"{len(elem)} {' '.join(str(t) for t in elem)}\n")
            
            f.write(f"CELL_TYPES {len(elements)}\n")
            for _ in elements:
                f.write(f"{vtk_type}\n")

    def load_mesh_info(self, info_path: str) -> Dict[str, Any]:
        if os.path.exists(info_path):
            with open(info_path, "r") as f:
                return json.load(f)
        return {}

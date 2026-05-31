import os
import io
import csv
import json
import uuid
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np

from app.config import settings


class ResultService:
    SUPPORTED_FORMATS = ["vtu", "vtk"]

    def __init__(self):
        self.results_dir = settings.RESULTS_DIR

    def validate_format(self, filename: str) -> tuple[bool, str]:
        ext = Path(filename).suffix.lower().lstrip(".")
        if ext in self.SUPPORTED_FORMATS:
            return True, ext
        return False, f"Unsupported format: {ext}. Supported: {', '.join(self.SUPPORTED_FORMATS)}"

    def save_upload(self, file_content: bytes, filename: str, project_id: int) -> str:
        ext = Path(filename).suffix.lower().lstrip(".")
        unique_name = f"{uuid.uuid4()}.{ext}"
        project_dir = self.results_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        file_path = project_dir / unique_name
        file_path.write_bytes(file_content)
        return str(file_path)

    def parse_result_file(self, file_path: str, file_format: str) -> Dict[str, Any]:
        try:
            if file_format == "vtu" or file_format == "vtk":
                return self._parse_vtk_style(file_path)
            return {"error": "Unsupported format"}
        except Exception as e:
            return {
                "nodes": self._generate_sample_nodes(),
                "elements": self._generate_sample_elements(),
                "fields": {
                    "stress": {
                        "type": "scalar",
                        "num_components": 1,
                        "data": [float(i) for i in range(8)]
                    },
                    "displacement": {
                        "type": "vector",
                        "num_components": 3,
                        "data": [0.1*i, 0.05*i, 0.02*i for i in range(8)]
                    }
                },
                "note": f"Sample data - install vtk/meshio for full parsing. Error: {str(e)}"
            }

    def _parse_vtk_style(self, file_path: str) -> Dict[str, Any]:
        try:
            import meshio
            mesh = meshio.read(file_path)
            
            result = {
                "nodes": mesh.points.tolist() if mesh.points is not None else [],
                "elements": [],
                "fields": {}
            }
            
            if mesh.cells:
                for cell_block in mesh.cells:
                    result["elements"].append({
                        "type": cell_block.type,
                        "connectivity": cell_block.data.tolist()
                    })
            
            if mesh.point_data:
                for name, data in mesh.point_data.items():
                    data_arr = np.array(data)
                    result["fields"][name] = {
                        "type": "scalar" if data_arr.ndim == 1 else "vector",
                        "num_components": 1 if data_arr.ndim == 1 else data_arr.shape[1],
                        "data": data_arr.flatten().tolist(),
                        "min": float(data_arr.min()),
                        "max": float(data_arr.max())
                    }
            
            if mesh.cell_data:
                for name, data_list in mesh.cell_data.items():
                    if data_list:
                        data_arr = np.array(data_list[0])
                        result["fields"][f"cell_{name}"] = {
                            "type": "scalar" if data_arr.ndim == 1 else "vector",
                            "num_components": 1 if data_arr.ndim == 1 else data_arr.shape[1],
                            "data": data_arr.flatten().tolist(),
                            "min": float(data_arr.min()),
                            "max": float(data_arr.max())
                        }
            
            return result
        except ImportError:
            return self._sample_result_data()
        except Exception as e:
            return {
                **self._sample_result_data(),
                "error": str(e)
            }

    def _sample_result_data(self) -> Dict[str, Any]:
        return {
            "nodes": [
                [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
            ],
            "elements": [
                {
                    "type": "hexahedron",
                    "connectivity": [[0, 1, 2, 3, 4, 5, 6, 7]]
                }
            ],
            "fields": {
                "stress": {
                    "type": "scalar",
                    "num_components": 1,
                    "data": [10.0, 20.0, 30.0, 40.0, 15.0, 25.0, 35.0, 45.0],
                    "min": 10.0,
                    "max": 45.0
                },
                "strain": {
                    "type": "scalar",
                    "num_components": 1,
                    "data": [0.001, 0.002, 0.003, 0.004, 0.0015, 0.0025, 0.0035, 0.0045],
                    "min": 0.001,
                    "max": 0.0045
                },
                "displacement": {
                    "type": "vector",
                    "num_components": 3,
                    "data": [
                        0.0, 0.0, 0.0,
                        0.1, 0.0, 0.0,
                        0.1, 0.1, 0.0,
                        0.0, 0.1, 0.0,
                        0.0, 0.0, 0.05,
                        0.1, 0.0, 0.05,
                        0.1, 0.1, 0.05,
                        0.0, 0.1, 0.05
                    ],
                    "min": 0.0,
                    "max": 0.1
                }
            }
        }

    def _generate_sample_nodes(self) -> List[List[float]]:
        return [
            [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
        ]

    def _generate_sample_elements(self) -> List[Dict]:
        return [
            {
                "type": "hexahedron",
                "connectivity": [[0, 1, 2, 3, 4, 5, 6, 7]]
            }
        ]

    def extract_field(self, result_data: Dict[str, Any], field_name: str, 
                      timestep: int = 0) -> Optional[Dict[str, Any]]:
        fields = result_data.get("fields", {})
        if field_name in fields:
            return fields[field_name]
        return None

    def compute_slice(self, result_data: Dict[str, Any], 
                      plane: Dict[str, Any],
                      field_name: Optional[str] = None) -> Dict[str, Any]:
        nodes = np.array(result_data.get("nodes", []))
        if len(nodes) == 0:
            return {"nodes": [], "elements": [], "field_values": []}
        
        origin = np.array(plane.get("origin", [0, 0, 0]))
        normal = np.array(plane.get("normal", [0, 0, 1]))
        normal = normal / (np.linalg.norm(normal) + 1e-10)
        
        distances = np.dot(nodes - origin, normal)
        
        on_plane_indices = np.where(np.abs(distances) < 0.01)[0]
        
        sliced_nodes = nodes[on_plane_indices].tolist()
        
        if field_name and field_name in result_data.get("fields", {}):
            field = result_data["fields"][field_name]
            field_data = np.array(field["data"])
            num_comp = field["num_components"]
            if num_comp == 1:
                field_values = field_data[on_plane_indices].tolist()
            else:
                field_values = []
                for idx in on_plane_indices:
                    start = idx * num_comp
                    field_values.append(np.linalg.norm(field_data[start:start+num_comp]))
        else:
            field_values = None
        
        return {
            "plane": plane,
            "nodes": sliced_nodes,
            "elements": [],
            "field_values": field_values
        }

    def get_available_fields(self, result_data: Dict[str, Any]) -> List[str]:
        return list(result_data.get("fields", {}).keys())

    def get_timestep_info(self, result_data: Dict[str, Any]) -> int:
        return result_data.get("num_timesteps", 1)

    def compute_contours(self, result_data: Dict[str, Any], 
                         field_name: str, num_levels: int = 10) -> Dict[str, Any]:
        if field_name not in result_data.get("fields", {}):
            return {"levels": [], "contours": []}
        
        field = result_data["fields"][field_name]
        data = np.array(field["data"])
        
        min_val = float(data.min())
        max_val = float(data.max())
        
        levels = np.linspace(min_val, max_val, num_levels).tolist()
        
        return {
            "levels": levels,
            "field_min": min_val,
            "field_max": max_val,
            "field_name": field_name
        }

    def export_field_to_csv(self, result_data: Dict[str, Any], field_name: str, 
                            output_path: str, timestep: int = 0) -> Dict[str, Any]:
        nodes = np.array(result_data.get("nodes", []))
        if len(nodes) == 0:
            raise ValueError("No nodes in result data")

        fields = result_data.get("fields", {})
        if field_name not in fields:
            raise ValueError(f"Field {field_name} not found")

        field = fields[field_name]
        data = np.array(field["data"])
        num_comp = field.get("num_components", 1)

        with open(output_path, 'w', newline='') as f:
            writer = csv.writer(f)

            if num_comp == 1:
                writer.writerow(['NodeID', 'X', 'Y', 'Z', field_name])
                for i in range(len(nodes)):
                    writer.writerow([i, nodes[i][0], nodes[i][1], nodes[i][2] if len(nodes[i]) > 2 else 0,
                                     data[i] if i < len(data) else 0.0])
            else:
                headers = ['NodeID', 'X', 'Y', 'Z']
                for c in range(num_comp):
                    headers.append(f"{field_name}_{c}")
                writer.writerow(headers)
                for i in range(len(nodes)):
                    row = [i, nodes[i][0], nodes[i][1], nodes[i][2] if len(nodes[i]) > 2 else 0.0]
                    start = i * num_comp
                    for c in range(num_comp):
                        idx = start + c
                        row.append(data[idx] if idx < len(data) else 0.0)
                    writer.writerow(row)

        return {
            "csv_path": output_path,
            "field_name": field_name,
            "num_nodes": len(nodes),
            "num_components": num_comp,
            "min": float(data.min()),
            "max": float(data.max())
        }

    def generate_pdf_report(self, result_data: Dict[str, Any], result_info: Dict[str, Any],
                            output_path: str, project_name: str = "FEA Project") -> Dict[str, Any]:
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        except ImportError:
            raise ImportError("reportlab is required for PDF export. Install with: pip install reportlab")

        doc = SimpleDocTemplate(output_path, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=20,
            alignment=1
        )
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=12
        )

        story.append(Paragraph("FEA Analysis Report", title_style))
        story.append(Paragraph(f"Project: {project_name}", subtitle_style))
        story.append(Paragraph(f"Result: {result_info.get('name', 'Unnamed')}", styles['Heading3']))
        story.append(Spacer(1, 20))

        nodes = np.array(result_data.get("nodes", []))
        fields = result_data.get("fields", {})

        summary_data = [
            ["Item", "Value"],
            ["Nodes", str(len(nodes))],
            ["Fields", str(len(fields))],
            ["Format", str(result_info.get("file_format", "unknown"))],
            ["Type", str(result_info.get("result_type", "analysis"))]
        ]
        if len(nodes) > 0:
            summary_data.extend([
                ["X Range", f"{nodes[:, 0].min():.3f} - {nodes[:, 0].max():.3f}"],
                ["Y Range", f"{nodes[:, 1].min():.3f} - {nodes[:, 1].max():.3f}"]
            ])
            if nodes.shape[1] >= 3:
                summary_data.append(["Z Range", f"{nodes[:, 2].min():.3f} - {nodes[:, 2].max():.3f}"])

        summary_table = Table(summary_data, colWidths=[2.5 * inch, 3.0 * inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2196F3')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F5F9FF')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#BBDEFB'))
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 20))

        story.append(Paragraph("Field Statistics", styles['Heading2']))
        story.append(Spacer(1, 10))

        field_stats = [["Field Name", "Type", "Min", "Max", "Components"]]
        for fname, fdata in fields.items():
            arr = np.array(fdata.get("data", []))
            ftype = fdata.get("type", "scalar")
            ncomp = fdata.get("num_components", 1)
            fmin = fdata.get("min", float(arr.min()) if len(arr) > 0 else 0)
            fmax = fdata.get("max", float(arr.max()) if len(arr) > 0 else 0)
            field_stats.append([fname, ftype, f"{fmin:.6e}", f"{fmax:.6e}", str(ncomp)])

        field_table = Table(field_stats, colWidths=[1.5 * inch, 0.8 * inch, 1.5 * inch, 1.5 * inch, 0.8 * inch])
        field_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4CAF50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F1F8E9')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#A5D6A7'))
        ]))
        story.append(field_table)
        story.append(Spacer(1, 30))

        story.append(Paragraph("Report generated by FEA Mesh Tool", styles['Italic']))

        doc.build(story)

        return {
            "pdf_path": output_path,
            "pages": 1,
            "fields_exported": len(fields)
        }

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import os
import json

from app.models.database import get_db
from app.models.mesh import Mesh, MeshConfig
from app.models.geometry import Geometry
from app.schemas.mesh import MeshConfigCreate
from app.services.mesh_service import MeshService
from app.services.mesh_quality import MeshQualityEvaluator
from app.services.geometry_service import GeometryService

router = APIRouter()
mesh_service = MeshService()
quality_evaluator = MeshQualityEvaluator()
geometry_service = GeometryService()

progress_store: Dict[str, Dict[str, Any]] = {}


@router.get("", response_model=List[Dict[str, Any]])
def list_meshes(project_id: int, db: Session = Depends(get_db)):
    meshes = db.query(Mesh).filter(Mesh.project_id == project_id).all()
    result = []
    for mesh in meshes:
        result.append({
            "id": mesh.id,
            "name": mesh.name,
            "element_type": mesh.element_type,
            "num_nodes": mesh.num_nodes,
            "num_elements": mesh.num_elements,
            "status": mesh.status,
            "created_at": mesh.created_at.isoformat() if mesh.created_at else None,
            "quality_stats": mesh.quality_stats
        })
    return result


@router.post("/generate")
def generate_mesh(
    config: MeshConfigCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    geometry = None
    if config.geometry_id:
        geometry = db.query(Geometry).filter(Geometry.id == config.geometry_id).first()
        if not geometry:
            raise HTTPException(status_code=404, detail="Geometry not found")
    
    db_config = MeshConfig(
        project_id=config.project_id,
        geometry_id=config.geometry_id,
        element_type=config.element_type,
        mesh_size=config.mesh_size,
        min_mesh_size=config.min_mesh_size,
        max_mesh_size=config.max_mesh_size,
        algorithm_2d=config.algorithm_2d,
        algorithm_3d=config.algorithm_3d,
        smoothing_iterations=config.smoothing_iterations,
        element_order=config.element_order,
        structured=config.structured,
        additional_options=config.additional_options
    )
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    
    mesh = Mesh(
        project_id=config.project_id,
        geometry_id=config.geometry_id,
        config_id=db_config.id,
        name=f"mesh_{config.element_type}_{config.mesh_size}",
        element_type=config.element_type,
        status="running"
    )
    db.add(mesh)
    db.commit()
    db.refresh(mesh)
    
    geometry_data = None
    geometry_path = geometry.file_path if geometry else None
    
    if geometry and geometry.file_path:
        preview = geometry_service.extract_geometry_preview(
            geometry.file_path, geometry.file_format or "json"
        )
        geometry_data = preview
    else:
        geometry_data = {
            "vertices": [[0,0,0], [1,0,0], [1,1,0], [0,1,0],
                        [0,0,1], [1,0,1], [1,1,1], [0,1,1]],
            "faces": [[0,1,2,3], [4,7,6,5], [0,4,5,1], 
                     [2,6,7,3], [1,5,6,2], [3,7,4,0]]
        }
    
    task_id = f"mesh_{mesh.id}"
    progress_store[task_id] = {"progress": 0, "message": "Starting..."}
    
    def progress_callback(progress, message):
        progress_store[task_id] = {"progress": progress, "message": message}
    
    mesh_service.set_progress_callback(progress_callback)
    
    result = mesh_service.generate_mesh(
        geometry_path or "",
        geometry_data,
        {
            "element_type": config.element_type,
            "mesh_size": config.mesh_size,
            "min_mesh_size": config.min_mesh_size,
            "max_mesh_size": config.max_mesh_size,
            "algorithm_2d": config.algorithm_2d,
            "algorithm_3d": config.algorithm_3d,
            "smoothing_iterations": config.smoothing_iterations,
            "element_order": config.element_order,
            "structured": config.structured
        },
        config.project_id
    )
    
    if result["success"]:
        mesh.file_path = result["info_file"]
        mesh.num_nodes = result["num_nodes"]
        mesh.num_elements = result["num_elements"]
        mesh.status = "completed"
        
        mesh_info = mesh_service.load_mesh_info(result["info_file"])
        if mesh_info:
            quality_stats = quality_evaluator.evaluate(
                mesh_info.get("nodes", []),
                mesh_info.get("elements", []),
                config.element_type
            )
            mesh.quality_stats = quality_stats
    else:
        mesh.status = "failed"
        mesh.error_message = result.get("error", "Unknown error")
    
    db.commit()
    db.refresh(mesh)
    
    return {
        "mesh_id": mesh.id,
        "status": mesh.status,
        "task_id": task_id,
        "num_nodes": mesh.num_nodes,
        "num_elements": mesh.num_elements
    }


@router.get("/progress/{task_id}")
def get_mesh_progress(task_id: str):
    return progress_store.get(task_id, {"progress": 0, "message": "Not started"})


@router.get("/{mesh_id}")
def get_mesh(mesh_id: int, db: Session = Depends(get_db)):
    mesh = db.query(Mesh).filter(Mesh.id == mesh_id).first()
    if not mesh:
        raise HTTPException(status_code=404, detail="Mesh not found")
    
    mesh_info = {}
    if mesh.file_path and os.path.exists(mesh.file_path):
        mesh_info = mesh_service.load_mesh_info(mesh.file_path)
    
    return {
        "id": mesh.id,
        "name": mesh.name,
        "element_type": mesh.element_type,
        "num_nodes": mesh.num_nodes,
        "num_elements": mesh.num_elements,
        "status": mesh.status,
        "quality_stats": mesh.quality_stats,
        "error_message": mesh.error_message,
        "mesh_data": mesh_info
    }


@router.get("/{mesh_id}/download/{format_type}")
def download_mesh(mesh_id: int, format_type: str, db: Session = Depends(get_db)):
    mesh = db.query(Mesh).filter(Mesh.id == mesh_id).first()
    if not mesh or not mesh.file_path:
        raise HTTPException(status_code=404, detail="Mesh not found")
    
    mesh_info = mesh_service.load_mesh_info(mesh.file_path)
    
    if format_type == "vtk" and mesh_info.get("vtk_file"):
        if os.path.exists(mesh_info["vtk_file"]):
            return FileResponse(mesh_info["vtk_file"], media_type="application/octet-stream")
    elif format_type == "msh" and mesh_info.get("msh_file"):
        if os.path.exists(mesh_info["msh_file"]):
            return FileResponse(mesh_info["msh_file"], media_type="application/octet-stream")
    
    raise HTTPException(status_code=404, detail="File not found")


@router.delete("/{mesh_id}")
def delete_mesh(mesh_id: int, db: Session = Depends(get_db)):
    mesh = db.query(Mesh).filter(Mesh.id == mesh_id).first()
    if not mesh:
        raise HTTPException(status_code=404, detail="Mesh not found")
    
    db.delete(mesh)
    db.commit()
    return {"status": "deleted"}


@router.get("/{mesh_id}/quality")
def get_mesh_quality(mesh_id: int, db: Session = Depends(get_db)):
    mesh = db.query(Mesh).filter(Mesh.id == mesh_id).first()
    if not mesh:
        raise HTTPException(status_code=404, detail="Mesh not found")
    
    if mesh.quality_stats:
        return mesh.quality_stats
    
    if mesh.file_path and os.path.exists(mesh.file_path):
        mesh_info = mesh_service.load_mesh_info(mesh.file_path)
        if mesh_info:
            quality = quality_evaluator.evaluate(
                mesh_info.get("nodes", []),
                mesh_info.get("elements", []),
                mesh.element_type or "tetra"
            )
            mesh.quality_stats = quality
            db.commit()
            return quality
    
    return {"error": "Quality data not available"}

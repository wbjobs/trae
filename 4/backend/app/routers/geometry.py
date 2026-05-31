from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app.models.database import get_db
from app.models.geometry import Geometry
from app.schemas.geometry import GeometryCreate, GeometryResponse
from app.services.geometry_service import GeometryService

router = APIRouter()
geometry_service = GeometryService()


@router.get("", response_model=List[GeometryResponse])
def list_geometries(project_id: int, db: Session = Depends(get_db)):
    return db.query(Geometry).filter(Geometry.project_id == project_id).all()


@router.post("/upload", response_model=GeometryResponse)
async def upload_geometry(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    name: str = Form(...),
    dimensions: int = Form(3),
    db: Session = Depends(get_db)
):
    valid, info = geometry_service.validate_format(file.filename or "", dimensions)
    if not valid:
        raise HTTPException(status_code=400, detail=info)
    
    file_format = info
    content = await file.read()
    file_path = geometry_service.save_upload(content, file.filename or "", project_id)
    
    preview = geometry_service.extract_geometry_preview(file_path, file_format)
    bbox = None
    if "vertices" in preview and preview["vertices"]:
        bbox = geometry_service._compute_bounding_box(preview["vertices"])
    
    geometry = Geometry(
        project_id=project_id,
        name=name,
        file_path=file_path,
        file_format=file_format,
        geometry_type="uploaded",
        dimensions=dimensions,
        bounding_box=bbox
    )
    
    db.add(geometry)
    db.commit()
    db.refresh(geometry)
    return geometry


@router.post("/parametric", response_model=GeometryResponse)
def create_parametric_geometry(
    geom_data: GeometryCreate,
    db: Session = Depends(get_db)
):
    params = geom_data.parameters or {}
    
    result = geometry_service.create_parametric_geometry(
        geom_data.geometry_type, params, geom_data.project_id
    )
    
    geometry = Geometry(
        project_id=geom_data.project_id,
        name=geom_data.name,
        file_path=result["file_path"],
        file_format="json",
        geometry_type=geom_data.geometry_type,
        dimensions=geom_data.dimensions,
        parameters=params,
        bounding_box=result["bounding_box"]
    )
    
    db.add(geometry)
    db.commit()
    db.refresh(geometry)
    return geometry


@router.get("/{geometry_id}", response_model=GeometryResponse)
def get_geometry(geometry_id: int, db: Session = Depends(get_db)):
    geometry = db.query(Geometry).filter(Geometry.id == geometry_id).first()
    if not geometry:
        raise HTTPException(status_code=404, detail="Geometry not found")
    return geometry


@router.get("/{geometry_id}/preview")
def get_geometry_preview(geometry_id: int, db: Session = Depends(get_db)):
    geometry = db.query(Geometry).filter(Geometry.id == geometry_id).first()
    if not geometry:
        raise HTTPException(status_code=404, detail="Geometry not found")
    
    if not geometry.file_path:
        return {"vertices": [], "faces": [], "edges": []}
    
    return geometry_service.extract_geometry_preview(
        geometry.file_path, geometry.file_format or "json"
    )


@router.delete("/{geometry_id}")
def delete_geometry(geometry_id: int, db: Session = Depends(get_db)):
    geometry = db.query(Geometry).filter(Geometry.id == geometry_id).first()
    if not geometry:
        raise HTTPException(status_code=404, detail="Geometry not found")
    
    db.delete(geometry)
    db.commit()
    return {"status": "deleted"}


@router.get("/types/available")
def get_available_parametric_types():
    return {
        "2d": [
            {"type": "rectangle", "params": ["width", "height", "center"]},
            {"type": "circle", "params": ["radius", "segments", "center"]}
        ],
        "3d": [
            {"type": "cube", "params": ["size", "center"]},
            {"type": "sphere", "params": ["radius", "phi_segments", "theta_segments", "center"]}
        ]
    }

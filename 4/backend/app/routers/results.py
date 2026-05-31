from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import os
import json

from app.models.database import get_db
from app.models.result import Result
from app.schemas.result import ResultCreate
from app.services.result_service import ResultService

router = APIRouter()
result_service = ResultService()


@router.get("", response_model=List[Dict[str, Any]])
def list_results(project_id: int, db: Session = Depends(get_db)):
    results = db.query(Result).filter(Result.project_id == project_id).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "result_type": r.result_type,
            "file_format": r.file_format,
            "fields": r.fields,
            "num_timesteps": r.num_timesteps,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in results
    ]


@router.post("/upload")
async def upload_result(
    project_id: int = Form(...),
    name: str = Form(...),
    result_type: str = Form("analysis"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    valid, info = result_service.validate_format(file.filename or "")
    if not valid:
        raise HTTPException(status_code=400, detail=info)
    
    file_format = info
    content = await file.read()
    file_path = result_service.save_upload(content, file.filename or "", project_id)
    
    parsed = result_service.parse_result_file(file_path, file_format)
    
    fields = result_service.get_available_fields(parsed)
    num_timesteps = result_service.get_timestep_info(parsed)
    
    result = Result(
        project_id=project_id,
        name=name,
        result_type=result_type,
        file_path=file_path,
        file_format=file_format,
        fields=fields,
        num_timesteps=num_timesteps,
        metadata={"field_info": {k: {"type": v.get("type"), "min": v.get("min"), "max": v.get("max")} 
                                 for k, v in parsed.get("fields", {}).items()}}
    )
    
    db.add(result)
    db.commit()
    db.refresh(result)
    
    return {
        "id": result.id,
        "name": result.name,
        "fields": fields,
        "num_timesteps": num_timesteps,
        "field_info": result.metadata.get("field_info", {}) if result.metadata else {}
    }


@router.post("/create")
def create_result(
    result_data: ResultCreate,
    db: Session = Depends(get_db)
):
    result = Result(
        project_id=result_data.project_id,
        name=result_data.name,
        result_type=result_data.result_type,
        mesh_id=result_data.mesh_id
    )
    
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.get("/{result_id}")
def get_result(result_id: int, db: Session = Depends(get_db)):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    
    return {
        "id": result.id,
        "name": result.name,
        "result_type": result.result_type,
        "file_format": result.file_format,
        "fields": result.fields,
        "num_timesteps": result.num_timesteps,
        "metadata": result.metadata,
        "created_at": result.created_at
    }


@router.get("/{result_id}/data")
def get_result_data(result_id: int, db: Session = Depends(get_db)):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path:
        raise HTTPException(status_code=404, detail="Result data not found")
    
    parsed = result_service.parse_result_file(result.file_path, result.file_format or "vtk")
    
    return {
        "nodes": parsed.get("nodes", []),
        "elements": parsed.get("elements", []),
        "fields": parsed.get("fields", {})
    }


@router.get("/{result_id}/field/{field_name}")
def get_field_data(
    result_id: int,
    field_name: str,
    timestep: int = 0,
    db: Session = Depends(get_db)
):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path:
        raise HTTPException(status_code=404, detail="Result not found")
    
    parsed = result_service.parse_result_file(result.file_path, result.file_format or "vtk")
    field_data = result_service.extract_field(parsed, field_name, timestep)
    
    if not field_data:
        raise HTTPException(status_code=404, detail=f"Field {field_name} not found")
    
    return {
        "name": field_name,
        "type": field_data.get("type", "scalar"),
        "num_components": field_data.get("num_components", 1),
        "min": field_data.get("min", 0),
        "max": field_data.get("max", 1),
        "data": field_data.get("data", [])
    }


@router.post("/{result_id}/slice")
def get_slice_data(
    result_id: int,
    plane: Dict[str, Any],
    field_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path:
        raise HTTPException(status_code=404, detail="Result not found")
    
    parsed = result_service.parse_result_file(result.file_path, result.file_format or "vtk")
    
    return result_service.compute_slice(parsed, plane, field_name)


@router.get("/{result_id}/contours/{field_name}")
def get_contours(
    result_id: int,
    field_name: str,
    num_levels: int = 10,
    db: Session = Depends(get_db)
):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path:
        raise HTTPException(status_code=404, detail="Result not found")
    
    parsed = result_service.parse_result_file(result.file_path, result.file_format or "vtk")
    
    return result_service.compute_contours(parsed, field_name, num_levels)


@router.get("/{result_id}/download")
def download_result(result_id: int, db: Session = Depends(get_db)):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path or not os.path.exists(result.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(result.file_path, media_type="application/octet-stream")


@router.delete("/{result_id}")
def delete_result(result_id: int, db: Session = Depends(get_db)):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    
    db.delete(result)
    db.commit()
    return {"status": "deleted"}


@router.get("/{result_id}/animation")
def get_animation_info(result_id: int, db: Session = Depends(get_db)):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    
    return {
        "num_timesteps": result.num_timesteps,
        "fields": result.fields,
        "has_animation": result.num_timesteps > 1
    }


@router.get("/{result_id}/timestep/{timestep}")
def get_timestep_data(
    result_id: int,
    timestep: int,
    db: Session = Depends(get_db)
):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path:
        raise HTTPException(status_code=404, detail="Result not found")
    
    if timestep < 0 or timestep >= result.num_timesteps:
        raise HTTPException(status_code=400, detail=f"Invalid timestep: {timestep}")
    
    parsed = result_service.parse_result_file(result.file_path, result.file_format or "vtk")
    
    return {
        "timestep": timestep,
        "nodes": parsed.get("nodes", []),
        "elements": parsed.get("elements", []),
        "fields": parsed.get("fields", {})
    }


@router.get("/{result_id}/export/csv")
def export_to_csv(
    result_id: int,
    field_name: str = "",
    timestep: int = 0,
    db: Session = Depends(get_db)
):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path:
        raise HTTPException(status_code=404, detail="Result not found")

    parsed = result_service.parse_result_file(result.file_path, result.file_format or "vtk")
    fields = result_service.get_available_fields(parsed)

    if not field_name:
        field_name = fields[0] if fields else ""
    if field_name not in fields:
        raise HTTPException(status_code=404, detail=f"Field {field_name} not found")

    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        csv_path = f.name

    try:
        info = result_service.export_field_to_csv(parsed, field_name, csv_path, timestep)
        return FileResponse(
            csv_path,
            media_type='text/csv',
            filename=f"{result.name}_{field_name}.csv"
        )
    except Exception as e:
        if os.path.exists(csv_path):
            os.remove(csv_path)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{result_id}/export/pdf")
def export_to_pdf(
    result_id: int,
    db: Session = Depends(get_db)
):
    result = db.query(Result).filter(Result.id == result_id).first()
    if not result or not result.file_path:
        raise HTTPException(status_code=404, detail="Result not found")

    parsed = result_service.parse_result_file(result.file_path, result.file_format or "vtk")

    import tempfile
    with tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False) as f:
        pdf_path = f.name

    try:
        info = result_service.generate_pdf_report(
            parsed,
            {
                "name": result.name,
                "file_format": result.file_format,
                "result_type": result.result_type
            },
            pdf_path,
            f"Project {result.project_id}"
        )
        return FileResponse(
            pdf_path,
            media_type='application/pdf',
            filename=f"{result.name}_report.pdf"
        )
    except Exception as e:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        raise HTTPException(status_code=500, detail=str(e))

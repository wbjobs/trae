from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from datetime import datetime

from database import get_db
from schemas import DataSourceCreate, DataSourceUpdate, DataSourceResponse, DataQueryParams
from services.datasource_service import DataSourceService
from services.data_query_service import DataQueryService

router = APIRouter(prefix="/api/datasources", tags=["datasources"])

@router.post("/", response_model=DataSourceResponse)
async def create_datasource(
    datasource: DataSourceCreate,
    db: AsyncSession = Depends(get_db)
):
    service = DataSourceService(db)
    return await service.create(datasource)

@router.get("/", response_model=List[DataSourceResponse])
async def get_datasources(db: AsyncSession = Depends(get_db)):
    service = DataSourceService(db)
    return await service.get_all()

@router.get("/{id}", response_model=DataSourceResponse)
async def get_datasource(id: int, db: AsyncSession = Depends(get_db)):
    service = DataSourceService(db)
    datasource = await service.get_by_id(id)
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return datasource

@router.put("/{id}", response_model=DataSourceResponse)
async def update_datasource(
    id: int,
    datasource: DataSourceUpdate,
    db: AsyncSession = Depends(get_db)
):
    service = DataSourceService(db)
    updated = await service.update(id, datasource)
    if not updated:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return updated

@router.delete("/{id}")
async def delete_datasource(id: int, db: AsyncSession = Depends(get_db)):
    service = DataSourceService(db)
    success = await service.delete(id)
    if not success:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return {"success": True}

@router.post("/{id}/test")
async def test_datasource(id: int, db: AsyncSession = Depends(get_db)):
    service = DataSourceService(db)
    datasource = await service.get_by_id(id)
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return await service.test_connection(datasource)

@router.post("/{id}/upload")
async def upload_csv(
    id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    service = DataSourceService(db)
    try:
        result = await service.upload_csv(id, file)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{id}/query")
async def query_timeseries(
    id: int,
    params: DataQueryParams,
    db: AsyncSession = Depends(get_db)
):
    datasource_service = DataSourceService(db)
    datasource = await datasource_service.get_by_id(id)
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    query_service = DataQueryService()
    data = await query_service.query_timeseries(
        datasource,
        params.start_time,
        params.end_time,
        params.aggregation,
        params.interval
    )
    
    return {
        "datasource": datasource.name,
        "data": data,
        "count": len(data)
    }

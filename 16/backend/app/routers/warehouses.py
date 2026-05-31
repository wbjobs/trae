from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Warehouse
from app.schemas import WarehouseResponse

router = APIRouter(prefix="/api/warehouses", tags=["warehouses"])


@router.get("", response_model=List[WarehouseResponse])
def get_all_warehouses(db: Session = Depends(get_db)):
    warehouses = db.query(Warehouse).all()
    return warehouses


@router.get("/{warehouse_id}", response_model=WarehouseResponse)
def get_warehouse(warehouse_id: int, db: Session = Depends(get_db)):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return warehouse


@router.get("/region/{region}", response_model=List[WarehouseResponse])
def get_warehouses_by_region(region: str, db: Session = Depends(get_db)):
    warehouses = db.query(Warehouse).filter(Warehouse.region.ilike(f"%{region}%")).all()
    return warehouses

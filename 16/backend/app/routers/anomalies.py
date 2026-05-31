from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from app.database import get_db
from app.models import OrderAnomaly, Order, Warehouse
from app.schemas import (
    AnomalyResponse,
    SpatioTemporalFlow,
    ParallelCoordData,
    TopKSubgraphResponse,
    LassoSelectionRequest,
    DetectionResult,
)
from app.anomaly_service import anomaly_service

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


@router.get("", response_model=List[AnomalyResponse])
def get_anomalies(
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    min_score: float = Query(0.0, ge=0.0),
    level: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(OrderAnomaly).filter(
        OrderAnomaly.anomaly_score >= min_score
    )
    
    if level:
        query = query.filter(OrderAnomaly.anomaly_level == level)
    
    anomalies = query.order_by(
        OrderAnomaly.anomaly_score.desc()
    ).offset(offset).limit(limit).all()
    
    return anomalies


@router.get("/count")
def get_anomaly_count(
    min_score: float = Query(0.0, ge=0.0),
    db: Session = Depends(get_db),
):
    count = db.query(OrderAnomaly).filter(
        OrderAnomaly.anomaly_score >= min_score
    ).count()
    
    levels_count = db.query(
        OrderAnomaly.anomaly_level,
        OrderAnomaly.id
    ).filter(
        OrderAnomaly.anomaly_score >= min_score
    ).group_by(OrderAnomaly.anomaly_level).all()
    
    level_dist = {level: cnt for level, cnt in levels_count}
    
    return {
        "total": count,
        "by_level": level_dist,
    }


@router.get("/spatio-temporal-flows")
def get_spatio_temporal_flows(
    min_score: float = Query(0.5, ge=0.0),
    limit: int = Query(5000, ge=1, le=10000),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    flows = anomaly_service.get_spatio_temporal_flows(
        db=db,
        start_date=start_date,
        end_date=end_date,
        min_anomaly_score=min_score,
        limit=limit,
    )
    
    return {"flows": flows, "total": len(flows)}


@router.get("/parallel-coords")
def get_parallel_coords_data(
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    data = anomaly_service.get_parallel_coords_data(
        db=db,
        limit=limit,
    )
    
    return {
        "data": data,
        "count": len(data),
    }


@router.post("/parallel-coords/by-bbox")
def get_parallel_coords_by_bbox(
    request: LassoSelectionRequest,
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    bbox = {
        "min_lat": request.min_lat,
        "max_lat": request.max_lat,
        "min_lng": request.min_lng,
        "max_lng": request.max_lng,
    }
    
    data = anomaly_service.get_parallel_coords_data(
        db=db,
        bbox=bbox,
        limit=limit,
    )
    
    return {
        "data": data,
        "count": len(data),
        "bbox": bbox,
    }


@router.get("/top-k-subgraphs")
def get_top_k_subgraphs(
    k: int = Query(5, ge=1, le=20),
    days: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
):
    warehouses = db.query(Warehouse).all()
    warehouse_coords = {w.id: (w.latitude, w.longitude) for w in warehouses}
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    orders_query = db.query(
        Order.id,
        Order.origin_warehouse_id,
        Order.destination_warehouse_id,
        Order.weight,
    ).filter(
        Order.scheduled_pickup_time >= start_date,
        Order.scheduled_pickup_time <= end_date,
    ).limit(50000).all()
    
    orders_data = [
        {
            "id": o.id,
            "origin_warehouse_id": o.origin_warehouse_id,
            "destination_warehouse_id": o.destination_warehouse_id,
            "weight": o.weight,
        }
        for o in orders_query
    ]
    
    anomalies = db.query(
        OrderAnomaly.order_id,
        OrderAnomaly.anomaly_score,
    ).filter(
        OrderAnomaly.detected_at >= start_date,
    ).all()
    
    anomaly_scores = {a.order_id: a.anomaly_score for a in anomalies}
    
    from app.algorithms import TopKSubgraphMiner
    miner = TopKSubgraphMiner(k=k)
    
    subgraphs = miner.mine_top_k(
        warehouse_coords=warehouse_coords,
        orders=orders_data,
        anomaly_scores=anomaly_scores,
        k=k,
    )
    
    wh_name_map = {w.id: w.name for w in warehouses}
    
    result = []
    for i, sg in enumerate(subgraphs):
        node_details = [
            {
                "id": nid,
                "name": wh_name_map.get(nid, f"Warehouse {nid}"),
                "coords": warehouse_coords.get(nid, (0, 0)),
            }
            for nid in sg["nodes"]
        ]
        
        result.append({
            "rank": i + 1,
            "nodes": node_details,
            "edges": sg["edges"],
            "anomaly_score": sg["anomaly_score"],
            "size": sg["size"],
            "density": sg["density"],
            "dominant_anomaly": sg["dominant_anomaly"],
            "distribution": sg["distribution"],
        })
    
    return {
        "subgraphs": result,
        "total_analyzed": len(orders_data),
    }


@router.post("/detect", response_model=DetectionResult)
def run_full_detection(
    days: int = Body(90, embed=True),
    k: int = Body(5, embed=True),
    db: Session = Depends(get_db),
):
    result = anomaly_service.run_full_detection(
        db=db,
        days=days,
        k=k,
    )
    
    return result


@router.post("/detect/volume")
def detect_volume_anomalies(
    days: int = Body(90, embed=True),
    z_threshold: float = Body(2.5, embed=True),
    db: Session = Depends(get_db),
):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    result = anomaly_service.detect_volume_anomalies(
        db=db,
        start_date=start_date,
        end_date=end_date,
        z_threshold=z_threshold,
    )
    
    return result


@router.post("/detect/duration")
def detect_duration_anomalies(
    days: int = Body(90, embed=True),
    min_variation: float = Body(0.3, embed=True),
    db: Session = Depends(get_db),
):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    result = anomaly_service.detect_duration_anomalies(
        db=db,
        start_date=start_date,
        end_date=end_date,
        min_duration_variation=min_variation,
    )
    
    return result

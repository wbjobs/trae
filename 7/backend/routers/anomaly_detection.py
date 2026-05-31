from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import io
import json

from database import get_db
from schemas import (
    AnomalyDetectionRuleCreate,
    AnomalyDetectionRuleUpdate,
    AnomalyDetectionRuleResponse,
    AnomalyRecordResponse,
    AnomalyRecordUpdate
)
from services.anomaly_detection_service import AnomalyDetectionService
from services.alert_service import AlertService

router = APIRouter(prefix="/api/anomaly-detection", tags=["anomaly-detection"])

@router.post("/rules", response_model=AnomalyDetectionRuleResponse)
async def create_rule(
    rule: AnomalyDetectionRuleCreate,
    db: AsyncSession = Depends(get_db)
):
    service = AnomalyDetectionService(db)
    return await service.create_rule(rule)

@router.get("/rules", response_model=List[AnomalyDetectionRuleResponse])
async def get_rules(db: AsyncSession = Depends(get_db)):
    service = AnomalyDetectionService(db)
    return await service.get_all_rules()

@router.get("/rules/{id}", response_model=AnomalyDetectionRuleResponse)
async def get_rule(id: int, db: AsyncSession = Depends(get_db)):
    service = AnomalyDetectionService(db)
    rule = await service.get_rule_by_id(id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule

@router.put("/rules/{id}", response_model=AnomalyDetectionRuleResponse)
async def update_rule(
    id: int,
    rule: AnomalyDetectionRuleUpdate,
    db: AsyncSession = Depends(get_db)
):
    service = AnomalyDetectionService(db)
    updated = await service.update_rule(id, rule)
    if not updated:
        raise HTTPException(status_code=404, detail="Rule not found")
    return updated

@router.delete("/rules/{id}")
async def delete_rule(id: int, db: AsyncSession = Depends(get_db)):
    service = AnomalyDetectionService(db)
    success = await service.delete_rule(id)
    if not success:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True}

@router.post("/rules/{id}/detect")
async def detect_anomalies(
    id: int,
    db: AsyncSession = Depends(get_db)
):
    service = AnomalyDetectionService(db)
    alert_service = AlertService(db)
    
    rule = await service.get_rule_by_id(id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=24)
    
    anomalies = await service.detect_anomalies(rule, rule.datasource, start_time, end_time)
    
    if anomalies:
        records = await service.save_anomaly_records(rule, anomalies)
        
        alert_result = await alert_service.process_anomaly_alerts(records, rule.id)
        
        return {
            "success": True,
            "anomalies_detected": len(anomalies),
            "records_saved": len(records),
            "alerts": alert_result,
            "anomalies": anomalies
        }
    
    return {
        "success": True,
        "anomalies_detected": 0,
        "message": "No anomalies detected"
    }

@router.get("/records", response_model=List[AnomalyRecordResponse])
async def get_anomaly_records(limit: int = 100, db: AsyncSession = Depends(get_db)):
    service = AnomalyDetectionService(db)
    return await service.get_anomaly_records(limit)

@router.get("/records/{id}", response_model=AnomalyRecordResponse)
async def get_anomaly_record(id: int, db: AsyncSession = Depends(get_db)):
    service = AnomalyDetectionService(db)
    record = await service.get_anomaly_record_by_id(id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record

@router.put("/records/{id}", response_model=AnomalyRecordResponse)
async def update_anomaly_record(
    id: int,
    update: AnomalyRecordUpdate,
    db: AsyncSession = Depends(get_db)
):
    service = AnomalyDetectionService(db)
    updated = await service.update_anomaly_record(id, update)
    if not updated:
        raise HTTPException(status_code=404, detail="Record not found")
    return updated

@router.post("/rules/export")
async def export_rules(
    rule_ids: Optional[List[int]] = None,
    db: AsyncSession = Depends(get_db)
):
    service = AnomalyDetectionService(db)
    rules = await service.export_rules(rule_ids)
    
    json_data = json.dumps({
        "version": "1.0",
        "exported_at": datetime.utcnow().isoformat(),
        "rules": rules
    }, indent=2, ensure_ascii=False)
    
    return StreamingResponse(
        io.BytesIO(json_data.encode('utf-8')),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="anomaly_rules_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.json"'
        }
    )

@router.post("/rules/import")
async def import_rules(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON files are supported")
    
    try:
        content = await file.read()
        data = json.loads(content.decode('utf-8'))
        
        rules_data = data.get("rules", [])
        if not rules_data:
            raise HTTPException(status_code=400, detail="No rules found in the file")
        
        datasource_name_map = {}
        for rule in rules_data:
            ds_name = rule.get("datasource_name")
            if ds_name:
                datasource_name_map[ds_name] = None
        
        from services.datasource_service import DataSourceService
        ds_service = DataSourceService(db)
        all_datasources = await ds_service.get_all()
        
        datasource_id_map = {}
        for ds in all_datasources:
            datasource_id_map[ds.name] = ds.id
        
        service = AnomalyDetectionService(db)
        result = await service.import_rules(rules_data, datasource_id_map)
        
        return result
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/records/{record_id}/analyze-root-cause")
async def analyze_root_cause(
    record_id: int,
    db: AsyncSession = Depends(get_db)
):
    try:
        service = AnomalyDetectionService(db)
        result = await service.analyze_root_cause(record_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

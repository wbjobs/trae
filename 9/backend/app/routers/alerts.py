from fastapi import APIRouter, HTTPException
from app.schemas import AlertRule
from app.services.alert_service import alert_service

router = APIRouter()

@router.post("/alert-rules")
async def add_alert_rule(rule: AlertRule):
    result = await alert_service.add_alert_rule(rule)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/alerts")
async def get_alerts(device_id: str = None, status: str = None, limit: int = 100):
    return await alert_service.get_alerts(device_id, status, limit)

@router.get("/alerts/active")
async def get_active_alerts(device_id: str = None):
    return await alert_service.get_active_alerts(device_id)

@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, acknowledged_by: str = "operator"):
    success = await alert_service.acknowledge_alert(alert_id, acknowledged_by)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert acknowledged"}

@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, resolved_by: str = "operator"):
    success = await alert_service.resolve_alert(alert_id, resolved_by)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert resolved"}

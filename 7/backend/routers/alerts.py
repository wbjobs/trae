from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from database import get_db
from schemas import AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse, AlertHistoryResponse
from services.alert_service import AlertService

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

@router.post("/rules", response_model=AlertRuleResponse)
async def create_alert_rule(
    rule: AlertRuleCreate,
    db: AsyncSession = Depends(get_db)
):
    service = AlertService(db)
    return await service.create_alert_rule(rule)

@router.get("/rules", response_model=List[AlertRuleResponse])
async def get_alert_rules(db: AsyncSession = Depends(get_db)):
    service = AlertService(db)
    return await service.get_all_alert_rules()

@router.get("/rules/{id}", response_model=AlertRuleResponse)
async def get_alert_rule(id: int, db: AsyncSession = Depends(get_db)):
    service = AlertService(db)
    rule = await service.get_alert_rule_by_id(id)
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return rule

@router.put("/rules/{id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    id: int,
    rule: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db)
):
    service = AlertService(db)
    updated = await service.update_alert_rule(id, rule)
    if not updated:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return updated

@router.delete("/rules/{id}")
async def delete_alert_rule(id: int, db: AsyncSession = Depends(get_db)):
    service = AlertService(db)
    success = await service.delete_alert_rule(id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return {"success": True}

@router.get("/history", response_model=List[AlertHistoryResponse])
async def get_alert_history(
    alert_rule_id: Optional[int] = Query(None, description="Filter by alert rule ID"),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    service = AlertService(db)
    return await service.get_alert_history(alert_rule_id, limit)

@router.post("/test/email")
async def test_email_alert(
    recipients: List[str] = Query(...),
    subject: str = Query("Test Alert"),
    db: AsyncSession = Depends(get_db)
):
    service = AlertService(db)
    body = "<h1>This is a test alert email</h1><p>Your alert configuration is working correctly.</p>"
    success, error_msg, response_data = await service.send_email_alert(recipients, subject, body)
    return {
        "success": success, 
        "error_message": error_msg,
        "response_data": response_data
    }

@router.post("/test/dingding")
async def test_dingding_alert(
    webhook: str = Query(...),
    title: str = Query("Test Alert"),
    content: str = Query("This is a test alert"),
    db: AsyncSession = Depends(get_db)
):
    service = AlertService(db)
    success, error_msg, response_data = await service.send_dingding_alert(webhook, title, content)
    return {
        "success": success, 
        "error_message": error_msg,
        "response_data": response_data
    }

@router.post("/test/wechat")
async def test_wechat_alert(
    webhook: str = Query(...),
    title: str = Query("Test Alert"),
    content: str = Query("This is a test alert"),
    db: AsyncSession = Depends(get_db)
):
    service = AlertService(db)
    success, error_msg, response_data = await service.send_wechat_alert(webhook, title, content)
    return {
        "success": success, 
        "error_message": error_msg,
        "response_data": response_data
    }

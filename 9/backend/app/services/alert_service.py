from app.database import get_db
from app.schemas import Alert, AlertRule, AlertLevel, AlertStatus
from app.services.websocket_service import manager
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)


class AlertService:
    def __init__(self):
        self.db = get_db()

    async def check_alert_rules(self, device_id: str, component_id: str, parameter: str, value: float):
        rules = await self.db["alert_rules"].find({
            "device_id": device_id,
            "parameter": parameter,
            "$or": [
                {"component_id": component_id},
                {"component_id": None}
            ]
        }).to_list(length=100)

        for rule in rules:
            should_trigger = False
            threshold = None

            if rule.get("min_value") is not None and value < rule["min_value"]:
                should_trigger = True
                threshold = rule["min_value"]
            elif rule.get("max_value") is not None and value > rule["max_value"]:
                should_trigger = True
                threshold = rule["max_value"]

            if should_trigger:
                await self.create_alert({
                    "device_id": device_id,
                    "component_id": component_id,
                    "parameter": parameter,
                    "current_value": value,
                    "threshold": threshold,
                    "level": rule.get("level", AlertLevel.WARNING),
                    "message": f"{parameter} {value} 超过阈值 {threshold}"
                })

    async def create_alert(self, alert_data: dict):
        existing = await self.db["alerts"].find_one({
            "device_id": alert_data["device_id"],
            "component_id": alert_data.get("component_id"),
            "parameter": alert_data["parameter"],
            "status": {"$in": [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]}
        })

        if existing:
            return existing

        alert = Alert(
            device_id=alert_data["device_id"],
            component_id=alert_data.get("component_id"),
            parameter=alert_data["parameter"],
            current_value=alert_data["current_value"],
            threshold=alert_data["threshold"],
            level=alert_data.get("level", AlertLevel.WARNING),
            message=alert_data["message"]
        )

        result = await self.db["alerts"].insert_one(alert.model_dump())
        alert_dict = alert.model_dump()
        alert_dict["id"] = str(result.inserted_id)
        
        await self._push_alert_to_websocket(alert_dict)
        
        return alert_dict

    async def acknowledge_alert(self, alert_id: str, acknowledged_by: str = "system"):
        from bson.objectid import ObjectId
        result = await self.db["alerts"].update_one(
            {"_id": ObjectId(alert_id)},
            {
                "$set": {
                    "status": AlertStatus.ACKNOWLEDGED,
                    "acknowledged_by": acknowledged_by,
                    "acknowledged_at": datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0:
            alert = await self.db["alerts"].find_one({"_id": ObjectId(alert_id)})
            if alert:
                alert_dict = self._format_alert(alert)
                await self._push_alert_update_to_websocket(alert_dict)
        
        return result.modified_count > 0

    async def resolve_alert(self, alert_id: str, resolved_by: str = "system"):
        from bson.objectid import ObjectId
        result = await self.db["alerts"].update_one(
            {"_id": ObjectId(alert_id)},
            {
                "$set": {
                    "status": AlertStatus.RESOLVED,
                    "resolved_by": resolved_by,
                    "resolved_at": datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0:
            alert = await self.db["alerts"].find_one({"_id": ObjectId(alert_id)})
            if alert:
                alert_dict = self._format_alert(alert)
                await self._push_alert_update_to_websocket(alert_dict)
        
        return result.modified_count > 0

    async def _push_alert_to_websocket(self, alert: dict):
        message = {
            "type": "alert",
            "data": alert
        }
        await manager.send_to_device(alert["device_id"], message)

    async def _push_alert_update_to_websocket(self, alert: dict):
        message = {
            "type": "alert_update",
            "data": {
                "alert": alert
            }
        }
        await manager.send_to_device(alert["device_id"], message)

    async def get_active_alerts(self, device_id: str = None):
        query = {"status": {"$in": [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]}}
        if device_id:
            query["device_id"] = device_id
        alerts = await self.db["alerts"].find(query).sort("timestamp", -1).to_list(length=100)
        return [self._format_alert(alert) for alert in alerts]

    async def get_alerts(self, device_id: str = None, status: str = None, limit: int = 100):
        query = {}
        if device_id:
            query["device_id"] = device_id
        if status:
            query["status"] = status
        alerts = await self.db["alerts"].find(query).sort("timestamp", -1).to_list(length=limit)
        return [self._format_alert(alert) for alert in alerts]

    async def add_alert_rule(self, rule: AlertRule):
        existing = await self.db["alert_rules"].find_one({
            "device_id": rule.device_id,
            "component_id": rule.component_id,
            "parameter": rule.parameter
        })
        if existing:
            return {"error": "Rule already exists"}
        
        result = await self.db["alert_rules"].insert_one(rule.model_dump())
        return {"id": str(result.inserted_id)}

    def _format_alert(self, alert: dict):
        alert["id"] = str(alert.pop("_id"))
        return alert


alert_service = AlertService()

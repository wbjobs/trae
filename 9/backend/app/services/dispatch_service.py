from app.database import get_db
from app.schemas import WorkOrder, WorkOrderPriority
from datetime import datetime
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class DispatchService:
    def __init__(self):
        self.db = get_db()

    async def create_operator(self, operator_data: dict):
        operator = {
            "operator_id": operator_data["operator_id"],
            "name": operator_data["name"],
            "phone": operator_data.get("phone"),
            "email": operator_data.get("email"),
            "regions": operator_data.get("regions", []),
            "specialization": operator_data.get("specialization", []),
            "workload": operator_data.get("workload", 0),
            "is_available": operator_data.get("is_available", True),
            "rating": operator_data.get("rating", 4.5),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        existing = await self.db["operators"].find_one({"operator_id": operator["operator_id"]})
        if existing:
            return {"error": "Operator already exists"}
        
        result = await self.db["operators"].insert_one(operator)
        operator["id"] = str(result.inserted_id)
        return self._format_operator(operator)

    async def get_operators(self, region: str = None, specialization: str = None):
        query = {"is_available": True}
        if region:
            query["regions"] = region
        if specialization:
            query["specialization"] = specialization
        
        operators = await self.db["operators"].find(query).sort("workload", 1).to_list(length=100)
        return [self._format_operator(op) for op in operators]

    async def get_operator(self, operator_id: str):
        operator = await self.db["operators"].find_one({"operator_id": operator_id})
        if operator:
            return self._format_operator(operator)
        return None

    async def update_operator_workload(self, operator_id: str, delta: int):
        result = await self.db["operators"].update_one(
            {"operator_id": operator_id},
            {
                "$inc": {"workload": delta},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        return result.modified_count > 0

    async def find_best_operator(self, region: str = None, 
                                    specialization: str = None,
                                    priority: str = "medium") -> Optional[Dict]:
        query = {"is_available": True}
        
        if region:
            query["regions"] = region
        if specialization:
            query["specialization"] = specialization
        
        operators = await self.db["operators"].find(query).to_list(length=100)
        
        if not operators and region:
            operators = await self.db["operators"].find({"is_available": True}).to_list(length=100)
        
        if not operators:
            return None
        
        def score_operator(op: dict) -> float:
            score = 100.0
            
            workload_penalty = op.get("workload", 0) * 5
            score -= workload_penalty
            
            if region and region in op.get("regions", []):
                score += 20
            
            if specialization and specialization in op.get("specialization", []):
                score += 30
            
            if priority == "high":
                rating_bonus = (op.get("rating", 4.0) - 4.0) * 10
                score += rating_bonus
            
            return score
        
        scored_operators = [(op, score_operator(op)) for op in operators]
        scored_operators.sort(key=lambda x: x[1], reverse=True)
        
        return self._format_operator(scored_operators[0][0])

    async def auto_dispatch_work_order(self, work_order_data: dict, 
                                         device_region: str = None,
                                         alert_level: str = "warning") -> dict:
        specialization_map = {
            "temperature": "电气维修",
            "pressure": "机械维修",
            "rotation_speed": "机械维修",
            "vibration": "机械维修",
        }
        
        priority_map = {
            "critical": "high",
            "warning": "medium",
            "info": "low"
        }
        
        priority = priority_map.get(alert_level, "medium")
        specialization = specialization_map.get(work_order_data.get("fault_type", ""))
        
        if not specialization and "温度" in (work_order_data.get("title", "") + work_order_data.get("description", "")):
            specialization = "电气维修"
        elif not specialization and "振动" in (work_order_data.get("title", "") + work_order_data.get("description", "")):
            specialization = "机械维修"
        
        best_operator = await self.find_best_operator(
            region=device_region,
            specialization=specialization,
            priority=priority
        )
        
        if best_operator:
            work_order_data["assigned_to"] = best_operator["operator_id"]
            work_order_data["status"] = "in_progress"
            await self.update_operator_workload(best_operator["operator_id"], 1)
            
            return {
                "success": True,
                "operator": best_operator,
                "message": f"工单已自动分配给 {best_operator['name']}"
            }
        
        return {
            "success": False,
            "message": "未找到合适的运维人员，工单待手动分配"
        }

    async def _ensure_default_operators(self):
        count = await self.db["operators"].count_documents({})
        if count == 0:
            default_operators = [
                {
                    "operator_id": "op_001",
                    "name": "张工",
                    "phone": "13800138001",
                    "email": "zhang@example.com",
                    "regions": ["华北区", "华东区"],
                    "specialization": ["电气维修", "电子维修"],
                    "workload": 0,
                    "is_available": True,
                    "rating": 4.8
                },
                {
                    "operator_id": "op_002",
                    "name": "李工",
                    "phone": "13800138002",
                    "email": "li@example.com",
                    "regions": ["华北区", "华南区"],
                    "specialization": ["机械维修", "润滑系统"],
                    "workload": 0,
                    "is_available": True,
                    "rating": 4.6
                },
                {
                    "operator_id": "op_003",
                    "name": "王工",
                    "phone": "13800138003",
                    "email": "wang@example.com",
                    "regions": ["华东区", "华南区", "西南区"],
                    "specialization": ["综合维修", "液压系统"],
                    "workload": 2,
                    "is_available": True,
                    "rating": 4.5
                },
                {
                    "operator_id": "op_004",
                    "name": "赵工",
                    "phone": "13800138004",
                    "email": "zhao@example.com",
                    "regions": ["西北区", "东北区"],
                    "specialization": ["电气维修", "PLC系统"],
                    "workload": 1,
                    "is_available": True,
                    "rating": 4.9
                }
            ]
            
            for op in default_operators:
                op["created_at"] = datetime.utcnow()
                op["updated_at"] = datetime.utcnow()
                await self.db["operators"].insert_one(op)
            
            logger.info("Created default operators")

    def _format_operator(self, operator: dict):
        if "_id" in operator:
            operator["id"] = str(operator.pop("_id"))
        if "created_at" in operator:
            operator["created_at"] = operator["created_at"].isoformat()
        if "updated_at" in operator:
            operator["updated_at"] = operator["updated_at"].isoformat()
        return operator


dispatch_service = DispatchService()

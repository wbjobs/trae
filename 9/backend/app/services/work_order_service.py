from app.database import get_db
from app.schemas import WorkOrder, WorkOrderStatus
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class WorkOrderService:
    def __init__(self):
        self.db = get_db()

    async def create_work_order(self, work_order: WorkOrder):
        work_order_dict = work_order.model_dump()
        result = await self.db["work_orders"].insert_one(work_order_dict)
        work_order_dict["id"] = str(result.inserted_id)
        return work_order_dict

    async def get_work_orders(self, device_id: str = None, status: str = None, limit: int = 100):
        query = {}
        if device_id:
            query["device_id"] = device_id
        if status:
            query["status"] = status
        orders = await self.db["work_orders"].find(query).sort("created_at", -1).to_list(length=limit)
        return [self._format_order(order) for order in orders]

    async def get_work_order(self, order_id: str):
        from bson.objectid import ObjectId
        order = await self.db["work_orders"].find_one({"_id": ObjectId(order_id)})
        if order:
            return self._format_order(order)
        return None

    async def update_work_order(self, order_id: str, update_data: dict):
        from bson.objectid import ObjectId
        update_data["updated_at"] = datetime.utcnow()
        if update_data.get("status") == WorkOrderStatus.COMPLETED:
            update_data["completed_at"] = datetime.utcnow()
        result = await self.db["work_orders"].update_one(
            {"_id": ObjectId(order_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def delete_work_order(self, order_id: str):
        from bson.objectid import ObjectId
        result = await self.db["work_orders"].delete_one({"_id": ObjectId(order_id)})
        return result.deleted_count > 0

    def _format_order(self, order: dict):
        order["id"] = str(order.pop("_id"))
        return order


work_order_service = WorkOrderService()

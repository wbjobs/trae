from fastapi import APIRouter, HTTPException, Query
from app.schemas import WorkOrder
from app.services.work_order_service import work_order_service
from app.services.dispatch_service import dispatch_service
from app.services.data_service import data_service

router = APIRouter()

@router.post("/work-orders")
async def create_work_order(work_order: WorkOrder):
    return await work_order_service.create_work_order(work_order)

@router.post("/work-orders/auto-dispatch")
async def create_work_order_with_dispatch(work_order: WorkOrder, auto_dispatch: bool = True):
    work_order_dict = work_order.model_dump()
    
    device_region = None
    device = await data_service.get_device(work_order_dict["device_id"])
    if device:
        device_region = device.get("location")
    
    dispatch_result = None
    if auto_dispatch:
        dispatch_result = await dispatch_service.auto_dispatch_work_order(
            work_order_dict,
            device_region=device_region,
            alert_level=work_order_dict.get("priority", "medium")
        )
        
        if dispatch_result.get("success"):
            work_order_dict["assigned_to"] = dispatch_result["operator"]["operator_id"]
            work_order_dict["status"] = "in_progress"
    
    result = await work_order_service.create_work_order(WorkOrder(**work_order_dict))
    
    return {
        "work_order": result,
        "dispatch": dispatch_result
    }

@router.get("/work-orders")
async def get_work_orders(device_id: str = None, status: str = None, limit: int = 100):
    return await work_order_service.get_work_orders(device_id, status, limit)

@router.get("/work-orders/{order_id}")
async def get_work_order(order_id: str):
    order = await work_order_service.get_work_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return order

@router.post("/work-orders/{order_id}/reassign")
async def reassign_work_order(
    order_id: str,
    operator_id: str = None,
    auto_dispatch: bool = True
):
    order = await work_order_service.get_work_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    if auto_dispatch and not operator_id:
        device_region = None
        device = await data_service.get_device(order["device_id"])
        if device:
            device_region = device.get("location")
        
        dispatch_result = await dispatch_service.auto_dispatch_work_order(
            order,
            device_region=device_region,
            alert_level=order.get("priority", "medium")
        )
        
        if dispatch_result.get("success"):
            operator_id = dispatch_result["operator"]["operator_id"]
        else:
            return dispatch_result
    
    if operator_id:
        await work_order_service.update_work_order(order_id, {
            "assigned_to": operator_id,
            "status": "in_progress"
        })
        
        return {
            "success": True,
            "message": f"工单已分配给 {operator_id}"
        }
    
    return {"success": False, "message": "无法自动派单，请手动选择运维人员"}

@router.patch("/work-orders/{order_id}")
async def update_work_order(order_id: str, update_data: dict):
    success = await work_order_service.update_work_order(order_id, update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Work order not found")
    return {"message": "Work order updated"}

@router.delete("/work-orders/{order_id}")
async def delete_work_order(order_id: str):
    success = await work_order_service.delete_work_order(order_id)
    if not success:
        raise HTTPException(status_code=404, detail="Work order not found")
    return {"message": "Work order deleted"}

@router.get("/operators")
async def get_operators(region: str = None, specialization: str = None):
    return await dispatch_service.get_operators(region, specialization)

@router.get("/operators/{operator_id}")
async def get_operator(operator_id: str):
    operator = await dispatch_service.get_operator(operator_id)
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    return operator

@router.post("/operators")
async def create_operator(operator_data: dict):
    result = await dispatch_service.create_operator(operator_data)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

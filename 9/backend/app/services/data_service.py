from app.database import get_db
from app.schemas import DeviceData, DeviceCreate
from app.services.alert_service import alert_service
from app.services.websocket_service import manager
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import logging
import random
import asyncio

logger = logging.getLogger(__name__)


class DataService:
    def __init__(self):
        self.db = get_db()
        self.simulated_devices = {}
        self.fault_simulations = {}

    async def save_device_data(self, data: DeviceData):
        data_dict = data.model_dump()
        
        await self._push_to_websocket(data)
        
        result = await self.db["device_data"].insert_one(data_dict)
        await self._check_alerts(data)
        
        return str(result.inserted_id)

    async def get_latest_data(self, device_id: str, component_id: str = None):
        query = {"device_id": device_id}
        if component_id:
            query["component_id"] = component_id
        data = await self.db["device_data"].find(
            query
        ).sort("timestamp", -1).limit(1).to_list(length=1)
        if data:
            return data[0]
        return None

    async def get_historical_data(self, device_id: str, component_id: str = None, 
                                  start_time: datetime = None, end_time: datetime = None,
                                  limit: int = 1000):
        query = {"device_id": device_id}
        if component_id:
            query["component_id"] = component_id
        
        if start_time or end_time:
            time_query = {}
            if start_time:
                time_query["$gte"] = start_time
            if end_time:
                time_query["$lte"] = end_time
            if time_query:
                query["timestamp"] = time_query
        
        data = await self.db["device_data"].find(query).sort("timestamp", -1).to_list(length=limit)
        return data

    async def _check_alerts(self, data: DeviceData):
        param_map = {
            "temperature": data.temperature,
            "pressure": data.pressure,
            "rotation_speed": data.rotation_speed,
            "vibration": data.vibration
        }
        
        for param, value in param_map.items():
            if value is not None:
                await alert_service.check_alert_rules(
                    device_id=data.device_id,
                    component_id=data.component_id,
                    parameter=param,
                    value=value
                )

    async def _push_to_websocket(self, data: DeviceData):
        message = {
            "type": "device_data",
            "data": {
                "device_id": data.device_id,
                "component_id": data.component_id,
                "temperature": data.temperature,
                "pressure": data.pressure,
                "rotation_speed": data.rotation_speed,
                "vibration": data.vibration,
                "timestamp": data.timestamp.isoformat()
            }
        }
        await manager.send_to_device(data.device_id, message)

    async def _push_batch_to_websocket(self, device_id: str, data_list: list):
        message = {
            "type": "device_data_batch",
            "device_id": device_id,
            "data": [
                {
                    "component_id": d.component_id,
                    "temperature": d.temperature,
                    "pressure": d.pressure,
                    "rotation_speed": d.rotation_speed,
                    "vibration": d.vibration,
                    "timestamp": d.timestamp.isoformat()
                }
                for d in data_list
            ]
        }
        await manager.send_to_device(device_id, message)

    async def create_device(self, device: DeviceCreate):
        now = datetime.utcnow()
        device_dict = device.model_dump()
        device_dict["created_at"] = now
        device_dict["updated_at"] = now
        
        try:
            result = await self.db["devices"].insert_one(device_dict)
            device_dict["id"] = str(result.inserted_id)
            return device_dict
        except Exception as e:
            logger.error(f"Error creating device: {e}")
            return {"error": str(e)}

    async def get_devices(self):
        devices = await self.db["devices"].find().to_list(length=100)
        return [self._format_device(d) for d in devices]

    async def get_device(self, device_id: str):
        device = await self.db["devices"].find_one({"device_id": device_id})
        if device:
            return self._format_device(device)
        return None

    async def update_device(self, device_id: str, update_data: dict):
        update_data["updated_at"] = datetime.utcnow()
        result = await self.db["devices"].update_one(
            {"device_id": device_id},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def simulate_fault(self, device_id: str, component_id: str, parameter: str, 
                             target_value: float, duration: int):
        key = f"{device_id}:{component_id}:{parameter}"
        self.fault_simulations[key] = {
            "target_value": target_value,
            "end_time": datetime.utcnow().timestamp() + duration
        }
        
        return {
            "message": f"Fault simulation started for {parameter}",
            "duration_seconds": duration
        }

    def get_fault_value(self, device_id: str, component_id: str, parameter: str, default_value: float):
        key = f"{device_id}:{component_id}:{parameter}"
        if key in self.fault_simulations:
            sim = self.fault_simulations[key]
            if datetime.utcnow().timestamp() < sim["end_time"]:
                return sim["target_value"]
            else:
                del self.fault_simulations[key]
        return default_value

    async def start_data_simulation(self, device_id: str):
        if device_id in self.simulated_devices:
            return {"message": "Simulation already running"}
        
        self.simulated_devices[device_id] = True
        
        asyncio.create_task(self._run_simulation(device_id))
        return {"message": "Simulation started"}

    async def stop_data_simulation(self, device_id: str):
        if device_id in self.simulated_devices:
            del self.simulated_devices[device_id]
            return {"message": "Simulation stopped"}
        return {"message": "Simulation not running"}

    async def _run_simulation(self, device_id: str):
        logger.info(f"Starting data simulation for {device_id}")
        
        base_values = {
            "temperature": 45.0,
            "pressure": 1013.25,
            "rotation_speed": 3000.0,
            "vibration": 0.5
        }
        
        components = ["main_motor", "gearbox", "bearing"]
        
        while device_id in self.simulated_devices:
            try:
                data_list = []
                for component in components:
                    data = DeviceData(
                        device_id=device_id,
                        component_id=component,
                        temperature=self.get_fault_value(
                            device_id, component, "temperature",
                            base_values["temperature"] + random.uniform(-5, 5)
                        ),
                        pressure=self.get_fault_value(
                            device_id, component, "pressure",
                            base_values["pressure"] + random.uniform(-50, 50)
                        ),
                        rotation_speed=self.get_fault_value(
                            device_id, component, "rotation_speed",
                            base_values["rotation_speed"] + random.uniform(-100, 100)
                        ),
                        vibration=self.get_fault_value(
                            device_id, component, "vibration",
                            base_values["vibration"] + random.uniform(-0.1, 0.1)
                        )
                    )
                    data_list.append(data)
                
                await self._push_batch_to_websocket(device_id, data_list)
                
                for data in data_list:
                    data_dict = data.model_dump()
                    await self.db["device_data"].insert_one(data_dict)
                    await self._check_alerts(data)
                
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.error(f"Simulation error for {device_id}: {e}")
                await asyncio.sleep(0.5)
        
        logger.info(f"Simulation stopped for {device_id}")

    async def get_playback_data(self, device_id: str, start_time: datetime, 
                                  end_time: datetime, interval: int = 1000):
        from bson.objectid import ObjectId
        
        data = await self.db["device_data"].find({
            "device_id": device_id,
            "timestamp": {
                "$gte": start_time,
                "$lte": end_time
            }
        }).sort("timestamp", 1).to_list(length=10000)
        
        alerts = await self.db["alerts"].find({
            "device_id": device_id,
            "timestamp": {
                "$gte": start_time,
                "$lte": end_time
            }
        }).sort("timestamp", 1).to_list(length=1000)
        
        formatted_alerts = [self._format_alert(a) for a in alerts]
        
        grouped_data: Dict[str, List[Dict]] = {}
        for item in data:
            comp_id = item.get("component_id", "device")
            if comp_id not in grouped_data:
                grouped_data[comp_id] = []
            grouped_data[comp_id].append(self._format_data(item))
        
        return {
            "device_id": device_id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "data_points": grouped_data,
            "alerts": formatted_alerts,
            "total_data_points": len(data),
            "total_alerts": len(alerts)
        }

    async def calculate_health_score(self, device_id: str, time_window_hours: int = 24):
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=time_window_hours)
        
        critical_alerts = await self.db["alerts"].count_documents({
            "device_id": device_id,
            "timestamp": {"$gte": start_time},
            "level": "critical",
            "status": {"$ne": "resolved"}
        })
        
        warning_alerts = await self.db["alerts"].count_documents({
            "device_id": device_id,
            "timestamp": {"$gte": start_time},
            "level": "warning",
            "status": {"$ne": "resolved"}
        })
        
        info_alerts = await self.db["alerts"].count_documents({
            "device_id": device_id,
            "timestamp": {"$gte": start_time},
            "level": "info",
            "status": {"$ne": "resolved"}
        })
        
        components = ["main_motor", "gearbox", "bearing"]
        component_health: Dict[str, Dict[str, Any]] = {}
        total_data_count = 0
        out_of_range_count = 0
        
        thresholds = {
            "temperature": {"normal": [20, 80], "warning": [80, 100], "critical": 100},
            "pressure": {"normal": [900, 1200], "warning": [1200, 1400], "critical": 1400},
            "rotation_speed": {"normal": [2500, 3500], "warning": [2000, 2500], "critical": 2000},
            "vibration": {"normal": [0, 1], "warning": [1, 2], "critical": 2},
        }
        
        for comp in components:
            latest_data = await self.db["device_data"].find({
                "device_id": device_id,
                "component_id": comp,
                "timestamp": {"$gte": start_time}
            }).sort("timestamp", -1).limit(50).to_list(length=50)
            
            comp_score = 100
            comp_status = "normal"
            comp_issues = []
            
            if latest_data:
                for data in latest_data:
                    total_data_count += 1
                    
                    for param, t in thresholds.items():
                        val = data.get(param)
                        if val is None:
                            continue
                            
                        if param == "rotation_speed":
                            if val < t["critical"]:
                                comp_score -= 20
                                comp_status = "critical"
                                out_of_range_count += 1
                            elif val < t["warning"][0]:
                                comp_score -= 10
                                if comp_status != "critical":
                                    comp_status = "warning"
                                out_of_range_count += 1
                        else:
                            if val > t["critical"]:
                                comp_score -= 20
                                comp_status = "critical"
                                out_of_range_count += 1
                            elif val > t["warning"][0]:
                                comp_score -= 10
                                if comp_status != "critical":
                                    comp_status = "warning"
                                out_of_range_count += 1
                
                latest = latest_data[0]
                component_health[comp] = {
                    "score": max(0, min(100, comp_score)),
                    "status": comp_status,
                    "latest_data": self._format_data(latest),
                    "issues": comp_issues
                }
            else:
                component_health[comp] = {
                    "score": 100,
                    "status": "normal",
                    "latest_data": None,
                    "issues": ["暂无数据"]
                }
        
        alert_penalty = (critical_alerts * 30) + (warning_alerts * 15) + (info_alerts * 5)
        avg_component_score = sum(ch["score"] for ch in component_health.values()) / len(component_health) if component_health else 100
        final_score = max(0, min(100, avg_component_score - alert_penalty))
        
        overall_status = "normal"
        if final_score < 50 or critical_alerts > 0:
            overall_status = "critical"
        elif final_score < 70 or warning_alerts > 0:
            overall_status = "warning"
        
        if final_score >= 90:
            level = "excellent"
        elif final_score >= 70:
            level = "good"
        elif final_score >= 50:
            level = "fair"
        else:
            level = "poor"
        
        return {
            "device_id": device_id,
            "score": round(final_score, 1),
            "level": level,
            "status": overall_status,
            "time_window_hours": time_window_hours,
            "calculated_at": datetime.utcnow().isoformat(),
            "alert_summary": {
                "critical": critical_alerts,
                "warning": warning_alerts,
                "info": info_alerts
            },
            "component_health": component_health,
            "recommendations": self._generate_recommendations(overall_status, component_health, critical_alerts, warning_alerts)
        }

    def _generate_recommendations(self, status: str, component_health: Dict, 
                                    critical_count: int, warning_count: int) -> List[str]:
        recommendations = []
        
        if status == "critical":
            recommendations.append("⚠️ 设备健康状况严重，建议立即停机检修")
            if critical_count > 0:
                recommendations.append(f"- 有 {critical_count} 个严重告警需要立即处理")
        
        if status == "warning":
            recommendations.append("⚠️ 设备健康状况下降，建议尽快安排维护")
        
        for comp_id, health in component_health.items():
            if health["status"] == "critical":
                comp_name = {"main_motor": "主电机", "gearbox": "变速箱", "bearing": "轴承"}.get(comp_id, comp_id)
                recommendations.append(f"- {comp_name}运行状态异常，需要重点检查")
            elif health["status"] == "warning":
                comp_name = {"main_motor": "主电机", "gearbox": "变速箱", "bearing": "轴承"}.get(comp_id, comp_id)
                recommendations.append(f"- {comp_name}需要预防性维护")
        
        if not recommendations:
            recommendations.append("✅ 设备运行正常，建议定期检查维护")
            recommendations.append("- 建议每周进行一次全面巡检")
            recommendations.append("- 建议每月进行一次预防性维护")
        
        return recommendations

    def _format_data(self, data: dict):
        if "_id" in data:
            data["id"] = str(data.pop("_id"))
        if "timestamp" in data and isinstance(data["timestamp"], datetime):
            data["timestamp"] = data["timestamp"].isoformat()
        return data

    def _format_alert(self, alert: dict):
        alert["id"] = str(alert.pop("_id"))
        return alert

    def _format_device(self, device: dict):
        device["id"] = str(device.pop("_id"))
        return device


data_service = DataService()

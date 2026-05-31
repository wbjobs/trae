import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import UploadFile
import io
import aiohttp
from influxdb_client import InfluxDBClient
from influxdb_client.client.write_api import SYNCHRONOUS

from models import DataSource
from schemas import DataSourceCreate, DataSourceUpdate

class DataSourceService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create(self, datasource: DataSourceCreate) -> DataSource:
        db_datasource = DataSource(**datasource.dict())
        self.db.add(db_datasource)
        await self.db.commit()
        await self.db.refresh(db_datasource)
        return db_datasource
    
    async def get_all(self) -> List[DataSource]:
        result = await self.db.execute(select(DataSource))
        return result.scalars().all()
    
    async def get_by_id(self, id: int) -> Optional[DataSource]:
        result = await self.db.execute(select(DataSource).where(DataSource.id == id))
        return result.scalars().first()
    
    async def update(self, id: int, datasource: DataSourceUpdate) -> Optional[DataSource]:
        db_datasource = await self.get_by_id(id)
        if db_datasource:
            update_data = datasource.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_datasource, key, value)
            await self.db.commit()
            await self.db.refresh(db_datasource)
        return db_datasource
    
    async def delete(self, id: int) -> bool:
        db_datasource = await self.get_by_id(id)
        if db_datasource:
            await self.db.delete(db_datasource)
            await self.db.commit()
            return True
        return False
    
    async def test_connection(self, datasource: DataSource) -> Dict[str, Any]:
        try:
            if datasource.type == "influxdb":
                client = InfluxDBClient(
                    url=datasource.connection_info["url"],
                    token=datasource.connection_info["token"],
                    org=datasource.connection_info["org"]
                )
                health = client.health()
                return {"success": True, "message": str(health)}
            elif datasource.type == "prometheus":
                url = datasource.connection_info["url"] + "/api/v1/query"
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, params={"query": "up"}) as response:
                        result = await response.json()
                        return {"success": result["status"] == "success", "message": result["status"]}
            elif datasource.type == "csv":
                return {"success": True, "message": "CSV file type configured"}
            return {"success": False, "message": "Unknown datasource type"}
        except Exception as e:
            return {"success": False, "message": str(e)}
    
    async def upload_csv(self, id: int, file: UploadFile) -> Dict[str, Any]:
        datasource = await self.get_by_id(id)
        if not datasource or datasource.type != "csv":
            raise ValueError("Invalid datasource")
        
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        field_mapping = datasource.field_mapping
        timestamp_field = field_mapping.get("timestamp", "timestamp")
        value_field = field_mapping.get("value", "value")
        
        points = []
        for _, row in df.iterrows():
            points.append({
                "timestamp": row[timestamp_field],
                "value": row[value_field],
                "tags": {k: v for k, v in row.items() if k not in [timestamp_field, value_field]}
            })
        
        return {
            "success": True,
            "records_count": len(points),
            "columns": list(df.columns)
        }

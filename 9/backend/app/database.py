from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings
from contextlib import asynccontextmanager
from typing import Optional

class Database:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

    async def connect(self):
        self.client = AsyncIOMotorClient(settings.mongo_uri)
        self.db = self.client[settings.mongo_db_name]
        await self._create_indexes()

    async def close(self):
        if self.client:
            self.client.close()

    async def _create_indexes(self):
        await self.db["devices"].create_index("device_id", unique=True)
        await self.db["device_data"].create_index([("device_id", 1), ("timestamp", -1)])
        await self.db["alerts"].create_index([("device_id", 1), ("timestamp", -1)])
        await self.db["alerts"].create_index("status")
        await self.db["work_orders"].create_index([("device_id", 1), ("created_at", -1)])
        await self.db["work_orders"].create_index("status")
        await self.db["alert_rules"].create_index("device_id")
        await self.db["models"].create_index("device_id", unique=True)


db = Database()


@asynccontextmanager
async def get_db_session():
    try:
        yield db.db
    except Exception as e:
        raise e


def get_db() -> AsyncIOMotorDatabase:
    return db.db

from pymongo import MongoClient
from pymongo.database import Database
from .config import settings


class MongoDB:
    _client: MongoClient = None
    _db: Database = None

    @classmethod
    def get_client(cls) -> MongoClient:
        if cls._client is None:
            cls._client = MongoClient(settings.MONGODB_URL)
        return cls._client

    @classmethod
    def get_db(cls) -> Database:
        if cls._db is None:
            cls._db = cls.get_client()[settings.MONGODB_DB_NAME]
        return cls._db

    @classmethod
    def close(cls):
        if cls._client:
            cls._client.close()
            cls._client = None
            cls._db = None


def get_collection(collection_name: str):
    return MongoDB.get_db()[collection_name]

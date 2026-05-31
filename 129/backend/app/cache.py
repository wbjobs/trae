import redis
import json
import os
from dotenv import load_dotenv
from typing import Optional, List, Dict, Any

load_dotenv()


class CacheManager:
    def __init__(self):
        self.redis_host = os.getenv("REDIS_HOST", "localhost")
        self.redis_port = int(os.getenv("REDIS_PORT", "6379"))
        self.redis_db = int(os.getenv("REDIS_DB", "0"))
        self.cache_ttl = int(os.getenv("CACHE_TTL", "3600"))
        self.client: Optional[redis.Redis] = None
        self._connect()

    def _connect(self):
        try:
            self.client = redis.Redis(
                host=self.redis_host,
                port=self.redis_port,
                db=self.redis_db,
                decode_responses=True
            )
            self.client.ping()
            print(f"Connected to Redis at {self.redis_host}:{self.redis_port}")
        except Exception as e:
            print(f"Warning: Could not connect to Redis: {e}")
            self.client = None

    def _get_cache_key(self, resolution: int, bbox: Optional[List[float]] = None) -> str:
        if bbox:
            bbox_str = "_".join([f"{x:.6f}" for x in bbox])
            return f"h3_agg:res_{resolution}:bbox_{bbox_str}"
        return f"h3_agg:res_{resolution}"

    def get(self, resolution: int, bbox: Optional[List[float]] = None) -> Optional[List[Dict[str, Any]]]:
        if not self.client:
            return None
        try:
            key = self._get_cache_key(resolution, bbox)
            data = self.client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            print(f"Cache get error: {e}")
        return None

    def set(self, resolution: int, data: List[Dict[str, Any]], bbox: Optional[List[float]] = None):
        if not self.client:
            return
        try:
            key = self._get_cache_key(resolution, bbox)
            self.client.setex(key, self.cache_ttl, json.dumps(data))
        except Exception as e:
            print(f"Cache set error: {e}")

    def clear(self):
        if not self.client:
            return
        try:
            for key in self.client.scan_iter("h3_agg:*"):
                self.client.delete(key)
            print("Cache cleared")
        except Exception as e:
            print(f"Cache clear error: {e}")


cache_manager = CacheManager()

import hashlib
import json
import time
import os
from collections import OrderedDict
from typing import Any, Optional, List, Dict
from threading import Lock
from dotenv import load_dotenv

load_dotenv()


class LRUCache:
    def __init__(self, capacity: int = None, ttl: int = None):
        if capacity is None:
            capacity = int(os.getenv("CACHE_CAPACITY", "100"))
        if ttl is None:
            ttl = int(os.getenv("CACHE_TTL", "3600"))
        self.capacity = capacity
        self.ttl = ttl
        self.cache = OrderedDict()
        self.timestamps = {}
        self.lock = Lock()
        self.hits = 0
        self.misses = 0

    def _get_key(self, query: Any) -> str:
        if isinstance(query, dict):
            key_str = json.dumps(query, sort_keys=True, default=str)
        elif isinstance(query, (list, tuple)):
            key_str = json.dumps(query, default=str)
        else:
            key_str = str(query)
        return hashlib.md5(key_str.encode('utf-8')).hexdigest()

    def get(self, query: Any) -> Optional[Any]:
        key = self._get_key(query)
        with self.lock:
            if key in self.cache:
                if time.time() - self.timestamps.get(key, 0) > self.ttl:
                    del self.cache[key]
                    del self.timestamps[key]
                    self.misses += 1
                    return None
                self.cache.move_to_end(key)
                self.hits += 1
                return self.cache[key]
            self.misses += 1
            return None

    def put(self, query: Any, value: Any) -> None:
        key = self._get_key(query)
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            else:
                if len(self.cache) >= self.capacity:
                    oldest_key, _ = self.cache.popitem(last=False)
                    self.timestamps.pop(oldest_key, None)
            self.cache[key] = value
            self.timestamps[key] = time.time()

    def invalidate(self, query: Any = None) -> None:
        with self.lock:
            if query is not None:
                key = self._get_key(query)
                self.cache.pop(key, None)
                self.timestamps.pop(key, None)
            else:
                self.cache.clear()
                self.timestamps.clear()

    def clear(self) -> None:
        with self.lock:
            self.cache.clear()
            self.timestamps.clear()
            self.hits = 0
            self.misses = 0

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            total = self.hits + self.misses
            hit_rate = self.hits / total if total > 0 else 0.0
            return {
                "size": len(self.cache),
                "capacity": self.capacity,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": hit_rate,
                "ttl": self.ttl,
            }

    def __contains__(self, query: Any) -> bool:
        key = self._get_key(query)
        with self.lock:
            if key in self.cache:
                if time.time() - self.timestamps.get(key, 0) <= self.ttl:
                    return True
                else:
                    del self.cache[key]
                    del self.timestamps[key]
            return False

    def __len__(self) -> int:
        with self.lock:
            return len(self.cache)


class SearchCache:
    _instance = None
    _text_cache: LRUCache = None
    _image_cache: LRUCache = None
    _multimodal_cache: LRUCache = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._text_cache = LRUCache(capacity=100, ttl=3600)
            cls._image_cache = LRUCache(capacity=100, ttl=3600)
            cls._multimodal_cache = LRUCache(capacity=100, ttl=3600)
        return cls._instance

    @classmethod
    def get_text_cache(cls) -> LRUCache:
        return cls._text_cache

    @classmethod
    def get_image_cache(cls) -> LRUCache:
        return cls._image_cache

    @classmethod
    def get_multimodal_cache(cls) -> LRUCache:
        return cls._multimodal_cache

    @classmethod
    def get_all_stats(cls) -> Dict[str, Any]:
        return {
            "text_cache": cls._text_cache.get_stats(),
            "image_cache": cls._image_cache.get_stats(),
            "multimodal_cache": cls._multimodal_cache.get_stats(),
        }

    @classmethod
    def clear_all(cls) -> None:
        cls._text_cache.clear()
        cls._image_cache.clear()
        cls._multimodal_cache.clear()

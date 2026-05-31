import os
import json
import time
import threading
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
import logging
import hashlib

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    key: str
    value: Any
    created_at: float
    expires_at: float
    hit_count: int = 0

    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class CacheManager:
    def __init__(self, cache_dir: str, max_entries: int = 1000, default_ttl: int = 300):
        self._cache_dir = cache_dir
        self._max_entries = max_entries
        self._default_ttl = default_ttl
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = threading.RLock()
        self._persist_filename = 'cache.json'
        self._ensure_dir()
        self._load_from_disk()

    def _ensure_dir(self) -> None:
        if not os.path.exists(self._cache_dir):
            os.makedirs(self._cache_dir, exist_ok=True)

    def _load_from_disk(self) -> None:
        file_path = os.path.join(self._cache_dir, self._persist_filename)
        if not os.path.exists(file_path):
            return

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            current_time = time.time()
            for key, entry_data in data.items():
                if entry_data.get('expires_at', 0) > current_time:
                    entry = CacheEntry(
                        key=key,
                        value=entry_data['value'],
                        created_at=entry_data['created_at'],
                        expires_at=entry_data['expires_at'],
                        hit_count=entry_data.get('hit_count', 0)
                    )
                    self._cache[key] = entry

            logger.info(f'Loaded {len(self._cache)} cache entries from disk')
        except Exception as e:
            logger.error(f'Load cache error: {e}')

    def _save_to_disk(self) -> None:
        file_path = os.path.join(self._cache_dir, self._persist_filename)
        try:
            data = {}
            for key, entry in self._cache.items():
                data[key] = {
                    'value': entry.value,
                    'created_at': entry.created_at,
                    'expires_at': entry.expires_at,
                    'hit_count': entry.hit_count
                }

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:
            logger.error(f'Save cache error: {e}')

    def set(self, key: str, value: Any, ttl: int = None) -> None:
        with self._lock:
            if ttl is None:
                ttl = self._default_ttl

            if len(self._cache) >= self._max_entries and key not in self._cache:
                self._evict_oldest()

            entry = CacheEntry(
                key=key,
                value=value,
                created_at=time.time(),
                expires_at=time.time() + ttl
            )
            self._cache[key] = entry
            logger.debug(f'Cache set: {key}')

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return default

            if entry.is_expired():
                del self._cache[key]
                return default

            entry.hit_count += 1
            return entry.value

    def exists(self, key: str) -> bool:
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return False
            if entry.is_expired():
                del self._cache[key]
                return False
            return True

    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._save_to_disk()
            logger.info('Cache cleared')

    def cleanup_expired(self) -> int:
        with self._lock:
            expired_keys = [k for k, v in self._cache.items() if v.is_expired()]
            for key in expired_keys:
                del self._cache[key]
            if expired_keys:
                self._save_to_disk()
            logger.info(f'Cleaned up {len(expired_keys)} expired cache entries')
            return len(expired_keys)

    def _evict_oldest(self) -> None:
        if not self._cache:
            return

        oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k].created_at)
        del self._cache[oldest_key]
        logger.debug(f'Evicted oldest cache entry: {oldest_key}')

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            total = len(self._cache)
            expired = sum(1 for e in self._cache.values() if e.is_expired())
            total_hits = sum(e.hit_count for e in self._cache.values())

            return {
                'total_entries': total,
                'active_entries': total - expired,
                'expired_entries': expired,
                'total_hits': total_hits,
                'max_entries': self._max_entries,
                'default_ttl': self._default_ttl
            }

    def persist(self) -> None:
        with self._lock:
            self._save_to_disk()

    def get_or_set(self, key: str, producer, ttl: int = None) -> Any:
        value = self.get(key)
        if value is not None:
            return value

        value = producer()
        if value is not None:
            self.set(key, value, ttl)
        return value

    def set_many(self, items: Dict[str, Any], ttl: int = None) -> None:
        for key, value in items.items():
            self.set(key, value, ttl)

    def get_many(self, keys: List[str]) -> Dict[str, Any]:
        result = {}
        for key in keys:
            value = self.get(key)
            if value is not None:
                result[key] = value
        return result

    def delete_many(self, keys: List[str]) -> int:
        count = 0
        for key in keys:
            if self.delete(key):
                count += 1
        return count

    @staticmethod
    def generate_key(*args, **kwargs) -> str:
        key_parts = [str(a) for a in args]
        key_parts.extend(f'{k}={v}' for k, v in sorted(kwargs.items()))
        key_string = '|'.join(key_parts)
        return hashlib.md5(key_string.encode('utf-8')).hexdigest()

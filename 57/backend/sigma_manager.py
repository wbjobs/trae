import json
import redis
from typing import Optional
from config import (
    REDIS_HOST,
    REDIS_PORT,
    REDIS_DB,
    SIGMA_KEY,
    SIGMA_CHANNEL,
    DEFAULT_SIGMA,
    MIN_SIGMA,
    MAX_SIGMA
)


class SigmaManager:
    def __init__(self):
        self.redis = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
        self._init_sigma()

    def _init_sigma(self):
        if not self.redis.exists(SIGMA_KEY):
            self.redis.set(SIGMA_KEY, DEFAULT_SIGMA)

    def get_sigma(self) -> float:
        value = self.redis.get(SIGMA_KEY)
        return float(value) if value else DEFAULT_SIGMA

    def set_sigma(self, sigma: float) -> float:
        sigma = max(MIN_SIGMA, min(MAX_SIGMA, sigma))
        self.redis.set(SIGMA_KEY, sigma)
        self.redis.publish(SIGMA_CHANNEL, json.dumps({"sigma": sigma}))
        return sigma

    def subscribe(self, callback):
        pubsub = self.redis.pubsub()
        pubsub.subscribe(**{SIGMA_CHANNEL: lambda msg: callback(json.loads(msg["data"].decode())["sigma"])})
        return pubsub


def get_current_sigma() -> float:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    value = r.get(SIGMA_KEY)
    return float(value) if value else DEFAULT_SIGMA

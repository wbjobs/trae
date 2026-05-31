const redis = require('../redis');

class DistributedLock {
  constructor(key, ttl = 10000) {
    this.key = key;
    this.ttl = ttl;
    this.lockValue = null;
    this.locked = false;
  }

  async acquire() {
    const lockValue = `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const result = await redis.getClient().set(
      `lock:${this.key}`,
      lockValue,
      'PX',
      this.ttl,
      'NX'
    );

    if (result === 'OK') {
      this.lockValue = lockValue;
      this.locked = true;
      return true;
    }

    return false;
  }

  async release() {
    if (!this.locked || !this.lockValue) {
      return false;
    }

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await redis.getClient().eval(
        script,
        1,
        `lock:${this.key}`,
        this.lockValue
      );

      this.locked = false;
      this.lockValue = null;

      return result === 1;
    } catch (error) {
      return false;
    }
  }

  async extend(newTtl = null) {
    if (!this.locked || !this.lockValue) {
      return false;
    }

    const ttl = newTtl || this.ttl;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await redis.getClient().eval(
        script,
        1,
        `lock:${this.key}`,
        this.lockValue,
        ttl.toString()
      );

      return result === 1;
    } catch (error) {
      return false;
    }
  }

  async isLocked() {
    const exists = await redis.exists(`lock:${this.key}`);
    return exists;
  }
}

function withLock(key, fn, ttl = 10000) {
  return async (...args) => {
    const lock = new DistributedLock(key, ttl);
    const acquired = await lock.acquire();

    if (!acquired) {
      throw new Error('LOCK_ACQUISITION_FAILED');
    }

    try {
      const result = await fn(...args);
      return result;
    } finally {
      await lock.release();
    }
  };
}

async function tryAcquireLock(key, ttl = 10000) {
  const lock = new DistributedLock(key, ttl);
  const acquired = await lock.acquire();
  return acquired ? lock : null;
}

module.exports = {
  DistributedLock,
  withLock,
  tryAcquireLock
};

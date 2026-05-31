const { LRUCache } = require('lru-cache');
const crypto = require('crypto');
const config = require('../config');

class QueryCache {
  constructor() {
    this.cache = new LRUCache({
      max: config.cache.maxSize,
      ttl: config.cache.ttl,
      allowStale: false,
      updateAgeOnGet: false,
      updateAgeOnHas: false
    });

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  generateKey(prefix, ...args) {
    const serialized = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(':');
    const hash = crypto.createHash('md5').update(serialized).digest('hex');
    return `${prefix}:${hash}`;
  }

  get(key) {
    try {
      const value = this.cache.get(key);
      if (value !== undefined) {
        this.stats.hits++;
        return value;
      }
      this.stats.misses++;
      return null;
    } catch (error) {
      console.error('[Cache] Get error:', error.message);
      this.stats.misses++;
      return null;
    }
  }

  set(key, value, ttl = config.cache.ttl) {
    try {
      this.cache.set(key, value, { ttl });
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('[Cache] Set error:', error.message);
      return false;
    }
  }

  delete(key) {
    try {
      const deleted = this.cache.delete(key);
      if (deleted) {
        this.stats.deletes++;
      }
      return deleted;
    } catch (error) {
      console.error('[Cache] Delete error:', error.message);
      return false;
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
    console.log('[Cache] Cleared all entries');
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      size: this.cache.size
    };
  }

  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
    console.log('[Cache] Stats reset');
  }

  async withCache(prefix, fn, ...args) {
    const key = this.generateKey(prefix, ...args);
    const cached = this.get(key);

    if (cached !== null) {
      return cached;
    }

    const result = await fn(...args);
    this.set(key, result);
    return result;
  }
}

module.exports = QueryCache;

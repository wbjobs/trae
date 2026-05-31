const config = require('./config');
const logger = require('./logger');
const redis = require('./redis');

class RateLimitManager {
  constructor() {
    this.ipStats = new Map();
    this.keyStats = new Map();
    this.blockedIPs = new Set();
    this.blockedKeys = new Set();
    this.rules = new Map();
    this.isRunning = false;
  }

  init() {
    this._loadRules();
    this._startCleanup();
    this.isRunning = true;
    logger.info('限流风控模块已初始化', {
      defaultLimit: config.rateLimit.defaultLimit,
      windowSeconds: config.rateLimit.windowSeconds
    });
  }

  _loadRules() {
    this.rules.set('default', {
      limit: config.rateLimit.defaultLimit,
      window: config.rateLimit.windowSeconds,
      blockDuration: config.rateLimit.blockDuration
    });

    this.rules.set('auth', {
      limit: 30,
      window: 60,
      blockDuration: 300
    });

    this.rules.set('admin', {
      limit: 1000,
      window: 60,
      blockDuration: 60
    });

    this.rules.set('create_key', {
      limit: 10,
      window: 60,
      blockDuration: 600
    });

    this.rules.set('delete_key', {
      limit: 5,
      window: 60,
      blockDuration: 600
    });
  }

  _startCleanup() {
    setInterval(() => {
      const now = Date.now();
      const expiry = 24 * 60 * 60 * 1000;

      for (const [ip, stats] of this.ipStats) {
        if (now - stats.lastAccess > expiry) {
          this.ipStats.delete(ip);
        }
      }

      for (const [key, stats] of this.keyStats) {
        if (now - stats.lastAccess > expiry) {
          this.keyStats.delete(key);
        }
      }
    }, 60 * 60 * 1000);
  }

  async check(ip, apiKey, endpoint = 'default') {
    const result = {
      allowed: true,
      limit: 0,
      remaining: 0,
      reset: 0,
      blocked: false,
      reason: null
    };

    if (this.blockedIPs.has(ip)) {
      result.allowed = false;
      result.blocked = true;
      result.reason = 'IP_BLOCKED';
      return result;
    }

    if (apiKey && this.blockedKeys.has(apiKey)) {
      result.allowed = false;
      result.blocked = true;
      result.reason = 'KEY_BLOCKED';
      return result;
    }

    const rule = this.rules.get(endpoint) || this.rules.get('default');
    result.limit = rule.limit;
    result.window = rule.window;

    const ipKey = `rl:ip:${ip}:${endpoint}`;
    const keyKey = apiKey ? `rl:key:${apiKey}:${endpoint}` : null;

    try {
      const ipCheck = await this._checkRedisLimit(ipKey, rule);
      result.remaining = ipCheck.remaining;
      result.reset = ipCheck.reset;

      if (!ipCheck.allowed) {
        result.allowed = false;
        result.reason = 'IP_RATE_LIMIT_EXCEEDED';
        this._recordIPViolation(ip, endpoint, rule);
        return result;
      }

      if (keyKey) {
        const keyCheck = await this._checkRedisLimit(keyKey, rule);
        result.remaining = Math.min(result.remaining, keyCheck.remaining);
        result.reset = Math.max(result.reset, keyCheck.reset);

        if (!keyCheck.allowed) {
          result.allowed = false;
          result.reason = 'KEY_RATE_LIMIT_EXCEEDED';
          this._recordKeyViolation(apiKey, endpoint, rule);
          return result;
        }
      }

      this._updateLocalStats(ip, apiKey, endpoint);

    } catch (error) {
      logger.warn('限流检查失败，放行请求', { error: error.message });
    }

    return result;
  }

  async _checkRedisLimit(key, rule) {
    const client = redis.getClient();
    if (!client) {
      return { allowed: true, remaining: rule.limit, reset: Date.now() + rule.window * 1000 };
    }

    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / (rule.window * 1000))}`;

    const count = await client.incr(windowKey);
    if (count === 1) {
      await client.expire(windowKey, rule.window + 1);
    }

    const ttl = await client.ttl(windowKey);
    const reset = now + (ttl > 0 ? ttl : rule.window) * 1000;

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      reset
    };
  }

  _recordIPViolation(ip, endpoint, rule) {
    if (!this.ipStats.has(ip)) {
      this.ipStats.set(ip, { violations: 0, lastAccess: Date.now() });
    }
    const stats = this.ipStats.get(ip);
    stats.violations++;
    stats.lastAccess = Date.now();

    if (stats.violations >= config.rateLimit.violationsBeforeBlock) {
      this.blockIP(ip, rule.blockDuration, 'RATE_LIMIT_VIOLATIONS');
    }
  }

  _recordKeyViolation(apiKey, endpoint, rule) {
    if (!this.keyStats.has(apiKey)) {
      this.keyStats.set(apiKey, { violations: 0, lastAccess: Date.now() });
    }
    const stats = this.keyStats.get(apiKey);
    stats.violations++;
    stats.lastAccess = Date.now();

    if (stats.violations >= config.rateLimit.violationsBeforeBlock) {
      this.blockKey(apiKey, rule.blockDuration, 'RATE_LIMIT_VIOLATIONS');
    }
  }

  _updateLocalStats(ip, apiKey, endpoint) {
    if (!this.ipStats.has(ip)) {
      this.ipStats.set(ip, { violations: 0, lastAccess: Date.now() });
    } else {
      this.ipStats.get(ip).lastAccess = Date.now();
    }

    if (apiKey) {
      if (!this.keyStats.has(apiKey)) {
        this.keyStats.set(apiKey, { violations: 0, lastAccess: Date.now() });
      } else {
        this.keyStats.get(apiKey).lastAccess = Date.now();
      }
    }
  }

  async blockIP(ip, durationSeconds = 3600, reason = 'MANUAL') {
    this.blockedIPs.add(ip);

    try {
      await redis.set(`block:ip:${ip}`, {
        reason,
        blockedAt: new Date().toISOString(),
        duration: durationSeconds
      }, durationSeconds);
    } catch (e) {}

    setTimeout(() => {
      this.blockedIPs.delete(ip);
    }, durationSeconds * 1000);

    logger.warn('IP 已被限流封禁', { ip, duration: durationSeconds, reason });
    return true;
  }

  async blockKey(apiKey, durationSeconds = 3600, reason = 'MANUAL') {
    this.blockedKeys.add(apiKey);

    try {
      await redis.set(`block:key:${apiKey}`, {
        reason,
        blockedAt: new Date().toISOString(),
        duration: durationSeconds
      }, durationSeconds);
    } catch (e) {}

    setTimeout(() => {
      this.blockedKeys.delete(apiKey);
    }, durationSeconds * 1000);

    logger.warn('Key 已被限流封禁', { apiKey: apiKey.substring(0, 8) + '...', duration: durationSeconds, reason });
    return true;
  }

  async unblockIP(ip) {
    this.blockedIPs.delete(ip);
    try {
      await redis.del(`block:ip:${ip}`);
    } catch (e) {}
    logger.info('IP 已解封', { ip });
    return true;
  }

  async unblockKey(apiKey) {
    this.blockedKeys.delete(apiKey);
    try {
      await redis.del(`block:key:${apiKey}`);
    } catch (e) {}
    logger.info('Key 已解封', { apiKey: apiKey.substring(0, 8) + '...' });
    return true;
  }

  async loadBlockedFromRedis() {
    try {
      const client = redis.getClient();
      if (!client) return;

      const ipKeys = await client.keys('block:ip:*');
      const keyKeys = await client.keys('block:key:*');

      for (const key of ipKeys) {
        const ip = key.replace('block:ip:', '');
        this.blockedIPs.add(ip);
      }

      for (const key of keyKeys) {
        const apiKey = key.replace('block:key:', '');
        this.blockedKeys.add(apiKey);
      }

      logger.info('从 Redis 恢复封禁列表', {
        blockedIPs: this.blockedIPs.size,
        blockedKeys: this.blockedKeys.size
      });
    } catch (e) {
      logger.warn('恢复封禁列表失败', { error: e.message });
    }
  }

  getStats() {
    return {
      blockedIPs: this.blockedIPs.size,
      blockedKeys: this.blockedKeys.size,
      trackedIPs: this.ipStats.size,
      trackedKeys: this.keyStats.size,
      rules: this.rules.size
    };
  }

  getBlockedIPs() {
    return Array.from(this.blockedIPs);
  }

  getBlockedKeys() {
    return Array.from(this.blockedKeys);
  }

  addRule(name, limit, windowSeconds, blockDuration = 3600) {
    this.rules.set(name, {
      limit,
      window: windowSeconds,
      blockDuration
    });
    logger.info('已添加限流规则', { name, limit, windowSeconds });
    return true;
  }

  removeRule(name) {
    if (name === 'default') return false;
    this.rules.delete(name);
    logger.info('已删除限流规则', { name });
    return true;
  }
}

module.exports = new RateLimitManager();

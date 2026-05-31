const ipUtil = require('ip');
const config = require('./config');
const logger = require('./logger');
const redis = require('./redis');
const database = require('./database');
const expiryChecker = require('./expiry_checker');

class GrayAuth {
  constructor() {
    this.grayRules = [];
    this.ipRangeCache = new Map();
    this.grayRequestCount = 0;
    this.totalRequestCount = 0;
    this.keyCache = new Map();
    this.keyCacheTTL = 30000;
    this.circuitBreaker = {
      dbFailures: 0,
      dbLastFailure: 0,
      dbThreshold: 5,
      dbRecoveryTime: 10000,
      dbOpen: false
    };
  }

  async init() {
    await this._loadGrayRules();
    await this._loadConfiguredIPRanges();
    logger.GRAY.info('灰度鉴权模块初始化完成', {
      ruleCount: this.grayRules.length,
      defaultTrafficPercent: config.gray.trafficPercent
    });
  }

  async _loadGrayRules() {
    try {
      const GrayIPRule = database.getModel('GrayIPRule');
      const rules = await GrayIPRule.findAll({
        where: { enabled: true }
      });
      this.grayRules = rules.map(r => r.toJSON());
      logger.GRAY.debug('已加载灰度规则', { count: this.grayRules.length });
    } catch (error) {
      logger.GRAY.error('加载灰度规则失败', { error: error.message });
      this.grayRules = [];
    }
  }

  async _loadConfiguredIPRanges() {
    for (const range of config.gray.ipRanges) {
      try {
        const parsed = this._parseIPRange(range);
        this.ipRangeCache.set(range, parsed);
      } catch (error) {
        logger.GRAY.error('IP 范围解析失败', { range, error: error.message });
      }
    }
  }

  _parseIPRange(range) {
    if (range.includes('/')) {
      const [subnet, mask] = range.split('/');
      return {
        type: 'cidr',
        subnet: subnet.trim(),
        mask: parseInt(mask),
        network: ipUtil.cidrSubnet(range)
      };
    } else if (range.includes('-')) {
      const [start, end] = range.split('-');
      return {
        type: 'range',
        start: start.trim(),
        end: end.trim(),
        startLong: ipUtil.toLong(start.trim()),
        endLong: ipUtil.toLong(end.trim())
      };
    } else {
      return {
        type: 'single',
        ip: range.trim(),
        ipLong: ipUtil.toLong(range.trim())
      };
    }
  }

  isIPInRange(ip, range) {
    const cached = this.ipRangeCache.get(range);
    if (!cached) {
      try {
        const parsed = this._parseIPRange(range);
        this.ipRangeCache.set(range, parsed);
        return this._matchIP(ip, parsed);
      } catch (error) {
        return false;
      }
    }
    return this._matchIP(ip, cached);
  }

  _matchIP(ip, parsedRange) {
    try {
      const ipLong = ipUtil.toLong(ip);

      switch (parsedRange.type) {
        case 'cidr':
          return parsedRange.network.contains(ip);

        case 'range':
          return ipLong >= parsedRange.startLong && ipLong <= parsedRange.endLong;

        case 'single':
          return ipLong === parsedRange.ipLong;

        default:
          return false;
      }
    } catch (error) {
      logger.GRAY.error('IP 匹配失败', { ip, error: error.message });
      return false;
    }
  }

  async isIPInGrayList(ip) {
    for (const rule of this.grayRules) {
      if (this.isIPInRange(ip, rule.ipRange)) {
        return {
          inGray: true,
          rule,
          trafficPercent: rule.trafficPercent
        };
      }
    }

    for (const range of config.gray.ipRanges) {
      if (this.isIPInRange(ip, range)) {
        return {
          inGray: true,
          rule: { ipRange: range, fromConfig: true },
          trafficPercent: config.gray.trafficPercent
        };
      }
    }

    return { inGray: false };
  }

  shouldUseGrayTraffic(ip, trafficPercent = 100) {
    if (trafficPercent >= 100) return true;
    if (trafficPercent <= 0) return false;

    const ipHash = this._hashIP(ip);
    const result = (ipHash % 100) < trafficPercent;

    return result;
  }

  _hashIP(ip) {
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = ((hash << 5) - hash) + ip.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async authenticate(apiKey, ip, path, method, requiredLevel = 0) {
    const startTime = Date.now();
    this.totalRequestCount++;

    let authResult = {
      success: false,
      reason: null,
      key: null,
      level: 0,
      isGray: false,
      grayInfo: null,
      responseTime: 0
    };

    if (!this._checkCircuitBreaker()) {
      return this._handleCircuitOpen(authResult, apiKey, ip, path, method, requiredLevel, startTime);
    }

    try {
      const grayCheck = await this.isIPInGrayList(ip);
      authResult.isGray = grayCheck.inGray;
      authResult.grayInfo = grayCheck;

      if (grayCheck.inGray) {
        const useGray = this.shouldUseGrayTraffic(ip, grayCheck.trafficPercent);
        if (!useGray) {
          authResult.success = false;
          authResult.reason = 'IP_GRAY_REJECTED';
          this._logAuthFast({
            ...authResult,
            key: null,
            keyId: null,
            ip,
            path,
            method,
            requiredLevel,
            responseTime: Date.now() - startTime
          });
          logger.GRAY.info('灰度流量拦截', {
            ip,
            path,
            method,
            rule: grayCheck.rule
          });
          this._resetCircuitBreaker();
          return authResult;
        }
        this.grayRequestCount++;
      }

      if (!apiKey) {
        authResult.success = false;
        authResult.reason = 'NO_API_KEY';
        this._logAuthFast({
          ...authResult,
          key: null,
          keyId: null,
          ip,
          path,
          method,
          requiredLevel,
          responseTime: Date.now() - startTime
        });
        this._resetCircuitBreaker();
        return authResult;
      }

      const cacheKey = this._getKeyCache(apiKey);
      if (cacheKey && cacheKey.cachedAt > Date.now() - this.keyCacheTTL) {
        const checkResult = this._validateCachedKey(cacheKey, requiredLevel);
        if (checkResult.fromCache) {
          this._resetCircuitBreaker();
          return this._buildAuthResult(authResult, checkResult, apiKey, ip, path, method, requiredLevel, startTime);
        }
      }

      let keyCheck;
      try {
        keyCheck = await Promise.race([
          expiryChecker.checkKeyValidity(apiKey),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 3000))
        ]);
      } catch (timeoutError) {
        if (cacheKey) {
          logger.AUTH.warn('鉴权超时，使用缓存密钥', { apiKey: apiKey.substring(0, 8) + '...' });
          const checkResult = this._validateCachedKey(cacheKey, requiredLevel);
          checkResult.fromCache = true;
          this._recordDbFailure();
          return this._buildAuthResult(authResult, checkResult, apiKey, ip, path, method, requiredLevel, startTime);
        }
        throw timeoutError;
      }

      if (!keyCheck.valid) {
        authResult.success = false;
        authResult.reason = keyCheck.reason;
        authResult.key = keyCheck.key;
        this._logAuthFast({
          ...authResult,
          key: apiKey,
          keyId: keyCheck.key ? keyCheck.key.id : null,
          ip,
          path,
          method,
          requiredLevel,
          keyLevel: keyCheck.key ? keyCheck.key.level : 0,
          responseTime: Date.now() - startTime
        });

        logger.AUTH.warn('密钥验证失败', {
          ip,
          apiKey: apiKey.substring(0, 8) + '...',
          reason: keyCheck.reason
        });

        this._resetCircuitBreaker();
        return authResult;
      }

      this._setKeyCache(apiKey, keyCheck.key);

      const keyLevel = keyCheck.key.level;
      authResult.level = keyLevel;
      authResult.key = keyCheck.key;

      if (keyLevel < requiredLevel) {
        authResult.success = false;
        authResult.reason = 'INSUFFICIENT_LEVEL';
        this._logAuthFast({
          ...authResult,
          key: apiKey,
          keyId: keyCheck.key.id,
          ip,
          path,
          method,
          requiredLevel,
          keyLevel,
          responseTime: Date.now() - startTime
        });

        logger.AUTH.warn('权限不足', {
          ip,
          keyId: keyCheck.key.id,
          keyLevel,
          requiredLevel,
          path
        });

        this._resetCircuitBreaker();
        return authResult;
      }

      authResult.success = true;
      authResult.inGracePeriod = keyCheck.inGracePeriod;
      authResult.daysToExpiry = keyCheck.daysToExpiry;
      authResult.needsRotation = keyCheck.needsRotation;

      this._logAuthFast({
        ...authResult,
        key: apiKey,
        keyId: keyCheck.key.id,
        ip,
        path,
        method,
        requiredLevel,
        keyLevel,
        responseTime: Date.now() - startTime
      });

      logger.AUTH.debug('鉴权成功', {
        ip,
        keyId: keyCheck.key.id,
        keyLevel,
        path,
        isGray: authResult.isGray
      });

      this._resetCircuitBreaker();
      return authResult;

    } catch (error) {
      this._recordDbFailure();
      authResult.success = false;
      authResult.reason = 'AUTH_ERROR';
      authResult.error = error.message;

      logger.AUTH.error('鉴权异常', {
        ip,
        path,
        error: error.message
      });

      this._logAuthFast({
        ...authResult,
        key: apiKey,
        keyId: null,
        ip,
        path,
        method,
        requiredLevel,
        responseTime: Date.now() - startTime
      });

      return authResult;
    }
  }

  _checkCircuitBreaker() {
    if (!this.circuitBreaker.dbOpen) return true;
    if (Date.now() - this.circuitBreaker.dbLastFailure > this.circuitBreaker.dbRecoveryTime) {
      this.circuitBreaker.dbOpen = false;
      this.circuitBreaker.dbFailures = 0;
      return true;
    }
    return false;
  }

  _handleCircuitOpen(authResult, apiKey, ip, path, method, requiredLevel, startTime) {
    const cacheKey = this._getKeyCache(apiKey);
    if (apiKey && cacheKey) {
      const checkResult = this._validateCachedKey(cacheKey, requiredLevel);
      checkResult.fromCache = true;
      logger.AUTH.warn('断路器打开，使用缓存密钥', { apiKey: apiKey.substring(0, 8) + '...' });
      return this._buildAuthResult(authResult, checkResult, apiKey, ip, path, method, requiredLevel, startTime);
    }
    authResult.success = false;
    authResult.reason = 'SERVICE_UNAVAILABLE';
    this._logAuthFast({
      ...authResult,
      key: apiKey,
      keyId: null,
      ip,
      path,
      method,
      requiredLevel,
      responseTime: Date.now() - startTime
    });
    return authResult;
  }

  _recordDbFailure() {
    this.circuitBreaker.dbFailures++;
    this.circuitBreaker.dbLastFailure = Date.now();
    if (this.circuitBreaker.dbFailures >= this.circuitBreaker.dbThreshold) {
      this.circuitBreaker.dbOpen = true;
      logger.AUTH.error('数据库熔断器已打开', { failures: this.circuitBreaker.dbFailures });
    }
  }

  _resetCircuitBreaker() {
    this.circuitBreaker.dbFailures = 0;
    if (this.circuitBreaker.dbOpen) {
      this.circuitBreaker.dbOpen = false;
      logger.AUTH.info('数据库熔断器已关闭');
    }
  }

  _getKeyCache(apiKey) {
    return this.keyCache.get(apiKey);
  }

  _setKeyCache(apiKey, keyData) {
    this.keyCache.set(apiKey, {
      ...keyData,
      cachedAt: Date.now()
    });
    if (this.keyCache.size > 10000) {
      const firstKey = this.keyCache.keys().next().value;
      this.keyCache.delete(firstKey);
    }
  }

  _validateCachedKey(cacheKey, requiredLevel) {
    const now = new Date();
    const expiresAt = new Date(cacheKey.expiresAt);

    if (cacheKey.status !== 1) {
      return { valid: false, reason: 'KEY_DISABLED', key: cacheKey };
    }

    if (expiresAt < now) {
      return { valid: false, reason: 'KEY_EXPIRED', key: cacheKey };
    }

    const daysToExpiry = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

    return {
      valid: true,
      key: cacheKey,
      daysToExpiry,
      needsRotation: daysToExpiry <= config.key.gracePeriodDays,
      inGracePeriod: false
    };
  }

  _buildAuthResult(baseResult, checkResult, apiKey, ip, path, method, requiredLevel, startTime) {
    const result = { ...baseResult };

    if (checkResult.valid) {
      result.success = true;
      result.key = checkResult.key;
      result.level = checkResult.key.level;
      result.daysToExpiry = checkResult.daysToExpiry;
      result.needsRotation = checkResult.needsRotation;
      result.inGracePeriod = checkResult.inGracePeriod;
      result.fromCache = checkResult.fromCache;

      if (checkResult.key.level >= requiredLevel) {
        this._logAuthFast({
          ...result,
          key: apiKey,
          keyId: checkResult.key.id,
          ip,
          path,
          method,
          requiredLevel,
          keyLevel: checkResult.key.level,
          responseTime: Date.now() - startTime
        });
      } else {
        result.success = false;
        result.reason = 'INSUFFICIENT_LEVEL';
        this._logAuthFast({
          ...result,
          key: apiKey,
          keyId: checkResult.key.id,
          ip,
          path,
          method,
          requiredLevel,
          keyLevel: checkResult.key.level,
          responseTime: Date.now() - startTime
        });
      }
    } else {
      result.success = false;
      result.reason = checkResult.reason;
      result.key = checkResult.key;
      this._logAuthFast({
        ...result,
        key: apiKey,
        keyId: checkResult.key ? checkResult.key.id : null,
        ip,
        path,
        method,
        requiredLevel,
        keyLevel: checkResult.key ? checkResult.key.level : 0,
        responseTime: Date.now() - startTime
      });
    }

    return result;
  }

  _logAuthFast(logData) {
    setImmediate(() => this._logAuth(logData).catch(e => {}));
  }

  async _logAuth(logData) {
    try {
      const AuthLog = database.getModel('AuthLog');
      await AuthLog.create({
        keyId: logData.keyId,
        key: logData.key ? logData.key.substring(0, 16) + '...' : null,
        ip: logData.ip,
        path: logData.path,
        method: logData.method,
        requiredLevel: logData.requiredLevel,
        keyLevel: logData.keyLevel,
        success: logData.success,
        failureReason: logData.reason,
        isGray: logData.isGray,
        nodeId: config.server.nodeId,
        timestamp: new Date(),
        responseTime: logData.responseTime
      });
    } catch (error) {
      logger.AUTH.error('记录鉴权日志失败', { error: error.message });
    }
  }

  async addGrayRule(ipRange, description = '', trafficPercent = 100) {
    const GrayIPRule = database.getModel('GrayIPRule');

    const rule = await GrayIPRule.create({
      ipRange,
      description,
      trafficPercent,
      enabled: true,
      createdAt: new Date()
    });

    await this._loadGrayRules();

    const clusterSync = require('./cluster_sync');
    clusterSync.broadcastSync('GRAY_RULE_UPDATED', {
      ruleId: rule.id,
      ruleData: rule.toJSON()
    });

    logger.GRAY.info('添加灰度规则', {
      ruleId: rule.id,
      ipRange,
      trafficPercent
    });

    return rule.toJSON();
  }

  async removeGrayRule(ruleId) {
    const GrayIPRule = database.getModel('GrayIPRule');
    const rule = await GrayIPRule.findByPk(ruleId);

    if (!rule) {
      throw new Error('规则不存在');
    }

    await rule.destroy();
    await this._loadGrayRules();

    logger.GRAY.info('删除灰度规则', { ruleId, ipRange: rule.ipRange });

    return true;
  }

  async listGrayRules() {
    const GrayIPRule = database.getModel('GrayIPRule');
    const rules = await GrayIPRule.findAll({
      order: [['createdAt', 'DESC']]
    });

    return {
      dbRules: rules.map(r => r.toJSON()),
      configRules: config.gray.ipRanges.map(range => ({
        ipRange: range,
        fromConfig: true,
        trafficPercent: config.gray.trafficPercent
      }))
    };
  }

  async checkIPAccess(ip, path) {
    const grayCheck = await this.isIPInGrayList(ip);

    if (!grayCheck.inGray) {
      return {
        allowed: true,
        isGray: false
      };
    }

    const useGray = this.shouldUseGrayTraffic(ip, grayCheck.trafficPercent);

    return {
      allowed: useGray,
      isGray: true,
      rule: grayCheck.rule,
      trafficPercent: grayCheck.trafficPercent
    };
  }

  getStats() {
    return {
      totalRequests: this.totalRequestCount,
      grayRequests: this.grayRequestCount,
      grayRatio: this.totalRequestCount > 0
        ? ((this.grayRequestCount / this.totalRequestCount) * 100).toFixed(2) + '%'
        : '0%',
      activeRules: this.grayRules.length,
      configIPRanges: config.gray.ipRanges.length,
      defaultTrafficPercent: config.gray.trafficPercent
    };
  }

  async getAuthStats(options = {}) {
    const { startTime, endTime, limit = 100 } = options;
    const AuthLog = database.getModel('AuthLog');
    const { Op } = require('sequelize');

    const where = {};
    if (startTime) where.timestamp = { [Op.gte]: startTime };
    if (endTime) where.timestamp = { ...where.timestamp, [Op.lte]: endTime };

    const logs = await AuthLog.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit
    });

    const total = logs.length;
    const success = logs.filter(l => l.success).length;
    const gray = logs.filter(l => l.isGray).length;

    return {
      total,
      success,
      failed: total - success,
      grayRequests: gray,
      successRate: total > 0 ? ((success / total) * 100).toFixed(2) + '%' : '0%',
      items: logs.map(l => l.toJSON())
    };
  }

  async refreshRules() {
    await this._loadGrayRules();
    logger.GRAY.info('灰度规则已刷新', { count: this.grayRules.length });
  }

  invalidateKeyCache(apiKey) {
    if (apiKey) {
      this.keyCache.delete(apiKey);
    }
  }

  invalidateAllKeyCache() {
    this.keyCache.clear();
    logger.AUTH.info('密钥本地缓存已清空');
  }
}

module.exports = new GrayAuth();

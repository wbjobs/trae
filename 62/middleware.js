const config = require('./config');
const logger = require('./logger');
const grayAuth = require('./gray_auth');
const redis = require('./redis');

function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff && xff.split(',')[0].trim() !== '') {
    return xff.split(',')[0].trim();
  }

  const xRealIP = req.headers['x-real-ip'];
  if (xRealIP) {
    return xRealIP;
  }

  const conn = req.connection;
  if (conn && conn.remoteAddress) {
    return conn.remoteAddress;
  }

  const socket = req.socket;
  if (socket && socket.remoteAddress) {
    return socket.remoteAddress;
  }

  return '127.0.0.1';
}

function authMiddleware(requiredLevel = 0) {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const ip = getClientIP(req);
    const path = req.path;
    const method = req.method;

    try {
      const authResult = await grayAuth.authenticate(
        apiKey,
        ip,
        path,
        method,
        requiredLevel
      );

      req.auth = authResult;
      req.clientIP = ip;

      if (authResult.needsRotation) {
        res.setHeader('X-Key-Expiring-Soon', authResult.daysToExpiry);
      }

      if (authResult.isGray) {
        res.setHeader('X-Gray-Traffic', 'true');
      }

      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.reason,
          message: getAuthErrorMessage(authResult.reason),
          isGray: authResult.isGray
        });
      }

      next();
    } catch (error) {
      logger.error('鉴权中间件异常', { error: error.message, ip, path });
      return res.status(500).json({
        success: false,
        error: 'AUTH_SYSTEM_ERROR',
        message: '鉴权系统异常'
      });
    }
  };
}

function getAuthErrorMessage(reason) {
  const messages = {
    'NO_API_KEY': '缺少 API Key',
    'KEY_NOT_FOUND': 'API Key 不存在',
    'KEY_REVOKED': 'API Key 已被吊销',
    'KEY_DISABLED': 'API Key 已被禁用',
    'KEY_EXPIRED': 'API Key 已过期',
    'INSUFFICIENT_LEVEL': '权限不足',
    'IP_GRAY_REJECTED': 'IP 不在灰度名单内',
    'AUTH_ERROR': '鉴权系统异常'
  };
  return messages[reason] || '鉴权失败';
}

function rateLimitMiddleware(options = {}) {
  const {
    maxRequests = 1000,
    windowMs = 60 * 1000
  } = options;

  return async (req, res, next) => {
    const ip = getClientIP(req);
    const apiKey = req.headers['x-api-key'] || 'anonymous';
    const key = `rate_limit:${apiKey}:${ip}`;

    try {
      const client = redis.getClient();
      if (!client) {
        return next();
      }

      const current = await client.incr(key);

      if (current === 1) {
        await client.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > maxRequests) {
        const retryAfter = await client.ttl(key);
        res.setHeader('Retry-After', Math.max(retryAfter, 0));
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', 0);
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: `请求频率过高，请稍后重试`
        });
      }

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));

      next();
    } catch (error) {
      logger.warn('限流中间件异常', { error: error.message });
      next();
    }
  };
}

function requestLogger(req, res, next) {
  const startTime = Date.now();
  const ip = getClientIP(req);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' :
                  res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP 请求', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip,
      userAgent: req.headers['user-agent']
    });
  });

  next();
}

function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
}

function requireMaster(req, res, next) {
  const clusterSync = require('./cluster_sync');
  if (!clusterSync.isMaster) {
    return res.status(403).json({
      success: false,
      error: 'NOT_MASTER_NODE',
      message: '此操作只能在 Master 节点执行'
    });
  }
  next();
}

function errorHandler(err, req, res, next) {
  logger.error('全局异常', {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: '接口不存在'
  });
}

module.exports = {
  getClientIP,
  authMiddleware,
  rateLimitMiddleware,
  requestLogger,
  corsMiddleware,
  requireMaster,
  errorHandler,
  notFoundHandler
};

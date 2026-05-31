const express = require('express');
const config = require('./config');
const logger = require('./logger');
const redis = require('./redis');
const database = require('./database');
const keyGenerator = require('./key_generator');
const expiryChecker = require('./expiry_checker');
const clusterSync = require('./cluster_sync');
const grayAuth = require('./gray_auth');
const middleware = require('./middleware');
const rateLimit = require('./rate_limit');
const encryption = require('./encryption');
const { hotReloadManager, isWorker } = require('./hot_reload');
const ipUtils = require('./utils/ip_utils');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(middleware.corsMiddleware);
app.use(middleware.requestLogger);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      nodeId: config.server.nodeId,
      timestamp: new Date().toISOString(),
      redis: redis.connected ? 'connected' : 'disconnected',
      database: database.connected ? 'connected' : 'disconnected'
    }
  });
});

const apiRouter = express.Router();

apiRouter.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'Distributed API Key Cluster',
      version: '1.0.0',
      nodeId: config.server.nodeId,
      isMaster: clusterSync.isMaster
    }
  });
});

apiRouter.post('/keys', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const keyData = await keyGenerator.createKey(req.body);

    clusterSync.broadcastSync('KEY_CREATED', {
      keyId: keyData.id,
      keyData
    });

    res.json({
      success: true,
      data: keyData
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/keys', middleware.authMiddleware(2), async (req, res, next) => {
  try {
    const { status, level, limit = 100, offset = 0 } = req.query;
    const result = await keyGenerator.listKeys({
      status: status !== undefined ? parseInt(status) : null,
      level: level !== undefined ? parseInt(level) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/keys/:id', middleware.authMiddleware(2), async (req, res, next) => {
  try {
    const key = await keyGenerator.getKey(req.params.id);
    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'KEY_NOT_FOUND',
        message: '密钥不存在'
      });
    }

    res.json({
      success: true,
      data: key
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.put('/keys/:id', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const updatedKey = await keyGenerator.updateKey(req.params.id, req.body);

    clusterSync.broadcastSync('KEY_UPDATED', {
      keyId: req.params.id,
      updates: req.body
    });

    res.json({
      success: true,
      data: updatedKey
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/keys/:id/revoke', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const { reason } = req.body;
    const revokedKey = await keyGenerator.revokeKey(req.params.id, reason);

    clusterSync.broadcastSync('KEY_REVOKED', {
      keyId: req.params.id,
      reason
    });

    res.json({
      success: true,
      data: revokedKey
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/keys/:id/rotate', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const result = await expiryChecker.forceRotateKey(req.params.id);

    clusterSync.broadcastSync('KEY_ROTATED', {
      oldKeyId: result.oldKey.id,
      newKeyData: result.newKey
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/keys/:id/logs', middleware.authMiddleware(2), async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const logs = await keyGenerator.getKeyLifecycleLogs(req.params.id, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/keys/batch', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const { count, prefix, level, expireDays } = req.body;
    const keys = await keyGenerator.bulkCreate(parseInt(count) || 10, {
      prefix,
      level: level !== undefined ? parseInt(level) : undefined,
      expireDays: expireDays !== undefined ? parseInt(expireDays) : undefined
    });

    res.json({
      success: true,
      data: {
        count: keys.length,
        keys
      }
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/keys/batch', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const { keyIds } = req.body;
    const result = await keyGenerator.bulkDelete(keyIds);

    if (result.success.length > 0) {
      clusterSync.broadcastSync('KEYS_BATCH_DELETED', {
        keyIds: result.success.map(r => r.keyId)
      });
    }

    res.json({
      success: result.failed.length === 0,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/keys/:id', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    await keyGenerator.deleteKey(req.params.id);

    clusterSync.broadcastSync('KEY_DELETED', {
      keyId: req.params.id
    });

    res.json({
      success: true,
      data: { message: '密钥已删除' }
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/auth/verify', middleware.authMiddleware(0), (req, res) => {
  res.json({
    success: true,
    data: {
      authenticated: true,
      key: req.auth.key,
      level: req.auth.level,
      isGray: req.auth.isGray,
      daysToExpiry: req.auth.daysToExpiry,
      needsRotation: req.auth.needsRotation
    }
  });
});

apiRouter.get('/auth/verify/:level', middleware.authMiddleware(1), (req, res) => {
  const requiredLevel = parseInt(req.params.level);
  const keyLevel = req.auth.level;

  res.json({
    success: true,
    data: {
      authorized: keyLevel >= requiredLevel,
      keyLevel,
      requiredLevel,
      isGray: req.auth.isGray
    }
  });
});

apiRouter.get('/auth/stats', middleware.authMiddleware(2), async (req, res, next) => {
  try {
    const { startTime, endTime, limit = 100 } = req.query;
    const stats = await grayAuth.getAuthStats({
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/gray/rules', middleware.authMiddleware(2), async (req, res, next) => {
  try {
    const rules = await grayAuth.listGrayRules();
    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/gray/rules', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const { ipRange, description, trafficPercent } = req.body;
    const rule = await grayAuth.addGrayRule(ipRange, description, trafficPercent);

    res.json({
      success: true,
      data: rule
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/gray/rules/:id', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    await grayAuth.removeGrayRule(parseInt(req.params.id));
    res.json({
      success: true,
      data: { message: '规则已删除' }
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/gray/check/:ip', middleware.authMiddleware(1), async (req, res, next) => {
  try {
    const check = await grayAuth.checkIPAccess(req.params.ip, req.query.path || '/');
    res.json({
      success: true,
      data: check
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/gray/stats', middleware.authMiddleware(2), (req, res) => {
  res.json({
    success: true,
    data: grayAuth.getStats()
  });
});

apiRouter.get('/cluster/status', middleware.authMiddleware(2), async (req, res, next) => {
  try {
    const status = await clusterSync.getClusterStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/cluster/sync', middleware.requireMaster, async (req, res, next) => {
  try {
    await clusterSync.forceFullSync();
    res.json({
      success: true,
      data: { message: '全量同步已触发' }
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/expiry/stats', middleware.authMiddleware(2), async (req, res, next) => {
  try {
    const stats = await expiryChecker.getExpiryStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/expiry/check', middleware.requireMaster, async (req, res, next) => {
  try {
    await expiryChecker.runExpiryCheck();
    res.json({
      success: true,
      data: { message: '过期检查已执行' }
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/expiry/rotation', middleware.requireMaster, async (req, res, next) => {
  try {
    const result = await expiryChecker.runAutoRotation();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/rate/stats', middleware.authMiddleware(2), (req, res) => {
  res.json({
    success: true,
    data: rateLimit.getStats()
  });
});

apiRouter.get('/rate/blocked/ips', middleware.authMiddleware(3), (req, res) => {
  res.json({
    success: true,
    data: rateLimit.getBlockedIPs()
  });
});

apiRouter.get('/rate/blocked/keys', middleware.authMiddleware(3), (req, res) => {
  res.json({
    success: true,
    data: rateLimit.getBlockedKeys()
  });
});

apiRouter.post('/rate/block/ip', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const { ip, duration, reason } = req.body;
    await rateLimit.blockIP(ip, duration || 3600, reason);
    res.json({ success: true, data: { message: 'IP 已封禁' } });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/rate/block/key', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    const { apiKey, duration, reason } = req.body;
    await rateLimit.blockKey(apiKey, duration || 3600, reason);
    res.json({ success: true, data: { message: 'Key 已封禁' } });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/rate/block/ip/:ip', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    await rateLimit.unblockIP(req.params.ip);
    res.json({ success: true, data: { message: 'IP 已解封' } });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/rate/block/key/:key', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    await rateLimit.unblockKey(req.params.key);
    res.json({ success: true, data: { message: 'Key 已解封' } });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/encryption/encrypt', middleware.authMiddleware(2), (req, res) => {
  try {
    const { text, level } = req.body;
    const encrypted = encryption.encrypt(text, level || 1);
    res.json({ success: true, data: { encrypted } });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

apiRouter.post('/encryption/decrypt', middleware.authMiddleware(2), (req, res) => {
  try {
    const { text } = req.body;
    const decrypted = encryption.decrypt(text);
    res.json({ success: true, data: { decrypted } });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

apiRouter.post('/encryption/rotate', middleware.authMiddleware(3), (req, res) => {
  try {
    const { newMasterKey } = req.body;
    encryption.rotateMasterKey(newMasterKey);
    res.json({ success: true, data: { message: '主密钥已轮换' } });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

apiRouter.get('/hotreload/status', middleware.authMiddleware(3), (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: config.server.enableHotReload,
      isMaster: !isWorker,
      ...(!isWorker ? { workers: hotReloadManager.getWorkersStatus() } : {})
    }
  });
});

apiRouter.post('/hotreload/reload', middleware.authMiddleware(3), async (req, res, next) => {
  try {
    if (isWorker) {
      return res.status(400).json({
        success: false,
        error: 'NOT_MASTER',
        message: '热重启只能在 Master 进程执行'
      });
    }
    const result = await hotReloadManager.triggerReload();
    res.json({
      success: result,
      data: { message: result ? '热重启已触发' : '热重启失败' }
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/health/full', middleware.authMiddleware(1), async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        status: 'ok',
        nodeId: config.server.nodeId,
        timestamp: new Date().toISOString(),
        redis: redis.connected ? 'connected' : 'disconnected',
        database: database.connected ? 'connected' : 'disconnected',
        isMaster: clusterSync.isMaster,
        hotReload: config.server.enableHotReload ? 'enabled' : 'disabled',
        isWorker,
        encryption: config.encryption.enabled ? 'enabled' : 'disabled',
        rateLimit: config.rateLimit.enabled ? 'enabled' : 'disabled'
      }
    });
  } catch (error) {
    next(error);
  }
});

const internalRouter = express.Router();

internalRouter.get('/keys/:id/sync', async (req, res) => {
  try {
    const key = await keyGenerator.getKey(req.params.id);
    res.json({
      success: true,
      data: key
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

internalRouter.post('/keys/sync', async (req, res) => {
  try {
    const { key, sourceNode } = req.body;
    await clusterSync.receiveSyncKey(key, sourceNode);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.use('/api/v1', apiRouter);
app.use('/api/internal', internalRouter);

app.use(middleware.errorHandler);
app.use(middleware.notFoundHandler);

async function bootstrap() {
  if (config.server.enableHotReload && !isWorker) {
    hotReloadManager.start(config.server.workerCount);
    return;
  }

  logger.info('='.repeat(60));
  logger.info('启动分布式 API 密钥管理集群节点');
  logger.info('='.repeat(60));
  logger.info(`节点 ID: ${config.server.nodeId}`);
  logger.info(`监听端口: ${config.server.port}`);
  logger.info(`节点主机: ${config.server.host}`);
  logger.info(`集群节点数: ${config.cluster.nodes.length}`);
  logger.info(`热重启: ${config.server.enableHotReload ? '启用' : '禁用'}`);
  logger.info(`加密存储: ${config.encryption.enabled ? '启用' : '禁用'}`);
  logger.info(`限流风控: ${config.rateLimit.enabled ? '启用' : '禁用'}`);
  logger.info('='.repeat(60));

  try {
    logger.info('正在连接 Redis...');
    await redis.connect();
    logger.info('Redis 连接成功');

    logger.info('正在连接数据库...');
    await database.connect();
    logger.info('数据库连接成功');

    logger.info('正在初始化限流风控模块...');
    if (config.rateLimit.enabled) {
      rateLimit.init();
      await rateLimit.loadBlockedFromRedis();
      logger.info('限流风控模块初始化完成');
    }

    logger.info('正在初始化集群同步模块...');
    await clusterSync.init();

    logger.info('正在初始化灰度鉴权模块...');
    await grayAuth.init();

    logger.info('正在启动过期校验模块...');
    expiryChecker.start();

    logger.info('正在启动集群同步模块...');
    clusterSync.start();

    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info('='.repeat(60));
      logger.info(`服务器已启动: http://${config.server.host}:${config.server.port}`);
      logger.info(`健康检查: http://${config.server.host}:${config.server.port}/health`);
      logger.info(`API 文档: http://${config.server.host}:${config.server.port}/api/v1`);
      logger.info('='.repeat(60));
    });

    process.on('SIGTERM', async () => {
      logger.info('收到 SIGTERM 信号，正在优雅关闭...');
      await shutdown(server);
    });

    process.on('SIGINT', async () => {
      logger.info('收到 SIGINT 信号，正在优雅关闭...');
      await shutdown(server);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的 Promise 拒绝', {
        reason: reason?.message || reason,
        stack: reason?.stack
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', {
        error: error.message,
        stack: error.stack
      });
      shutdown(server);
    });

  } catch (error) {
    logger.error('启动失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function shutdown(server) {
  logger.info('开始关闭服务...');

  try {
    expiryChecker.stop();
    clusterSync.stop();
  } catch (e) {
    logger.warn('关闭模块时出错', { error: e.message });
  }

  if (server) {
    server.close(() => {
      logger.info('HTTP 服务器已关闭');
    });
  }

  try {
    await redis.disconnect();
    await database.disconnect();
  } catch (e) {
    logger.warn('关闭连接时出错', { error: e.message });
  }

  logger.info('服务已完全关闭');
  process.exit(0);
}

bootstrap();

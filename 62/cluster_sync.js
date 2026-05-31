const axios = require('axios');
const config = require('./config');
const logger = require('./logger');
const redis = require('./redis');
const database = require('./database');
const AsyncQueue = require('./async_queue');

class ClusterSync {
  constructor() {
    this.isMaster = false;
    this.heartbeatInterval = null;
    this.syncInterval = null;
    this.isRunning = false;
    this.localKeys = new Map();
    this.messageHandlers = new Map();
    this.masterLockKey = 'cluster:master_lock';
    this.lastSyncTimestamp = 0;
    this.syncQueue = null;
    this.publishQueue = null;
    this.pendingSyncs = new Map();
  }

  async init() {
    this._registerMessageHandlers();

    this.syncQueue = new AsyncQueue('cluster_sync', {
      concurrency: 3,
      retryLimit: 3,
      visibilityTimeout: 30000
    });

    this.publishQueue = new AsyncQueue('cluster_publish', {
      concurrency: 2,
      retryLimit: 3,
      visibilityTimeout: 10000
    });

    this.syncQueue.start(async (data) => {
      await this._processSyncTask(data);
    });

    this.publishQueue.start(async (data) => {
      await this._processPublishTask(data);
    });

    logger.SYNC.info('集群异步队列已初始化');
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.SYNC.info('集群同步模块已启动', {
      nodeId: config.server.nodeId,
      clusterNodes: config.cluster.nodes.length
    });

    await this._registerNode();
    await this._tryElectMaster();

    this.heartbeatInterval = setInterval(
      () => this._sendHeartbeat(),
      5000
    );

    this.syncInterval = setInterval(
      () => this._runSyncCycle(),
      config.cluster.syncInterval
    );

    await redis.subscribe(
      config.cluster.syncChannel,
      (message) => this._handleClusterMessage(message)
    );

    setInterval(() => this._checkMasterStatus(), 10000);

    setTimeout(() => this._runSyncCycle(), 3000);
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.syncQueue) {
      this.syncQueue.stop();
    }
    if (this.publishQueue) {
      this.publishQueue.stop();
    }
    this.isRunning = false;
    logger.SYNC.info('集群同步模块已停止');
  }

  async _registerNode() {
    const NodeStatus = database.getModel('NodeStatus');
    const now = new Date();

    await NodeStatus.upsert({
      nodeId: config.server.nodeId,
      host: config.server.host,
      port: config.server.port,
      status: 1,
      lastHeartbeat: now,
      startedAt: now,
      isMaster: false
    });

    logger.SYNC.info('节点已注册到集群', {
      nodeId: config.server.nodeId,
      host: config.server.host,
      port: config.server.port
    });
  }

  async _sendHeartbeat() {
    const NodeStatus = database.getModel('NodeStatus');

    await NodeStatus.update(
      { lastHeartbeat: new Date() },
      { where: { nodeId: config.server.nodeId }
    );

    await redis.set(
      `node:heartbeat:${config.server.nodeId}`,
      {
        nodeId: config.server.nodeId,
        host: config.server.host,
        port: config.server.port,
        isMaster: this.isMaster,
        timestamp: Date.now()
      },
      15
    );
  }

  async _tryElectMaster() {
    const lockValue = await redis.acquireLock(this.masterLockKey, 30000);

    if (lockValue) {
      this.isMaster = true;

      const NodeStatus = database.getModel('NodeStatus');
      await NodeStatus.update(
        { isMaster: true },
        { where: { nodeId: config.server.nodeId } }
      );

      logger.SYNC.info('节点被选举为 Master', {
        nodeId: config.server.nodeId
      });

      this._masterLockValue = lockValue;
      return true;
    }

    return false;
  }

  async _checkMasterStatus() {
    if (this.isMaster) {
      const extended = await redis.getClient().expire(
        `${config.redis.keyPrefix}lock:${this.masterLockKey}`,
        30
      );
      if (!extended) {
        this.isMaster = false;
        logger.SYNC.warn('Master 锁丢失，重新选举');
        this._tryElectMaster();
      }
    } else {
      const masterInfo = await redis.get(`lock:${this.masterLockKey}`);
      if (!masterInfo) {
        logger.SYNC.info('Master 不存在，尝试选举');
        this._tryElectMaster();
      }
    }
  }

  async _runSyncCycle() {
    try {
      const syncState = await this._getLocalSyncState();
      const remoteStates = await this._getAllNodeStates();

      const diffs = this._calculateDiffs(syncState, remoteStates);

      if (diffs.needSync) {
        await this._syncFromNodes(diffs);
      }

      await this._cleanupOfflineNodes();

    } catch (error) {
      logger.SYNC.error('同步周期执行失败', { error: error.message });
    }
  }

  async _getLocalSyncState() {
    const state = {
      nodeId: config.server.nodeId,
      timestamp: Date.now(),
      data: {
        keys: await this._getKeyChecksums(),
        grayRules: await this._getGrayRuleChecksums()
      }
    };

    await redis.set(`node:state:${config.server.nodeId}`, state, 60);

    return state;
  }

  async _getAllNodeStates() {
    const states = [];
    const NodeStatus = database.getModel('NodeStatus');
    const nodes = await NodeStatus.findAll({
      where: { status: 1 }
    });

    for (const node of nodes) {
      if (node.nodeId !== config.server.nodeId) {
        const state = await redis.get(`node:state:${node.nodeId}`);
        if (state) {
          states.push(state);
        }
      }
    }

    return states;
  }

  _calculateDiffs(localState, remoteStates) {
    const diffs = {
      needSync: false,
      keysToPull: [],
      keysToPush: [],
      grayRulesToPull: [],
      grayRulesToPush: []
    };

    const localKeys = localState.data.keys;
    const localGray = localState.data.grayRules;

    for (const remote of remoteStates) {
      const remoteKeys = remote.data.keys || {};
      const remoteGray = remote.data.grayRules || {};

      for (const [keyId, checksum of Object.entries(remoteKeys)) {
        if (localKeys[keyId] !== checksum) {
          if (remote.timestamp > this.lastSyncTimestamp) {
            diffs.keysToPull.push({ nodeId: remote.nodeId, keyId });
            diffs.needSync = true;
          }
        }
      }

      for (const [keyId, checksum of Object.entries(localKeys)) {
        if (remoteKeys[keyId] !== checksum) {
          if (localState.timestamp > remote.timestamp) {
            diffs.keysToPush.push({ nodeId: remote.nodeId, keyId });
            diffs.needSync = true;
          }
        }
      }
    }

    return diffs;
  }

  async _syncFromNodes(diffs) {
    logger.SYNC.info('开始同步数据同步', {
      keysToPull: diffs.keysToPull.length,
      keysToPush: diffs.keysToPush.length
    });

    for (const item of diffs.keysToPull) {
      try {
        await this._pullKeyFromNode(item.nodeId, item.keyId);
      } catch (error) {
        logger.SYNC.error('拉取密钥失败', {
          fromNode: item.nodeId,
          keyId: item.keyId,
          error: error.message
        });
      }
    }

    for (const item of diffs.keysToPush) {
      try {
        await this._pushKeyToNode(item.nodeId, item.keyId);
      } catch (error) {
        logger.SYNC.error('推送密钥失败', {
          toNode: item.nodeId,
          keyId: item.keyId,
          error: error.message
        });
      }
    }

    this.lastSyncTimestamp = Date.now();
  }

  async _pullKeyFromNode(nodeId, keyId) {
    const nodeInfo = await this._getNodeInfo(nodeId);
    if (!nodeInfo) return;

    try {
      const response = await axios.get(
        `http://${nodeInfo.host}:${nodeInfo.port}/api/internal/keys/${keyId}/sync`,
        { timeout: config.cluster.syncTimeout }
      );

      if (response.data.success && response.data.data) {
        const keyData = response.data.data;
        const APIKey = database.getModel('APIKey');
        await APIKey.upsert(keyData);
        logger.SYNC.info('密钥同步成功', { from: nodeId, keyId });
      }
    } catch (error) {
      throw error;
    }
  }

  async _pushKeyToNode(nodeId, keyId) {
    const nodeInfo = await this._getNodeInfo(nodeId);
    if (!nodeInfo) return;

    const keyGenerator = require('./key_generator');
    const keyData = await keyGenerator.getKey(keyId);

    if (!keyData) return;

    try {
      await axios.post(
        `http://${nodeInfo.host}:${nodeInfo.port}/api/internal/keys/sync`,
        { key: keyData, sourceNode: config.server.nodeId },
        { timeout: config.cluster.syncTimeout }
      );
      logger.SYNC.info('密钥推送成功', { to: nodeId, keyId });
    } catch (error) {
      throw error;
    }
  }

  async _getNodeInfo(nodeId) {
    const state = await redis.get(`node:heartbeat:${nodeId}`);
    if (state) return state;

    const NodeStatus = database.getModel('NodeStatus');
    const node = await NodeStatus.findByPk(nodeId);
    return node ? node.toJSON() : null;
  }

  async _getKeyChecksums() {
    const APIKey = database.getModel('APIKey');
    const keys = await APIKey.findAll({
      attributes: ['id', 'updatedAt']
    });

    const checksums = {};
    for (const key of keys) {
      checksums[key.id] = Date.parse(key.updatedAt || key.createdAt);
    }

    return checksums;
  }

  async _getGrayRuleChecksums() {
    const GrayIPRule = database.getModel('GrayIPRule');
    const rules = await GrayIPRule.findAll({
      attributes: ['id', 'createdAt']
    });

    const checksums = {};
    for (const rule of rules) {
      checksums[rule.id] = Date.parse(rule.createdAt);
    }

    return checksums;
  }

  async _cleanupOfflineNodes() {
    const NodeStatus = database.getModel('NodeStatus');
    const threshold = new Date(Date.now() - 30000);

    await NodeStatus.update(
      { status: 0 },
      {
        where: {
          lastHeartbeat: {
            [require('sequelize').Op.lt]: threshold
          }
        }
      }
    );
  }

  async broadcastSync(eventType, data, priority = 0) {
    const message = {
      type: eventType,
      sourceNode: config.server.nodeId,
      timestamp: Date.now(),
      data
    };

    await this.publishQueue.enqueue({
      channel: config.cluster.syncChannel,
      message,
      eventType
    }, priority);

    logger.SYNC.debug('同步消息已入队待广播', { type: eventType });
  }

  async _processPublishTask(data) {
    await redis.publish(data.channel, data.message);
    logger.SYNC.debug('同步消息已广播', { type: data.eventType });
  }

  async _processSyncTask(data) {
    const { taskType, payload } = data;

    switch (taskType) {
      case 'pull_key':
        await this._pullKeyFromNode(payload.nodeId, payload.keyId);
        break;
      case 'push_key':
        await this._pushKeyToNode(payload.nodeId, payload.keyId);
        break;
      case 'full_sync':
        await this._executeFullSync();
        break;
      case 'retry_failed':
        await this._retryFailedSync(payload.syncId);
        break;
      default:
        logger.SYNC.warn('未知同步任务类型', { taskType });
    }
  }

  async _queueSyncTask(taskType, payload, priority = 0) {
    const taskId = `${taskType}-${Date.now()}`;
    this.pendingSyncs.set(taskId, {
      status: 'pending',
      taskType,
      payload,
      createdAt: Date.now()
    });

    await this.syncQueue.enqueue({ taskType, payload, taskId }, priority);
    return taskId;
  }

  _registerMessageHandlers() {
    this.messageHandlers.set('KEY_CREATED', (msg) => this._handleKeyCreated(msg));
    this.messageHandlers.set('KEY_UPDATED', (msg) => this._handleKeyUpdated(msg));
    this.messageHandlers.set('KEY_ROTATED', (msg) => this._handleKeyRotated(msg));
    this.messageHandlers.set('KEY_REVOKED', (msg) => this._handleKeyRevoked(msg));
    this.messageHandlers.set('KEY_DELETED', (msg) => this._handleKeyDeleted(msg));
    this.messageHandlers.set('KEYS_BATCH_DELETED', (msg) => this._handleKeysBatchDeleted(msg));
    this.messageHandlers.set('GRAY_RULE_UPDATED', (msg) => this._handleGrayRuleUpdated(msg));
  }

  async _handleClusterMessage(message) {
    if (message.sourceNode === config.server.nodeId) return;

    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      try {
        await handler(message);
      } catch (error) {
        logger.SYNC.error('处理集群消息失败', {
          type: message.type,
          error: error.message
        });
      }
    }
  }

  async _handleKeyCreated(message) {
    const { keyId, keyData } = message.data;
    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const existing = await APIKey.findByPk(keyId);
    if (!existing) {
      await APIKey.create(keyData);
      await KeyLifecycleLog.create({
        keyId,
        action: 'SYNC_CREATE',
        nodeId: config.server.nodeId,
        timestamp: new Date(),
        details: { sourceNode: message.sourceNode }
      });
      await redis.del(`key:${keyId}`);
      await redis.del(`key_by_key:${keyData.key}`);
      logger.SYNC.info('同步创建密钥', { keyId, from: message.sourceNode });
    }
  }

  async _handleKeyUpdated(message) {
    const { keyId, updates } = message.data;
    const APIKey = database.getModel('APIKey');
    const key = await APIKey.findByPk(keyId);
    if (key) {
      await key.update(updates);
      logger.SYNC.info('同步更新密钥', { keyId, from: message.sourceNode });
    }
    if (updates.key) {
      const grayAuth = require('./gray_auth');
      grayAuth.invalidateKeyCache(updates.key);
    }
  }

  async _handleKeyRotated(message) {
    const { oldKeyId, newKeyData } = message.data;
    const APIKey = database.getModel('APIKey');

    const oldKey = await APIKey.findByPk(oldKeyId);
    if (oldKey) {
      await oldKey.update({ status: 2, rotatedAt: new Date() });
    }
    await APIKey.create(newKeyData);
    logger.SYNC.info('同步轮换密钥', { oldKeyId, from: message.sourceNode });
  }

  async _handleKeyRevoked(message) {
    const { keyId } = message.data;
    const APIKey = database.getModel('APIKey');
    const key = await APIKey.findByPk(keyId);
    if (key) {
      const keyData = key.toJSON();
      await key.update({ status: 0 });
      const grayAuth = require('./gray_auth');
      grayAuth.invalidateKeyCache(keyData.key);
      logger.SYNC.info('同步吊销密钥', { keyId, from: message.sourceNode });
    }
  }

  async _handleKeyDeleted(message) {
    const { keyId } = message.data;
    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    try {
      await database.transaction(async (t) => {
        await KeyLifecycleLog.destroy({ where: { keyId }, transaction: t });
        await APIKey.destroy({ where: { id: keyId }, transaction: t });
      });
      logger.SYNC.info('同步删除密钥', { keyId, from: message.sourceNode });
    } catch (error) {
      logger.SYNC.error('同步删除密钥失败', { keyId, error: error.message });
    }
  }

  async _handleKeysBatchDeleted(message) {
    const { keyIds } = message.data;
    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    try {
      await database.transaction(async (t) => {
        await KeyLifecycleLog.destroy({ where: { keyId: keyIds }, transaction: t });
        await APIKey.destroy({ where: { id: keyIds }, transaction: t });
      });
      logger.SYNC.info('同步批量删除密钥', { count: keyIds.length, from: message.sourceNode });
    } catch (error) {
      logger.SYNC.error('同步批量删除密钥失败', { error: error.message });
    }
  }

  async _handleGrayRuleUpdated(message) {
    const { ruleId, ruleData } = message.data;
    const GrayIPRule = database.getModel('GrayIPRule');
    await GrayIPRule.upsert(ruleData);
    logger.SYNC.info('同步灰度规则', { ruleId, from: message.sourceNode });
  }

  async getClusterStatus() {
    const NodeStatus = database.getModel('NodeStatus');
    const nodes = await NodeStatus.findAll({
      order: [['lastHeartbeat', 'DESC']]
    });

    const nodeList = nodes.map(n => n.toJSON());

    return {
      localNode: {
        nodeId: config.server.nodeId,
        isMaster: this.isMaster,
        host: config.server.host,
        port: config.server.port
      },
      nodes: nodeList,
      masterNode: nodeList.find(n => n.isMaster),
      syncStatus: {
        lastSync: this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toISOString() : null,
        pendingTasks: this.pendingSyncs.size
      },
      queues: {
        syncQueue: this.syncQueue ? this.syncQueue.getStats() : null,
        publishQueue: this.publishQueue ? this.publishQueue.getStats() : null
      }
    };
  }

  async forceFullSync() {
    logger.SYNC.info('执行全量同步');
    this._runSyncCycle();
  }

  async receiveSyncKey(keyData, sourceNode) {
    const APIKey = database.getModel('APIKey');
    const KeyLifecycleLog = database.getModel('KeyLifecycleLog');

    const existing = await APIKey.findByPk(keyData.id);
    if (existing) {
      await existing.update(keyData);
    } else {
      await APIKey.create(keyData);
    }

    await KeyLifecycleLog.create({
      keyId: keyData.id,
      action: 'SYNC',
      nodeId: config.server.nodeId,
      timestamp: new Date(),
      details: { sourceNode }
    });

    await redis.del(`key:${keyData.id}`);
    await redis.del(`key_by_key:${keyData.key}`);

    logger.SYNC.info('接收同步密钥', { keyId: keyData.id, from: sourceNode });

    return true;
  }
}

module.exports = new ClusterSync();

const config = require('./config');
const logger = require('./logger');
const redis = require('./redis');

class AsyncQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.queueKey = `queue:${name}`;
    this.processingKey = `queue:${name}:processing`;
    this.dlqKey = `queue:${name}:dlq`;
    this.concurrency = options.concurrency || 1;
    this.retryLimit = options.retryLimit || 3;
    this.visibilityTimeout = options.visibilityTimeout || 30000;
    this.handler = null;
    this.isRunning = false;
    this.processingCount = 0;
    this.stats = {
      processed: 0,
      failed: 0,
      retried: 0
    };
  }

  async enqueue(data, priority = 0) {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data,
      priority,
      retryCount: 0,
      createdAt: Date.now()
    };

    try {
      await redis.getClient().zadd(
        this.queueKey,
        priority,
        JSON.stringify(item)
      );
      logger.debug('任务已入队', { queue: this.name, itemId: item.id });
      return item.id;
    } catch (error) {
      logger.error('任务入队失败', { queue: this.name, error: error.message });
      throw error;
    }
  }

  async enqueueBatch(items, priority = 0) {
    const pipeline = redis.getClient().pipeline();
    const ids = [];

    for (const data of items) {
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        data,
        priority,
        retryCount: 0,
        createdAt: Date.now()
      };
      pipeline.zadd(this.queueKey, priority, JSON.stringify(item));
      ids.push(item.id);
    }

    try {
      await pipeline.exec();
      return ids;
    } catch (error) {
      logger.error('批量入队失败', { queue: this.name, error: error.message });
      throw error;
    }
  }

  async dequeue() {
    try {
      const client = redis.getClient();
      const result = await client.zpopmax(this.queueKey, 1);

      if (!result || result.length === 0) {
        return null;
      }

      const [itemStr, priority] = result;
      const item = JSON.parse(itemStr);

      item.dequeuedAt = Date.now();
      await client.setex(
        `${this.processingKey}:${item.id}`,
        this.visibilityTimeout / 1000,
        itemStr
      );

      return item;
    } catch (error) {
      logger.error('任务出队失败', { queue: this.name, error: error.message });
      return null;
    }
  }

  async complete(itemId) {
    try {
      await redis.getClient().del(`${this.processingKey}:${itemId}`);
      this.stats.processed++;
      logger.debug('任务完成', { queue: this.name, itemId });
      return true;
    } catch (error) {
      logger.error('任务完成标记失败', { queue: this.name, itemId, error: error.message });
      return false;
    }
  }

  async fail(item, error) {
    item.retryCount = (item.retryCount || 0) + 1;
    item.lastError = error.message;
    item.failedAt = Date.now();

    if (item.retryCount > this.retryLimit) {
      await this._moveToDLQ(item);
      this.stats.failed++;
      logger.error('任务重试失败，移入死信队列', {
        queue: this.name,
        itemId: item.id,
        retries: item.retryCount,
        error: error.message
      });
    } else {
      item.nextRetryAt = Date.now() + this._calculateBackoff(item.retryCount);
      await this.enqueue(item.data, item.priority || 0);
      this.stats.retried++;
      logger.warn('任务重试', {
        queue: this.name,
        itemId: item.id,
        retryCount: item.retryCount,
        error: error.message
      });
    }

    await redis.getClient().del(`${this.processingKey}:${item.id}`);
  }

  _calculateBackoff(retryCount) {
    return Math.min(1000 * Math.pow(2, retryCount), 30000);
  }

  async _moveToDLQ(item) {
    try {
      await redis.getClient().lpush(this.dlqKey, JSON.stringify(item));
    } catch (error) {
      logger.error('移入死信队列失败', { queue: this.name, error: error.message });
    }
  }

  async getDLQ(limit = 100) {
    try {
      const items = await redis.getClient().lrange(this.dlqKey, 0, limit - 1);
      return items.map(i => JSON.parse(i));
    } catch (error) {
      return [];
    }
  }

  async clearDLQ() {
    try {
      await redis.getClient().del(this.dlqKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  async retryDLQ() {
    const items = await this.getDLQ(1000);
    for (const item of items) {
      item.retryCount = 0;
      await this.enqueue(item.data, item.priority || 0);
    }
    await this.clearDLQ();
    return items.length;
  }

  start(handler) {
    if (this.isRunning) return;

    this.handler = handler;
    this.isRunning = true;
    logger.info('队列已启动', { queue: this.name, concurrency: this.concurrency });

    for (let i = 0; i < this.concurrency; i++) {
      this._processLoop();
    }
  }

  stop() {
    this.isRunning = false;
    logger.info('队列已停止', { queue: this.name });
  }

  async _processLoop() {
    while (this.isRunning) {
      if (this.processingCount >= this.concurrency) {
        await this._sleep(100);
        continue;
      }

      const item = await this.dequeue();
      if (!item) {
        await this._sleep(500);
        continue;
      }

      this.processingCount++;
      this._processItem(item).finally(() => {
        this.processingCount--;
      });
    }
  }

  async _processItem(item) {
    try {
      await this.handler(item.data, item);
      await this.complete(item.id);
    } catch (error) {
      await this.fail(item, error);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async size() {
    try {
      return await redis.getClient().zcard(this.queueKey);
    } catch (error) {
      return 0;
    }
  }

  async processingSize() {
    try {
      const keys = await redis.getClient().keys(`${this.processingKey}:*`);
      return keys.length;
    } catch (error) {
      return 0;
    }
  }

  async dlqSize() {
    try {
      return await redis.getClient().llen(this.dlqKey);
    } catch (error) {
      return 0;
    }
  }

  getStats() {
    return {
      ...this.stats,
      pending: this.size(),
      processing: this.processingCount,
      dlq: this.dlqSize(),
      concurrency: this.concurrency
    };
  }

  async clear() {
    try {
      await Promise.all([
        redis.getClient().del(this.queueKey),
        redis.getClient().del(this.dlqKey)
      ]);
      const processingKeys = await redis.getClient().keys(`${this.processingKey}:*`);
      if (processingKeys.length > 0) {
        await redis.getClient().del(...processingKeys);
      }
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = AsyncQueue;

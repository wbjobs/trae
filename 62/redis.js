const Redis = require('ioredis');
const config = require('./config');
const logger = require('./logger');

class RedisCluster {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.connected = false;
  }

  async connect() {
    try {
      if (config.redis.nodes.length > 1) {
        this.client = new Redis.Cluster(config.redis.nodes, {
          redisOptions: {
            password: config.redis.password,
            keyPrefix: config.redis.keyPrefix,
            enableReadyCheck: config.redis.enableReadyCheck,
            maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
            retryDelayOnFailover: config.redis.retryDelayOnFailover
          }
        });

        this.subscriber = new Redis.Cluster(config.redis.nodes, {
          redisOptions: {
            password: config.redis.password,
            enableReadyCheck: true
          }
        });
      } else {
        const singleNode = config.redis.nodes[0];
        this.client = new Redis({
          host: singleNode.host,
          port: singleNode.port,
          password: config.redis.password,
          keyPrefix: config.redis.keyPrefix,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3
        });

        this.subscriber = new Redis({
          host: singleNode.host,
          port: singleNode.port,
          password: config.redis.password,
          enableReadyCheck: true
        });
      }

      this.client.on('connect', () => {
        this.connected = true;
        logger.info('Redis 连接成功', { type: 'main_client' });
      });

      this.client.on('error', (err) => {
        logger.error('Redis 主客户端错误', { error: err.message });
      });

      this.subscriber.on('connect', () => {
        logger.info('Redis 订阅客户端连接成功', { type: 'subscriber' });
      });

      this.subscriber.on('error', (err) => {
        logger.error('Redis 订阅客户端错误', { error: err.message });
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis 连接超时'));
        }, 10000);

        this.client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

    } catch (error) {
      logger.error('Redis 连接失败', { error: error.message });
      throw error;
    }
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis 获取失败', { key, error: error.message });
      return null;
    }
  }

  async set(key, value, expireSeconds) {
    try {
      const strValue = JSON.stringify(value);
      if (expireSeconds) {
        await this.client.setex(key, expireSeconds, strValue);
      } else {
        await this.client.set(key, strValue);
      }
      return true;
    } catch (error) {
      logger.error('Redis 设置失败', { key, error: error.message });
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis 删除失败', { key, error: error.message });
      return false;
    }
  }

  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      return false;
    }
  }

  async expire(key, seconds) {
    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      return false;
    }
  }

  async hget(key, field) {
    try {
      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  async hset(key, field, value) {
    try {
      await this.client.hset(key, field, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  async hgetall(key) {
    try {
      const result = await this.client.hgetall(key);
      const parsed = {};
      Object.keys(result).forEach(field => {
        parsed[field] = JSON.parse(result[field]);
      });
      return parsed;
    } catch (error) {
      return {};
    }
  }

  async publish(channel, message) {
    try {
      await this.client.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Redis 发布消息失败', { channel, error: error.message });
      return false;
    }
  }

  async subscribe(channel, callback) {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          try {
            callback(JSON.parse(message));
          } catch (e) {
            logger.error('消息解析失败', { message, error: e.message });
          }
        }
      });
      return true;
    } catch (error) {
      logger.error('Redis 订阅失败', { channel, error: error.message });
      return false;
    }
  }

  async acquireLock(lockKey, ttl = 10000) {
    const lockValue = `${config.server.nodeId}-${Date.now()}`;
    const result = await this.client.set(
      `lock:${lockKey}`,
      lockValue,
      'PX',
      ttl,
      'NX'
    );
    if (result === 'OK') {
      return lockValue;
    }
    return null;
  }

  async releaseLock(lockKey, lockValue) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.client.eval(script, 1, `lock:${lockKey}`, lockValue);
    return result === 1;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
    }
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    this.connected = false;
  }

  getClient() {
    return this.client;
  }
}

module.exports = new RedisCluster();

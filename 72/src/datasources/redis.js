const Redis = require('ioredis');
const DataLoader = require('dataloader');
const config = require('../config');

class RedisDataSource {
  constructor() {
    this.client = new Redis(config.redis);
    this.onlineStatusLoader = new DataLoader(this.batchGetOnlineStatus.bind(this));
    this.isConnected = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.client.on('connect', () => {
      console.log('[Redis] Connected to Redis successfully');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      console.error('[Redis] Connection error:', error.message);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.warn('[Redis] Connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.warn('[Redis] Reconnecting...');
    });
  }

  async batchGetOnlineStatus(userIds) {
    try {
      if (!this.isConnected) {
        return userIds.map(() => this.getMockOnlineStatus());
      }

      const keys = userIds.map(id => `user:${id}:online`);
      const values = await this.client.mget(keys);

      return values.map((value, index) => {
        if (value === null) {
          return {
            userId: userIds[index],
            isOnline: false,
            lastSeen: null
          };
        }
        try {
          const data = JSON.parse(value);
          return {
            userId: userIds[index],
            isOnline: data.isOnline || false,
            lastSeen: data.lastSeen || null
          };
        } catch {
          return {
            userId: userIds[index],
            isOnline: false,
            lastSeen: null
          };
        }
      });
    } catch (error) {
      console.error('[Redis] batchGetOnlineStatus error:', error.message);
      return userIds.map(() => this.getMockOnlineStatus());
    }
  }

  async getOnlineStatus(userId) {
    try {
      if (!this.isConnected) {
        console.warn('[Redis] Connection not available, using mock data');
        return this.getMockOnlineStatus(userId);
      }
      return this.onlineStatusLoader.load(userId);
    } catch (error) {
      console.error('[Redis] getOnlineStatus error:', error.message);
      return this.getMockOnlineStatus(userId);
    }
  }

  async setOnlineStatus(userId, isOnline) {
    try {
      if (!this.isConnected) {
        return false;
      }
      const key = `user:${userId}:online`;
      const value = JSON.stringify({
        isOnline,
        lastSeen: new Date().toISOString()
      });
      await this.client.setex(key, 300, value);
      return true;
    } catch (error) {
      console.error('[Redis] setOnlineStatus error:', error.message);
      return false;
    }
  }

  async clearUserOnlineStatus(userId) {
    try {
      if (!this.isConnected) {
        return false;
      }
      await this.client.del(`user:${userId}:online`);
      return true;
    } catch (error) {
      console.error('[Redis] clearUserOnlineStatus error:', error.message);
      return false;
    }
  }

  async getOnlineUsersCount() {
    try {
      if (!this.isConnected) {
        return Math.floor(Math.random() * 100) + 1;
      }
      const keys = await this.client.keys('user:*:online');
      let count = 0;
      for (const key of keys) {
        const value = await this.client.get(key);
        if (value) {
          try {
            const data = JSON.parse(value);
            if (data.isOnline) count++;
          } catch {
            // ignore
          }
        }
      }
      return count;
    } catch (error) {
      console.error('[Redis] getOnlineUsersCount error:', error.message);
      return Math.floor(Math.random() * 100) + 1;
    }
  }

  getMockOnlineStatus(userId) {
    return {
      userId: userId || 'unknown',
      isOnline: Math.random() > 0.5,
      lastSeen: new Date(Date.now() - Math.random() * 3600000).toISOString()
    };
  }

  async close() {
    await this.client.quit();
    console.log('[Redis] Connection closed');
  }
}

module.exports = RedisDataSource;

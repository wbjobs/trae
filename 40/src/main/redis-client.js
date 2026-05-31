const Redis = require('ioredis');
const log = require('electron-log');

class RedisClient {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.subscriptions = new Map();
    this.locationSubscriptions = new Map(); // 房间位置数据订阅
  }

  async connect() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > 10) {
          log.error('Redis connection failed after 10 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
    });

    this.subscriber = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > 10) {
          log.error('Redis subscriber connection failed after 10 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    this.client.on('connect', () => {
      log.info('Redis client connected');
    });

    this.client.on('error', (err) => {
      log.error('Redis client error:', err);
    });

    this.subscriber.on('error', (err) => {
      log.error('Redis subscriber error:', err);
    });

    await this.client.ping();
  }

  generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createRoom(peerId, nickname) {
    let roomCode;
    let attempts = 0;
    
    do {
      roomCode = this.generateRoomCode();
      attempts++;
      if (attempts > 100) {
        throw new Error('Failed to generate unique room code');
      }
    } while (await this.client.exists(`room:${roomCode}`));

    const roomData = {
      hostId: peerId,
      hostNickname: nickname,
      members: JSON.stringify([{ peerId, nickname }]),
      createdAt: Date.now(),
    };

    await this.client.hset(`room:${roomCode}`, roomData);
    await this.client.expire(`room:${roomCode}`, 3600);

    await this.client.sadd(`peer:${peerId}:rooms`, roomCode);
    await this.client.hset(`peer:${peerId}`, 'room', roomCode);

    return roomCode;
  }

  async joinRoom(roomCode, peerId, nickname) {
    const roomExists = await this.client.exists(`room:${roomCode}`);
    if (!roomExists) {
      return { success: false, error: 'Room not found' };
    }

    const roomData = await this.client.hgetall(`room:${roomCode}`);
    let members = JSON.parse(roomData.members || '[]');

    const existingMember = members.find(m => m.peerId === peerId);
    if (!existingMember) {
      members.push({ peerId, nickname });
    }

    await this.client.hset(`room:${roomCode}`, 'members', JSON.stringify(members));
    await this.client.expire(`room:${roomCode}`, 3600);

    await this.client.sadd(`peer:${peerId}:rooms`, roomCode);
    await this.client.hset(`peer:${peerId}`, 'room', roomCode);

    return {
      success: true,
      hostId: roomData.hostId,
      hostNickname: roomData.hostNickname,
      members,
    };
  }

  async leaveRoom(roomCode, peerId) {
    const roomData = await this.client.hgetall(`room:${roomCode}`);
    if (!roomData || !roomData.members) {
      return;
    }

    let members = JSON.parse(roomData.members);
    members = members.filter(m => m.peerId !== peerId);

    if (members.length === 0) {
      await this.client.del(`room:${roomCode}`);
    } else {
      await this.client.hset(`room:${roomCode}`, 'members', JSON.stringify(members));
    }

    await this.client.srem(`peer:${peerId}:rooms`, roomCode);
  }

  async getRoomMembers(roomCode) {
    const roomData = await this.client.hgetall(`room:${roomCode}`);
    if (!roomData || !roomData.members) {
      return [];
    }
    return JSON.parse(roomData.members);
  }

  async sendSignalingOffer(fromPeerId, toPeerId, roomCode, sdp) {
    const signalData = JSON.stringify({
      type: 'offer',
      fromPeerId,
      toPeerId,
      sdp,
      timestamp: Date.now(),
    });
    await this.client.publish(`signal:${toPeerId}`, signalData);
  }

  async sendSignalingAnswer(fromPeerId, toPeerId, roomCode, sdp) {
    const signalData = JSON.stringify({
      type: 'answer',
      fromPeerId,
      toPeerId,
      sdp,
      timestamp: Date.now(),
    });
    await this.client.publish(`signal:${toPeerId}`, signalData);
  }

  async sendIceCandidate(fromPeerId, toPeerId, roomCode, candidate, sdpMid, sdpMLineIndex) {
    const signalData = JSON.stringify({
      type: 'ice-candidate',
      fromPeerId,
      toPeerId,
      candidate,
      sdpMid,
      sdpMLineIndex,
      timestamp: Date.now(),
    });
    await this.client.publish(`signal:${toPeerId}`, signalData);
  }

  subscribeToPeer(peerId, callback) {
    const channel = `signal:${peerId}`;
    
    if (this.subscriptions.has(peerId)) {
      return;
    }

    const handler = (ch, message) => {
      if (ch === channel) {
        callback(channel, JSON.parse(message));
      }
    };

    this.subscriber.subscribe(channel);
    this.subscriber.on('message', handler);
    this.subscriptions.set(peerId, handler);
  }

  unsubscribeFromPeer(peerId) {
    const channel = `signal:${peerId}`;
    const handler = this.subscriptions.get(peerId);
    
    if (handler) {
      this.subscriber.unsubscribe(channel);
      this.subscriber.removeListener('message', handler);
      this.subscriptions.delete(peerId);
    }
  }
  
  // 位置数据中转 - 发布位置到房间
  async publishLocationUpdate(roomCode, locationData) {
    const channel = `room:${roomCode}:locations`;
    try {
      await this.client.publish(channel, JSON.stringify(locationData));
      log.debug(`Location published to ${channel}:`, locationData.peerId);
      
      // 同时缓存位置到 Redis（TTL 30秒）
      const cacheKey = `room:${roomCode}:peer:${locationData.peerId}:location`;
      await this.client.setex(cacheKey, 30, JSON.stringify(locationData));
    } catch (error) {
      log.error('Failed to publish location:', error);
    }
  }
  
  // 位置数据中转 - 订阅房间位置
  subscribeToRoomLocations(roomCode, callback) {
    const channel = `room:${roomCode}:locations`;
    
    if (this.locationSubscriptions.has(channel)) {
      log.warn(`Already subscribed to ${channel}`);
      return;
    }
    
    const handler = (ch, message) => {
      if (ch === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          log.error('Failed to parse location message:', error);
        }
      }
    };
    
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', handler);
    this.locationSubscriptions.set(channel, handler);
    log.info(`Subscribed to room location updates: ${channel}`);
  }
  
  // 取消订阅房间位置
  unsubscribeFromRoomLocations(roomCode) {
    const channel = `room:${roomCode}:locations`;
    const handler = this.locationSubscriptions.get(channel);
    
    if (handler) {
      this.subscriber.unsubscribe(channel);
      this.subscriber.removeListener('message', handler);
      this.locationSubscriptions.delete(channel);
      log.info(`Unsubscribed from room location updates: ${channel}`);
    }
  }
  
  // 获取房间内所有成员的最新位置（用于重连后的状态恢复）
  async getRoomLocations(roomCode) {
    const pattern = `room:${roomCode}:peer:*:location`;
    const keys = await this.client.keys(pattern);
    
    if (keys.length === 0) {
      return [];
    }
    
    const locationPromises = keys.map(key => this.client.get(key));
    const locationStrings = await Promise.all(locationPromises);
    
    return locationStrings
      .filter(str => str !== null)
      .map(str => JSON.parse(str));
  }

  async disconnect() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    if (this.client) {
      await this.client.quit();
    }
    log.info('Redis clients disconnected');
  }
}

module.exports = RedisClient;

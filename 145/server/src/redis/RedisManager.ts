import Redis from 'ioredis';
import { Room, GameState, Player } from '../types';

export class RedisManager {
  private redis: Redis;
  private readonly ROOM_PREFIX = 'jungle_chess:room:';
  private readonly MATCH_QUEUE_KEY = 'jungle_chess:match_queue';
  private readonly PLAYER_PREFIX = 'jungle_chess:player:';

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  async saveRoom(room: Room): Promise<void> {
    const key = `${this.ROOM_PREFIX}${room.id}`;
    const data = {
      id: room.id,
      gameState: JSON.stringify(room.gameState),
      isFull: room.isFull,
      isStarted: room.isStarted,
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
      players: JSON.stringify(
        Array.from(room.players.entries()).map(([num, info]) => ({
          playerNumber: num,
          id: info.id,
          name: info.name,
          isConnected: info.isConnected,
          isReconnecting: info.isReconnecting
        }))
      )
    };

    await this.redis.hmset(key, data);
    await this.redis.expire(key, 3600);
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const key = `${this.ROOM_PREFIX}${roomId}`;
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    const gameState: GameState = JSON.parse(data.gameState);
    const playersData = JSON.parse(data.players);

    const players = new Map<Player, {
      id: string;
      name: string;
      ws: WebSocket | null;
      isConnected: boolean;
      isReconnecting: boolean;
      lastHeartbeat: number;
    }>();

    playersData.forEach((p: any) => {
      players.set(p.playerNumber, {
        id: p.id,
        name: p.name,
        ws: null,
        isConnected: p.isConnected,
        isReconnecting: p.isReconnecting,
        lastHeartbeat: Date.now()
      });
    });

    return {
      id: data.id,
      players,
      spectators: new Map(),
      gameState,
      isFull: data.isFull === 'true',
      isStarted: data.isStarted === 'true',
      createdAt: parseInt(data.createdAt),
      lastActivityAt: parseInt(data.lastActivityAt)
    };
  }

  async deleteRoom(roomId: string): Promise<void> {
    const key = `${this.ROOM_PREFIX}${roomId}`;
    await this.redis.del(key);
  }

  async addToMatchQueue(playerId: string, playerName: string): Promise<void> {
    const member = JSON.stringify({ playerId, playerName, requestedAt: Date.now() });
    await this.redis.zadd(this.MATCH_QUEUE_KEY, Date.now(), member);
  }

  async removeFromMatchQueue(playerId: string): Promise<void> {
    const members = await this.redis.zrange(this.MATCH_QUEUE_KEY, 0, -1);

    for (const member of members) {
      const data = JSON.parse(member);
      if (data.playerId === playerId) {
        await this.redis.zrem(this.MATCH_QUEUE_KEY, member);
        break;
      }
    }
  }

  async getMatchQueue(): Promise<{ playerId: string; playerName: string; requestedAt: number }[]> {
    const members = await this.redis.zrange(this.MATCH_QUEUE_KEY, 0, -1);
    return members.map(m => JSON.parse(m));
  }

  async savePlayerSession(playerId: string, roomId: string, playerNumber: Player): Promise<void> {
    const key = `${this.PLAYER_PREFIX}${playerId}`;
    await this.redis.hmset(key, {
      roomId,
      playerNumber: playerNumber.toString(),
      lastActive: Date.now().toString()
    });
    await this.redis.expire(key, 86400);
  }

  async getPlayerSession(playerId: string): Promise<{ roomId: string; playerNumber: Player } | null> {
    const key = `${this.PLAYER_PREFIX}${playerId}`;
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      roomId: data.roomId,
      playerNumber: parseInt(data.playerNumber) as Player
    };
  }

  async deletePlayerSession(playerId: string): Promise<void> {
    const key = `${this.PLAYER_PREFIX}${playerId}`;
    await this.redis.del(key);
  }

  async getActiveRooms(): Promise<string[]> {
    const keys = await this.redis.keys(`${this.ROOM_PREFIX}*`);
    return keys.map(k => k.replace(this.ROOM_PREFIX, ''));
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  getClient(): Redis {
    return this.redis;
  }
}

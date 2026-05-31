import { MatchRequest, MatchResult, Room, Player } from '../types';
import { RoomManager } from '../rooms/RoomManager';

export class Matchmaking {
  private queue: MatchRequest[];
  private roomManager: RoomManager;
  private readonly MATCH_TIMEOUT = 30000;
  private readonly QUEUE_CHECK_INTERVAL = 1000;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(roomManager: RoomManager) {
    this.queue = [];
    this.roomManager = roomManager;
  }

  start(): void {
    if (this.intervalTimer) return;

    this.intervalTimer = setInterval(() => {
      this.processQueue();
    }, this.QUEUE_CHECK_INTERVAL);
  }

  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  addToQueue(request: MatchRequest): void {
    const existingIndex = this.queue.findIndex(r => r.playerId === request.playerId);
    if (existingIndex >= 0) {
      this.queue[existingIndex] = request;
      return;
    }

    this.queue.push(request);
  }

  removeFromQueue(playerId: string): void {
    const index = this.queue.findIndex(r => r.playerId === playerId);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  getQueuePosition(playerId: string): number {
    const index = this.queue.findIndex(r => r.playerId === playerId);
    return index >= 0 ? index + 1 : -1;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  private processQueue(): void {
    const now = Date.now();

    this.queue = this.queue.filter(r => now - r.requestedAt < this.MATCH_TIMEOUT);

    while (this.queue.length >= 2) {
      const player1 = this.queue.shift()!;
      const player2 = this.queue.shift()!;

      this.createMatch(player1, player2);
    }
  }

  private createMatch(player1: MatchRequest, player2: MatchRequest): Room {
    const room = this.roomManager.createRoom();

    this.roomManager.addPlayer(room.id, {
      id: player1.playerId,
      name: player1.playerName,
      ws: null,
      isConnected: false,
      isReconnecting: false,
      lastHeartbeat: Date.now()
    });

    this.roomManager.addPlayer(room.id, {
      id: player2.playerId,
      name: player2.playerName,
      ws: null,
      isConnected: false,
      isReconnecting: false,
      lastHeartbeat: Date.now()
    });

    return room;
  }

  getMatchResult(playerId: string): MatchResult | null {
    const room = this.roomManager.getRoomByPlayerId(playerId);
    if (!room) return null;

    const playerNumber = this.roomManager.getPlayerNumber(room.id, playerId);
    if (playerNumber === Player.NONE) return null;

    return {
      success: true,
      roomId: room.id,
      playerNumber,
      message: '匹配成功'
    };
  }
}

import { Room, Player, PlayerInfo, GameState } from '../types';
import { Game } from '../game/Game';
import { v4 as uuidv4 } from 'uuid';

export class RoomManager {
  private rooms: Map<string, Room>;
  private playerToRoom: Map<string, string>;

  constructor() {
    this.rooms = new Map();
    this.playerToRoom = new Map();
  }

  createRoom(): Room {
    const roomId = uuidv4();
    const game = new Game();

    const room: Room = {
      id: roomId,
      players: new Map(),
      spectators: new Map(),
      gameState: game.getState(),
      isFull: false,
      isStarted: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    this.rooms.set(roomId, room);
    return room;
  }

  addPlayer(roomId: string, playerInfo: PlayerInfo): Player | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (room.players.size >= 2) return null;

    const playerNumber = room.players.size === 0 ? Player.PLAYER1 : Player.PLAYER2;
    room.players.set(playerNumber, playerInfo);
    this.playerToRoom.set(playerInfo.id, roomId);

    if (room.players.size === 2) {
      room.isFull = true;
      room.isStarted = true;
    }

    room.lastActivityAt = Date.now();
    return playerNumber;
  }

  removePlayer(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [playerNum, info] of room.players) {
      if (info.id === playerId) {
        room.players.delete(playerNum);
        break;
      }
    }

    this.playerToRoom.delete(playerId);
    room.isFull = room.players.size === 2;
    room.lastActivityAt = Date.now();

    if (room.players.size === 0 && room.spectators.size === 0) {
      this.cleanupRoom(roomId);
    }
  }

  addSpectator(roomId: string, spectatorInfo: PlayerInfo): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.spectators.set(spectatorInfo.id, spectatorInfo);
    this.playerToRoom.set(spectatorInfo.id, roomId);
    room.lastActivityAt = Date.now();
    return true;
  }

  removeSpectator(roomId: string, spectatorId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.spectators.delete(spectatorId);
    this.playerToRoom.delete(spectatorId);
    room.lastActivityAt = Date.now();
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) || null;
  }

  getRoomByPlayerId(playerId: string): Room | null {
    const roomId = this.playerToRoom.get(playerId);
    return roomId ? this.rooms.get(roomId) || null : null;
  }

  getPlayerNumber(roomId: string, playerId: string): Player {
    const room = this.rooms.get(roomId);
    if (!room) return Player.NONE;

    for (const [playerNum, info] of room.players) {
      if (info.id === playerId) {
        return playerNum;
      }
    }

    return Player.NONE;
  }

  updatePlayerConnection(roomId: string, playerId: string, ws: WebSocket | null, isConnected: boolean): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [playerNum, info] of room.players) {
      if (info.id === playerId) {
        info.ws = ws;
        info.isConnected = isConnected;
        info.lastHeartbeat = Date.now();
        if (isConnected) {
          info.isReconnecting = false;
        }
        break;
      }
    }

    for (const [specId, info] of room.spectators) {
      if (specId === playerId) {
        info.ws = ws;
        info.isConnected = isConnected;
        info.lastHeartbeat = Date.now();
        break;
      }
    }
  }

  setPlayerReconnecting(roomId: string, playerId: string, isReconnecting: boolean): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [playerNum, info] of room.players) {
      if (info.id === playerId) {
        info.isReconnecting = isReconnecting;
        break;
      }
    }
  }

  updateGameState(roomId: string, gameState: GameState): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.gameState = gameState;
    room.lastActivityAt = Date.now();
  }

  getActiveRooms(): Room[] {
    return Array.from(this.rooms.values()).filter(r => r.isStarted && !r.gameState.isGameOver);
  }

  getSpectatableRooms(): Room[] {
    return this.getActiveRooms().filter(r => r.isFull);
  }

  private cleanupRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [, info] of room.players) {
      this.playerToRoom.delete(info.id);
    }
    for (const [specId] of room.spectators) {
      this.playerToRoom.delete(specId);
    }

    this.rooms.delete(roomId);
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}

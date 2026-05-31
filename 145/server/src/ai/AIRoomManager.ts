import { Game } from '../game/Game';
import { AIManager, AIDifficulty, AI_CONFIG } from './AIManager';
import { Player, PlayerInfo, GameState, Move } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface AIRoom {
  id: string;
  game: Game;
  aiManager: AIManager;
  player: PlayerInfo;
  aiPlayer: Player;
  humanPlayer: Player;
  isGameOver: boolean;
  onMoveCallback?: (gameState: GameState) => void;
  onGameOverCallback?: (winner: Player) => void;
}

export class AIRoomManager {
  private rooms: Map<string, AIRoom>;
  private playerToRoom: Map<string, string>;

  constructor() {
    this.rooms = new Map();
    this.playerToRoom = new Map();
  }

  createAIRoom(
    playerInfo: PlayerInfo,
    difficulty: AIDifficulty
  ): AIRoom {
    const roomId = uuidv4();
    const game = new Game();
    const humanPlayer = Player.PLAYER1;
    const aiPlayer = Player.PLAYER2;

    const aiManager = new AIManager(aiPlayer, difficulty);

    const room: AIRoom = {
      id: roomId,
      game,
      aiManager,
      player: playerInfo,
      aiPlayer,
      humanPlayer,
      isGameOver: false
    };

    this.rooms.set(roomId, room);
    this.playerToRoom.set(playerInfo.id, roomId);

    return room;
  }

  async makeHumanMove(
    roomId: string,
    playerId: string,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): Promise<{ success: boolean; error?: string; gameState?: GameState }> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.player.id !== playerId) {
      return { success: false, error: '你不在这个房间' };
    }

    if (room.isGameOver) {
      return { success: false, error: '游戏已结束' };
    }

    const result = room.game.makeMove(room.humanPlayer, from, to);

    if (!result.success) {
      return result;
    }

    const gameState = room.game.getState();

    if (gameState.isGameOver) {
      room.isGameOver = true;
      if (room.onGameOverCallback) {
        room.onGameOverCallback(gameState.winner);
      }
      return { success: true, gameState };
    }

    if (room.onMoveCallback) {
      room.onMoveCallback(gameState);
    }

    return { success: true, gameState };
  }

  async makeAIMove(roomId: string): Promise<GameState | null> {
    const room = this.rooms.get(roomId);
    if (!room || room.isGameOver) return null;

    const currentPlayer = room.game.getCurrentPlayer();
    if (currentPlayer !== room.aiPlayer) return null;

    const gameState = room.game.getState();

    const move = room.aiManager.calculateMoveSync(gameState);

    if (move) {
      const result = room.game.makeMove(room.aiPlayer, move.from, move.to);

      if (result.success) {
        const newState = room.game.getState();

        if (newState.isGameOver) {
          room.isGameOver = true;
          if (room.onGameOverCallback) {
            room.onGameOverCallback(newState.winner);
          }
        }

        if (room.onMoveCallback) {
          room.onMoveCallback(newState);
        }

        return newState;
      }
    }

    return null;
  }

  getRoom(roomId: string): AIRoom | null {
    return this.rooms.get(roomId) || null;
  }

  getRoomByPlayerId(playerId: string): AIRoom | null {
    const roomId = this.playerToRoom.get(playerId);
    return roomId ? this.rooms.get(roomId) || null : null;
  }

  getGameState(roomId: string): GameState | null {
    const room = this.rooms.get(roomId);
    return room ? room.game.getState() : null;
  }

  setOnMoveCallback(roomId: string, callback: (gameState: GameState) => void): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.onMoveCallback = callback;
    }
  }

  setOnGameOverCallback(roomId: string, callback: (winner: Player) => void): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.onGameOverCallback = callback;
    }
  }

  removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      this.playerToRoom.delete(room.player.id);
      this.rooms.delete(roomId);
    }
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  isAIGame(roomId: string): boolean {
    return this.rooms.has(roomId);
  }
}

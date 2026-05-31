import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import {
  WSMessage, WSMessageType, Player, PlayerInfo, Position, Room,
  MoveRequest, ReconnectRequest, GameState
} from '../types';
import { RoomManager } from '../rooms/RoomManager';
import { Matchmaking } from '../matchmaking/Matchmaking';
import { Game } from '../game/Game';
import { RedisManager } from '../redis/RedisManager';
import { AIRoomManager } from '../ai/AIRoomManager';
import { AIDifficulty, AI_CONFIG } from '../ai/AIManager';
import { v4 as uuidv4 } from 'uuid';

export class GameServer {
  private wss: WebSocketServer;
  private roomManager: RoomManager;
  private matchmaking: Matchmaking;
  private redisManager: RedisManager;
  private aiRoomManager: AIRoomManager;
  private games: Map<string, Game>;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private readonly RECONNECT_TIMEOUT = 10000;

  constructor(server: Server, redisUrl?: string) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.roomManager = new RoomManager();
    this.matchmaking = new Matchmaking(this.roomManager);
    this.redisManager = new RedisManager(redisUrl);
    this.aiRoomManager = new AIRoomManager();
    this.games = new Map();

    this.matchmaking.start();
    this.setupConnectionHandler();
    this.setupHeartbeat();
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const playerId = this.getPlayerIdFromRequest(req);

      console.log(`Player connected: ${playerId}`);

      this.sendToClient(ws, {
        type: 'connected',
        data: { playerId },
        timestamp: Date.now()
      });

      ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(ws, playerId, data);
      });

      ws.on('close', () => {
        this.handleDisconnect(playerId);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error for player ${playerId}:`, err);
      });
    });
  }

  private getPlayerIdFromRequest(req: any): string {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('playerId') || uuidv4();
  }

  private handleMessage(ws: WebSocket, playerId: string, data: WebSocket.Data): void {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'match_request':
          this.handleMatchRequest(ws, playerId, message.data);
          break;
        case 'match_cancel':
          this.handleMatchCancel(playerId);
          break;
        case 'move':
          this.handleMove(ws, playerId, message.data);
          break;
        case 'reconnect_request':
          this.handleReconnect(ws, playerId, message.data);
          break;
        case 'spectate_enter':
          this.handleSpectateEnter(ws, playerId, message.data);
          break;
        case 'spectate_leave':
          this.handleSpectateLeave(playerId);
          break;
        case 'spectate_list':
          this.handleSpectateList(ws);
          break;
        case 'chat':
          this.handleChat(playerId, message.data);
          break;
        case 'heartbeat':
          this.handleHeartbeat(playerId);
          break;
        case 'ai_match_request':
          this.handleAIMatchRequest(ws, playerId, message.data);
          break;
        case 'ai_move':
          this.handleAIMove(ws, playerId, message.data);
          break;
        case 'ai_leave':
          this.handleAILeave(playerId);
          break;
        default:
          this.sendToClient(ws, {
            type: 'error',
            data: { message: 'Unknown message type' },
            timestamp: Date.now()
          });
      }
    } catch (err) {
      console.error('Error handling message:', err);
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: Date.now()
      });
    }
  }

  private handleMatchRequest(ws: WebSocket, playerId: string, data: any): void {
    const playerName = data.playerName || `Player_${playerId.slice(0, 8)}`;

    const existingRoom = this.roomManager.getRoomByPlayerId(playerId);
    if (existingRoom) {
      const playerNumber = this.roomManager.getPlayerNumber(existingRoom.id, playerId);
      this.sendToClient(ws, {
        type: 'match_success',
        data: {
          roomId: existingRoom.id,
          playerNumber,
          gameState: existingRoom.gameState
        },
        timestamp: Date.now()
      });
      this.attachPlayerToRoom(existingRoom.id, playerId, playerName, ws);
      return;
    }

    this.matchmaking.addToQueue({
      playerId,
      playerName,
      requestedAt: Date.now()
    });

    this.redisManager.addToMatchQueue(playerId, playerName);

    this.sendToClient(ws, {
      type: 'match_request',
      data: {
        queuePosition: this.matchmaking.getQueuePosition(playerId),
        queueSize: this.matchmaking.getQueueSize()
      },
      timestamp: Date.now()
    });

    this.checkMatchResult(playerId);
  }

  private checkMatchResult(playerId: string): void {
    setTimeout(() => {
      const result = this.matchmaking.getMatchResult(playerId);
      if (result) {
        const room = this.roomManager.getRoom(result.roomId);
        if (room) {
          const game = new Game();
          this.games.set(room.id, game);

          room.players.forEach((info, num) => {
            if (info.ws) {
              this.sendToClient(info.ws, {
                type: 'match_success',
                data: {
                  roomId: room.id,
                  playerNumber: num,
                  gameState: game.getState()
                },
                timestamp: Date.now()
              });
            }
          });

          this.redisManager.saveRoom(room);
        }
      } else {
        this.checkMatchResult(playerId);
      }
    }, 500);
  }

  private handleMatchCancel(playerId: string): void {
    this.matchmaking.removeFromQueue(playerId);
    this.redisManager.removeFromMatchQueue(playerId);
  }

  private handleMove(ws: WebSocket, playerId: string, data: MoveRequest): void {
    const room = this.roomManager.getRoom(data.roomId);
    if (!room) {
      this.sendToClient(ws, {
        type: 'move_result',
        data: { success: false, error: '房间不存在' },
        timestamp: Date.now()
      });
      return;
    }

    const playerNumber = this.roomManager.getPlayerNumber(data.roomId, playerId);
    if (playerNumber === Player.NONE) {
      this.sendToClient(ws, {
        type: 'move_result',
        data: { success: false, error: '你不在这个房间' },
        timestamp: Date.now()
      });
      return;
    }

    const game = this.games.get(data.roomId);
    if (!game) {
      this.sendToClient(ws, {
        type: 'move_result',
        data: { success: false, error: '游戏未开始' },
        timestamp: Date.now()
      });
      return;
    }

    const result = game.makeMove(playerNumber, data.from, data.to);

    if (result.success) {
      const gameState = game.getState();
      this.roomManager.updateGameState(data.roomId, gameState);
      this.redisManager.saveRoom(room);

      const message: WSMessage = {
        type: 'game_state',
        data: gameState,
        timestamp: Date.now()
      };

      this.broadcastToRoom(data.roomId, message);

      if (gameState.isGameOver) {
        this.broadcastToRoom(data.roomId, {
          type: 'game_over',
          data: { winner: gameState.winner },
          timestamp: Date.now()
        });
      }
    } else {
      this.sendToClient(ws, {
        type: 'move_result',
        data: result,
        timestamp: Date.now()
      });
    }
  }

  private handleReconnect(ws: WebSocket, playerId: string, data: ReconnectRequest): void {
    const room = this.roomManager.getRoom(data.roomId);
    if (!room) {
      this.sendToClient(ws, {
        type: 'reconnect_failed',
        data: { error: '房间不存在' },
        timestamp: Date.now()
      });
      return;
    }

    const playerNumber = this.roomManager.getPlayerNumber(data.roomId, playerId);
    if (playerNumber === Player.NONE) {
      this.sendToClient(ws, {
        type: 'reconnect_failed',
        data: { error: '你不在这个房间' },
        timestamp: Date.now()
      });
      return;
    }

    this.roomManager.updatePlayerConnection(data.roomId, playerId, ws, true);

    this.sendToClient(ws, {
      type: 'reconnect_success',
      data: {
        gameState: room.gameState,
        playerNumber
      },
      timestamp: Date.now()
    });

    this.broadcastToRoom(data.roomId, {
      type: 'player_reconnected',
      data: { playerId, playerNumber },
      timestamp: Date.now()
    }, playerId);
  }

  private handleSpectateEnter(ws: WebSocket, playerId: string, data: { roomId: string; playerName: string }): void {
    const room = this.roomManager.getRoom(data.roomId);
    if (!room) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: '房间不存在' },
        timestamp: Date.now()
      });
      return;
    }

    const spectatorInfo: PlayerInfo = {
      id: playerId,
      name: data.playerName || `Spectator_${playerId.slice(0, 8)}`,
      ws,
      isConnected: true,
      isReconnecting: false,
      lastHeartbeat: Date.now()
    };

    this.roomManager.addSpectator(data.roomId, spectatorInfo);

    this.sendToClient(ws, {
      type: 'spectate_enter',
      data: {
        roomId: data.roomId,
        gameState: room.gameState,
        players: Array.from(room.players.entries()).map(([num, info]) => ({
          playerNumber: num,
          name: info.name
        }))
      },
      timestamp: Date.now()
    });

    this.broadcastToRoom(data.roomId, {
      type: 'spectator_joined',
      data: { spectatorId: playerId, spectatorName: spectatorInfo.name },
      timestamp: Date.now()
    });
  }

  private handleSpectateLeave(playerId: string): void {
    const room = this.roomManager.getRoomByPlayerId(playerId);
    if (room) {
      this.roomManager.removeSpectator(room.id, playerId);

      this.broadcastToRoom(room.id, {
        type: 'spectator_left',
        data: { spectatorId: playerId },
        timestamp: Date.now()
      });
    }
  }

  private handleSpectateList(ws: WebSocket): void {
    const rooms = this.roomManager.getSpectatableRooms();
    const roomList = rooms.map(room => ({
      id: room.id,
      players: Array.from(room.players.entries()).map(([num, info]) => ({
        playerNumber: num,
        name: info.name
      })),
      turnCount: room.gameState.turnCount
    }));

    this.sendToClient(ws, {
      type: 'spectate_list',
      data: { rooms: roomList },
      timestamp: Date.now()
    });
  }

  private handleChat(playerId: string, data: { roomId: string; message: string }): void {
    const room = this.roomManager.getRoom(data.roomId);
    if (!room) return;

    const playerNumber = this.roomManager.getPlayerNumber(data.roomId, playerId);
    const spectatorInfo = room.spectators.get(playerId);

    const senderName = playerNumber !== Player.NONE
      ? `玩家${playerNumber}`
      : spectatorInfo?.name || 'Unknown';

    this.broadcastToRoom(data.roomId, {
      type: 'chat',
      data: {
        senderId: playerId,
        senderName,
        message: data.message,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  }

  private handleHeartbeat(playerId: string): void {
    const room = this.roomManager.getRoomByPlayerId(playerId);
    if (room) {
      this.roomManager.updatePlayerConnection(room.id, playerId, null, true);
    }
  }

  private handleDisconnect(playerId: string): void {
    console.log(`Player disconnected: ${playerId}`);

    this.matchmaking.removeFromQueue(playerId);
    this.redisManager.removeFromMatchQueue(playerId);

    const room = this.roomManager.getRoomByPlayerId(playerId);
    if (!room) return;

    const playerNumber = this.roomManager.getPlayerNumber(room.id, playerId);

    if (playerNumber !== Player.NONE && room.isStarted && !room.gameState.isGameOver) {
      this.roomManager.setPlayerReconnecting(room.id, playerId, true);
      this.roomManager.updatePlayerConnection(room.id, playerId, null, false);

      this.broadcastToRoom(room.id, {
        type: 'player_disconnected',
        data: { playerId, playerNumber },
        timestamp: Date.now()
      }, playerId);

      setTimeout(() => {
        const currentRoom = this.roomManager.getRoom(room.id);
        if (currentRoom) {
          const playerInfo = currentRoom.players.get(playerNumber);
          if (playerInfo && !playerInfo.isConnected) {
            this.roomManager.removePlayer(room.id, playerId);

            this.broadcastToRoom(room.id, {
              type: 'game_over',
              data: {
                winner: playerNumber === Player.PLAYER1 ? Player.PLAYER2 : Player.PLAYER1,
                reason: '对手掉线'
              },
              timestamp: Date.now()
            });

            this.redisManager.deleteRoom(room.id);
          }
        }
      }, this.RECONNECT_TIMEOUT);
    } else {
      this.roomManager.removePlayer(room.id, playerId);
      this.roomManager.removeSpectator(room.id, playerId);
    }
  }

  private attachPlayerToRoom(roomId: string, playerId: string, playerName: string, ws: WebSocket): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    const playerNumber = this.roomManager.getPlayerNumber(roomId, playerId);
    if (playerNumber === Player.NONE) return;

    this.roomManager.updatePlayerConnection(roomId, playerId, ws, true);

    const game = this.games.get(roomId);
    if (game) {
      this.sendToClient(ws, {
        type: 'game_state',
        data: game.getState(),
        timestamp: Date.now()
      });
    }
  }

  private sendToClient(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToRoom(roomId: string, message: WSMessage, excludePlayerId?: string): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    room.players.forEach((info) => {
      if (info.id !== excludePlayerId && info.ws && info.ws.readyState === WebSocket.OPEN) {
        info.ws.send(JSON.stringify(message));
      }
    });

    room.spectators.forEach((info) => {
      if (info.id !== excludePlayerId && info.ws && info.ws.readyState === WebSocket.OPEN) {
        info.ws.send(JSON.stringify(message));
      }
    });
  }

  private setupHeartbeat(): void {
    setInterval(() => {
      const now = Date.now();

      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'ping',
            timestamp: now
          }));
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  getRoomManager(): RoomManager {
    return this.roomManager;
  }

  getMatchmaking(): Matchmaking {
    return this.matchmaking;
  }

  private handleAIMatchRequest(ws: WebSocket, playerId: string, data: any): void {
    const playerName = data.playerName || `Player_${playerId.slice(0, 8)}`;
    const difficulty = (data.difficulty || 'easy') as AIDifficulty;

    const existingRoom = this.aiRoomManager.getRoomByPlayerId(playerId);
    if (existingRoom) {
      this.sendToClient(ws, {
        type: 'ai_match_success',
        data: {
          roomId: existingRoom.id,
          playerNumber: existingRoom.humanPlayer,
          aiPlayer: existingRoom.aiPlayer,
          aiName: existingRoom.aiManager.getAIName(),
          difficulty: existingRoom.aiManager.getDifficulty(),
          gameState: existingRoom.game.getState()
        },
        timestamp: Date.now()
      });
      existingRoom.player.ws = ws;
      existingRoom.player.isConnected = true;
      return;
    }

    const playerInfo: PlayerInfo = {
      id: playerId,
      name: playerName,
      ws,
      isConnected: true,
      isReconnecting: false,
      lastHeartbeat: Date.now()
    };

    const aiRoom = this.aiRoomManager.createAIRoom(playerInfo, difficulty);

    aiRoom.setOnMoveCallback((gameState) => {
      this.sendToClient(ws, {
        type: 'game_state',
        data: gameState,
        timestamp: Date.now()
      });
    });

    aiRoom.setOnGameOverCallback((winner) => {
      this.sendToClient(ws, {
        type: 'game_over',
        data: { winner },
        timestamp: Date.now()
      });
    });

    this.sendToClient(ws, {
      type: 'ai_match_success',
      data: {
        roomId: aiRoom.id,
        playerNumber: aiRoom.humanPlayer,
        aiPlayer: aiRoom.aiPlayer,
        aiName: aiRoom.aiManager.getAIName(),
        difficulty: aiRoom.aiManager.getDifficulty(),
        gameState: aiRoom.game.getState()
      },
      timestamp: Date.now()
    });

    console.log(`AI match created: room=${aiRoom.id}, difficulty=${difficulty}`);
  }

  private async handleAIMove(ws: WebSocket, playerId: string, data: MoveRequest): Promise<void> {
    const room = this.aiRoomManager.getRoom(data.roomId);
    if (!room) {
      this.sendToClient(ws, {
        type: 'move_result',
        data: { success: false, error: '房间不存在' },
        timestamp: Date.now()
      });
      return;
    }

    if (room.player.id !== playerId) {
      this.sendToClient(ws, {
        type: 'move_result',
        data: { success: false, error: '你不在这个房间' },
        timestamp: Date.now()
      });
      return;
    }

    const result = await this.aiRoomManager.makeHumanMove(
      data.roomId,
      playerId,
      data.from,
      data.to
    );

    if (!result.success) {
      this.sendToClient(ws, {
        type: 'move_result',
        data: result,
        timestamp: Date.now()
      });
      return;
    }

    if (result.gameState) {
      this.sendToClient(ws, {
        type: 'game_state',
        data: result.gameState,
        timestamp: Date.now()
      });

      if (result.gameState.isGameOver) {
        return;
      }
    }

    setTimeout(async () => {
      const aiGameState = await this.aiRoomManager.makeAIMove(data.roomId);

      if (aiGameState) {
        this.sendToClient(ws, {
          type: 'game_state',
          data: aiGameState,
          timestamp: Date.now()
        });

        if (aiGameState.isGameOver) {
          this.sendToClient(ws, {
            type: 'game_over',
            data: { winner: aiGameState.winner },
            timestamp: Date.now()
          });
        }
      }
    }, 500);
  }

  private handleAILeave(playerId: string): void {
    const room = this.aiRoomManager.getRoomByPlayerId(playerId);
    if (room) {
      this.aiRoomManager.removeRoom(room.id);
      console.log(`AI room removed: ${room.id}`);
    }
  }

  close(): void {
    this.matchmaking.stop();
    this.redisManager.close();
    this.wss.close();
  }
}

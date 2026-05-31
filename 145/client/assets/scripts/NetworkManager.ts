import { _decorator, Component } from 'cc';
import {
  WSMessage, WSMessageType, MoveRequest, ReconnectRequest,
  GameState, Player
} from './types';

const { ccclass } = _decorator;

export type MessageHandler = (data: any) => void;

@ccclass('NetworkManager')
export class NetworkManager extends Component {
  private ws: WebSocket | null = null;
  private playerId: string = '';
  private roomId: string = '';
  private isConnected: boolean = false;
  private isReconnecting: boolean = false;
  private messageHandlers: Map<WSMessageType, MessageHandler[]> = new Map();
  private serverUrl: string = '';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private heartbeatTimer: number | null = null;
  private readonly HEARTBEAT_INTERVAL = 25000;

  init(serverUrl: string): void {
    this.serverUrl = serverUrl;
    this.playerId = this.loadOrCreatePlayerId();
  }

  private loadOrCreatePlayerId(): string {
    let id = localStorage.getItem('jungle_chess_player_id');
    if (!id) {
      id = this.generatePlayerId();
      localStorage.setItem('jungle_chess_player_id', id);
    }
    return id;
  }

  private generatePlayerId(): string {
    return 'player_' + Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = `${this.serverUrl}?playerId=${this.playerId}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.isReconnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WSMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (err) {
            console.error('Error parsing message:', err);
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
          this.stopHeartbeat();

          if (!this.isReconnecting) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          resolve(false);
        };

      } catch (err) {
        console.error('Connection error:', err);
        resolve(false);
      }
    });
  }

  private handleMessage(message: WSMessage): void {
    if (message.type === 'connected' && message.data) {
      this.playerId = message.data.playerId || this.playerId;
    }

    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message.data);
        } catch (err) {
          console.error('Error in message handler:', err);
        }
      });
    }

    const allHandlers = this.messageHandlers.get('*' as WSMessageType);
    if (allHandlers) {
      allHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (err) {
          console.error('Error in wildcard handler:', err);
        }
      });
    }
  }

  onMessage(type: WSMessageType, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  offMessage(type: WSMessageType, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  sendMessage(type: WSMessageType, data: any = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    const message: WSMessage = {
      type,
      data,
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
  }

  requestMatch(playerName: string): void {
    this.sendMessage('match_request', { playerName });
  }

  cancelMatch(): void {
    this.sendMessage('match_cancel', {});
  }

  makeMove(from: { row: number; col: number }, to: { row: number; col: number }): void {
    const moveRequest: MoveRequest = {
      roomId: this.roomId,
      playerId: this.playerId,
      from,
      to
    };
    this.sendMessage('move', moveRequest);
  }

  requestReconnect(roomId: string): void {
    this.isReconnecting = true;
    this.roomId = roomId;

    const reconnectRequest: ReconnectRequest = {
      roomId,
      playerId: this.playerId
    };
    this.sendMessage('reconnect_request', reconnectRequest);
  }

  enterSpectate(roomId: string, playerName: string): void {
    this.sendMessage('spectate_enter', { roomId, playerName });
  }

  leaveSpectate(): void {
    this.sendMessage('spectate_leave', {});
  }

  requestSpectateList(): void {
    this.sendMessage('spectate_list', {});
  }

  sendChat(message: string): void {
    this.sendMessage('chat', {
      roomId: this.roomId,
      message
    });
  }

  requestAIMatch(playerName: string, difficulty: string): void {
    this.sendMessage('ai_match_request', { playerName, difficulty });
  }

  makeAIMove(from: { row: number; col: number }, to: { row: number; col: number }): void {
    const moveRequest: MoveRequest = {
      roomId: this.roomId,
      playerId: this.playerId,
      from,
      to
    };
    this.sendMessage('ai_move', moveRequest);
  }

  leaveAIGame(): void {
    this.sendMessage('ai_leave', {});
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected) {
        this.sendMessage('heartbeat', {});
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      this.notifyReconnectFailed();
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnect attempt ${this.reconnectAttempts}`);

    setTimeout(async () => {
      const success = await this.connect();
      if (success && this.roomId) {
        this.requestReconnect(this.roomId);
      }
    }, 2000 * this.reconnectAttempts);
  }

  private notifyReconnectFailed(): void {
    const handlers = this.messageHandlers.get('reconnect_failed');
    if (handlers) {
      handlers.forEach(handler => handler({ error: '重连失败' }));
    }
  }

  setRoomId(roomId: string): void {
    this.roomId = roomId;
    localStorage.setItem('jungle_chess_room_id', roomId);
  }

  getRoomId(): string {
    return this.roomId || localStorage.getItem('jungle_chess_room_id') || '';
  }

  getPlayerId(): string {
    return this.playerId;
  }

  isPlayerConnected(): boolean {
    return this.isConnected;
  }

  disconnect(): void {
    this.isReconnecting = true;
    if (this.ws) {
      this.ws.close();
    }
  }

  cleanup(): void {
    this.stopHeartbeat();
    this.messageHandlers.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

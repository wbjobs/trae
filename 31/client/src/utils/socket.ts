import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { User, CursorPosition, WebRTCSignal, ChatMessage, FrozenRange } from '../types';

class SocketManager {
  private socket: Socket | null = null;
  private roomId: string | null = null;
  private ydoc: Y.Doc | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private lamportClock: number = 0;
  private lastCursorPosition: Omit<CursorPosition, 'userId' | 'lamportTime'> | null = null;

  connect(url: string = '/') {
    if (this.socket?.connected) return;
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.emit('connected');
    });

    this.socket.on('disconnect', () => {
      this.emit('disconnected');
    });

    this.socket.on('user-joined', (data: { user: User; users: User[]; yjsState?: Uint8Array }) => {
      if (data.yjsState && this.ydoc) {
        Y.applyUpdate(this.ydoc, data.yjsState, 'server');
      }
      this.emit('user-joined', data);
    });

    this.socket.on('user-left', (data: { userId: string; users: User[] }) => {
      this.emit('user-left', data);
    });

    this.socket.on('cursor-move', (position: CursorPosition) => {
      this.receiveLamportTime(position.lamportTime);
      this.emit('cursor-move', position);
    });

    this.socket.on('cursor-rejected', (data: { received: CursorPosition; resolved: CursorPosition; reason: string }) => {
      this.emit('cursor-rejected', data);
    });

    this.socket.on('freeze-success', (data: { range: FrozenRange }) => {
      this.emit('freeze-success', data);
    });

    this.socket.on('freeze-error', (data: { error: string }) => {
      this.emit('freeze-error', data);
    });

    this.socket.on('unfreeze-success', (data: { rangeId: string }) => {
      this.emit('unfreeze-success', data);
    });

    this.socket.on('unfreeze-error', (data: { error: string }) => {
      this.emit('unfreeze-error', data);
    });

    this.socket.on('range-frozen', (data: { range: FrozenRange }) => {
      this.emit('range-frozen', data);
    });

    this.socket.on('range-unfrozen', (data: { rangeId: string }) => {
      this.emit('range-unfrozen', data);
    });

    this.socket.on('yjs-update', (update: Uint8Array) => {
      if (this.ydoc) {
        Y.applyUpdate(this.ydoc, update, 'remote');
      }
    });

    this.socket.on('webrtc-signal', (signal: WebRTCSignal) => {
      this.emit('webrtc-signal', signal);
    });

    this.socket.on('chat-message', (msg: ChatMessage) => {
      this.emit('chat-message', msg);
    });

    this.socket.on('version-saved', () => {
      this.emit('version-saved');
    });

    this.socket.on('error', (err: any) => {
      this.emit('error', err);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinRoom(roomId: string, userName: string, ydoc: Y.Doc) {
    this.roomId = roomId;
    this.ydoc = ydoc;
    
    ydoc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== 'remote' && origin !== 'server') {
        this.socket?.emit('yjs-update', { roomId, update });
      }
    });

    this.socket?.emit('join-room', { roomId, userName });
  }

  leaveRoom() {
    if (this.roomId) {
      this.socket?.emit('leave-room', { roomId: this.roomId });
      this.roomId = null;
      this.ydoc = null;
    }
  }

  sendCursor(position: Omit<CursorPosition, 'userId' | 'lamportTime'>) {
    if (this.roomId) {
      this.lastCursorPosition = position;
      const lamportTime = this.incrementLamportTime();
      const positionWithTime: Omit<CursorPosition, 'userId'> = {
        ...position,
        lamportTime,
      };
      this.socket?.emit('cursor-move', { roomId: this.roomId, position: positionWithTime });
    }
  }

  private incrementLamportTime(): number {
    this.lamportClock += 1;
    return this.lamportClock;
  }

  private receiveLamportTime(remoteTime: number) {
    this.lamportClock = Math.max(this.lamportClock, remoteTime) + 1;
  }

  getLamportTime(): number {
    return this.lamportClock;
  }

  getLastCursorPosition(): Omit<CursorPosition, 'userId' | 'lamportTime'> | null {
    return this.lastCursorPosition;
  }

  freezeRange(range: Omit<FrozenRange, 'id' | 'lockedAt' | 'lockedBy' | 'lockedByName'>) {
    if (this.roomId) {
      this.socket?.emit('freeze-range', { roomId: this.roomId, range });
    }
  }

  unfreezeRange(rangeId: string) {
    if (this.roomId) {
      this.socket?.emit('unfreeze-range', { roomId: this.roomId, rangeId });
    }
  }

  sendSignal(signal: Omit<WebRTCSignal, 'from'>) {
    if (this.roomId) {
      this.socket?.emit('webrtc-signal', { roomId: this.roomId, signal });
    }
  }

  sendChatMessage(message: string, userName: string) {
    if (this.roomId) {
      this.socket?.emit('chat-message', { roomId: this.roomId, message, userName });
    }
  }

  saveVersion(userId: string) {
    if (this.roomId) {
      this.socket?.emit('save-version', { roomId: this.roomId, userId });
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocketId(): string | null {
    return this.socket?.id || null;
  }
}

export const socketManager = new SocketManager();

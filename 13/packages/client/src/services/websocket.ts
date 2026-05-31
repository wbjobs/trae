import { io, Socket } from 'socket.io-client';
import { useGraphStore } from '@/stores/graph';
import { OTTransformer } from '@collaborative-graph/shared';
import type {
  Operation,
  SerializedGraphState,
  OperationHistoryEntry,
  UserCursor,
} from '@collaborative-graph/shared';

class WebSocketService {
  private socket: Socket | null = null;
  private pendingOperations: Operation[] = [];
  private awaitingAck: Operation | null = null;
  private transformer = new OTTransformer();
  private graphStore: ReturnType<typeof useGraphStore> | null = null;

  connect(url: string = 'http://localhost:3001'): void {
    this.socket = io(`${url}/graph`, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventListeners();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  setStore(store: ReturnType<typeof useGraphStore>): void {
    this.graphStore = store;
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    this.socket.on('graphState', (data: { state: SerializedGraphState; connectedUsers: string[] }) => {
      if (this.graphStore) {
        this.graphStore.setGraphState(data.state);
        this.graphStore.connectedUsers = data.connectedUsers;
      }
    });

    this.socket.on('operation', (data: { operation: Operation; fromUserId: string }) => {
      this.handleRemoteOperation(data.operation, data.fromUserId);
    });

    this.socket.on('operationAck', (data: { operationId: string; newVersion: number }) => {
      this.handleOperationAck(data.operationId, data.newVersion);
    });

    this.socket.on('operationRejected', (data: { operationId: string; reason: string; conflicts: Operation[] }) => {
      console.warn('Operation rejected:', data.reason, data.conflicts);
      this.awaitingAck = null;
      this.processQueue();
    });

    this.socket.on('userJoined', (data: { userId: string; connectedUsers: string[] }) => {
      if (this.graphStore) {
        this.graphStore.connectedUsers = data.connectedUsers;
      }
    });

    this.socket.on('userLeft', (data: { userId: string; connectedUsers: string[] }) => {
      if (this.graphStore) {
        this.graphStore.connectedUsers = data.connectedUsers;
        this.graphStore.removeUserCursor(data.userId);
      }
    });

    this.socket.on('cursorUpdate', (cursor: UserCursor) => {
      if (this.graphStore) {
        this.graphStore.updateUserCursor(cursor);
      }
    });

    this.socket.on('history', (data: { history: OperationHistoryEntry[]; totalCount: number; hasMore: boolean }) => {
      if (this.graphStore) {
        this.graphStore.setHistory(data.history);
      }
    });

    this.socket.on('replayState', (data: { state: SerializedGraphState; targetVersion?: number; targetTimestamp?: number }) => {
      if (this.graphStore) {
        this.graphStore.setGraphState(data.state);
        if (data.targetVersion !== undefined) {
          this.graphStore.startReplay(data.targetVersion);
        }
      }
    });

    this.socket.on('error', (data: { message: string }) => {
      console.error('WebSocket error:', data.message);
    });
  }

  joinGraph(graphId: string, userId: string): void {
    if (!this.socket) return;
    this.socket.emit('joinGraph', { graphId, userId });
  }

  leaveGraph(graphId: string, userId: string): void {
    if (!this.socket) return;
    this.socket.emit('leaveGraph', { graphId, userId });
    this.pendingOperations = [];
    this.awaitingAck = null;
  }

  sendOperation(operation: Operation): void {
    if (!this.graphStore) return;

    const opWithVersion = { ...operation, version: this.graphStore.version };

    this.graphStore.applyOperation(opWithVersion);

    if (this.awaitingAck) {
      this.pendingOperations.push(opWithVersion);
    } else {
      this.awaitingAck = opWithVersion;
      this.socket?.emit('operation', opWithVersion);
    }
  }

  private handleRemoteOperation(operation: Operation, fromUserId: string): void {
    if (!this.graphStore) return;

    const context = {
      nodes: new Set(this.graphStore.nodes.keys()),
      edges: new Set(this.graphStore.edges.keys()),
      tombstones: this.graphStore.tombstones,
    };

    if (this.awaitingAck) {
      const [transformedRemote, transformedAwaiting] = this.transformer.transformWithContext(
        operation,
        this.awaitingAck,
        context,
      );

      this.graphStore.applyOperation(transformedRemote);

      this.pendingOperations = this.pendingOperations.map((op) => {
        const [, transformedOp] = this.transformer.transformWithContext(
          transformedRemote,
          op,
          context,
        );
        return transformedOp;
      });

      this.awaitingAck = transformedAwaiting;
    } else {
      this.graphStore.applyOperation(operation);
    }
  }

  private handleOperationAck(operationId: string, newVersion: number): void {
    if (this.awaitingAck && this.awaitingAck.id === operationId) {
      this.awaitingAck = null;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.awaitingAck || this.pendingOperations.length === 0) return;

    const nextOp = this.pendingOperations.shift();
    if (nextOp) {
      this.awaitingAck = nextOp;
      this.socket?.emit('operation', nextOp);
    }
  }

  sendCursorUpdate(cursor: UserCursor): void {
    this.socket?.emit('cursorUpdate', cursor);
  }

  requestHistory(graphId: string, limit?: number, offset?: number): void {
    this.socket?.emit('requestHistory', { graphId, limit, offset });
  }

  requestState(graphId: string, version?: number): void {
    this.socket?.emit('requestState', { graphId, version });
  }

  replayToVersion(graphId: string, version: number): void {
    this.socket?.emit('replayToVersion', { graphId, version });
  }

  replayToTimestamp(graphId: string, timestamp: number): void {
    this.socket?.emit('replayToTimestamp', { graphId, timestamp });
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const websocketService = new WebSocketService();

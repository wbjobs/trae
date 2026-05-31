import {
  StreamChunk,
  parseChunk,
  SessionInfo,
  parseSessionResponse,
  VideoChunk,
  SubtitleChunk,
  ReliableSubtitleChunk,
  TYPE_SUBTITLE_RELIABLE,
  TYPE_DRIFT,
  parseDriftEvent,
  DriftDetectionResult
} from './protocol';
import {
  ReliableSubtitleReceiver,
  ReliableReceiverStats
} from './reliableReceiver';

export interface StreamClientConfig {
  apiBaseUrl: string;
}

export type StreamEventHandler =
  | { type: 'video'; handler: (chunk: VideoChunk) => void }
  | { type: 'subtitle'; handler: (chunk: SubtitleChunk) => void }
  | { type: 'drift'; handler: (result: DriftDetectionResult) => void }
  | { type: 'connected'; handler: () => void }
  | { type: 'disconnected'; handler: () => void }
  | { type: 'error'; handler: (error: Error) => void }
  | { type: 'reliable-stats'; handler: (stats: ReliableReceiverStats) => void };

export class StreamClient {
  private config: StreamClientConfig;
  private ws: WebSocket | null = null;
  private sessionInfo: SessionInfo | null = null;
  private connected = false;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private reliableReceiver: ReliableSubtitleReceiver | null = null;

  constructor(config: StreamClientConfig) {
    this.config = config;
  }

  on<T extends StreamEventHandler['type']>(
    event: T,
    handler: Extract<StreamEventHandler, { type: T }>['handler']
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off<T extends StreamEventHandler['type']>(
    event: T,
    handler: Extract<StreamEventHandler, { type: T }>['handler']
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit<T extends StreamEventHandler['type']>(
    event: T,
    ...args: Parameters<Extract<StreamEventHandler, { type: T }>['handler']>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as any)(...args);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      }
    }
  }

  async listVideos(): Promise<string[]> {
    const response = await fetch(`${this.config.apiBaseUrl}/api/videos`);
    const data = await response.json();
    return data.videos || [];
  }

  async getOffset(videoId: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/api/offset/${encodeURIComponent(videoId)}`
      );
      const data = await response.json();
      return data.offset ?? 0;
    } catch {
      return 0;
    }
  }

  async saveOffset(videoId: string, offsetMs: number): Promise<void> {
    await fetch(`${this.config.apiBaseUrl}/api/offset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ videoId, offsetMs })
    });
  }

  async connect(videoId: string): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    const sessionResponse = await fetch(`${this.config.apiBaseUrl}/api/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ videoId })
    });

    if (!sessionResponse.ok) {
      throw new Error(`Failed to create session: ${sessionResponse.statusText}`);
    }

    const sessionData = await sessionResponse.json();
    this.sessionInfo = parseSessionResponse(sessionData);

    await this.connectWebSocket();
  }

  private createReliableReceiver(): ReliableSubtitleReceiver {
    return new ReliableSubtitleReceiver({
      sendSACK: (data: Uint8Array) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(data);
        }
      },
      onDeliverSubtitle: (chunk: SubtitleChunk) => {
        this.emit('subtitle', chunk);
      },
      onStats: (stats: ReliableReceiverStats) => {
        this.emit('reliable-stats', stats);
      }
    });
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.sessionInfo?.wsEndpoint) {
        reject(new Error('No WebSocket endpoint available'));
        return;
      }

      console.log('[StreamClient] Connecting to:', this.sessionInfo.wsEndpoint);

      this.ws = new WebSocket(this.sessionInfo.wsEndpoint);
      this.ws.binaryType = 'arraybuffer';

      this.reliableReceiver = this.createReliableReceiver();

      this.ws.onopen = () => {
        console.log('[StreamClient] WebSocket connected');
        this.connected = true;
        this.emit('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.handleBinaryMessage(event.data);
        }
      };

      this.ws.onclose = () => {
        console.log('[StreamClient] WebSocket closed');
        this.connected = false;
        if (this.reliableReceiver) {
          this.reliableReceiver.close();
          this.reliableReceiver = null;
        }
        this.emit('disconnected');
      };

      this.ws.onerror = (error) => {
        console.error('[StreamClient] WebSocket error:', error);
        if (this.reliableReceiver) {
          this.reliableReceiver.close();
          this.reliableReceiver = null;
        }
        this.emit('error', new Error('WebSocket connection error'));
        reject(error);
      };
    });
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    const bytes = new Uint8Array(data);
    if (bytes.length < 1) return;

    const type = bytes[0];

    if (type === TYPE_DRIFT) {
      const driftResult = parseDriftEvent(bytes);
      if (driftResult) {
        console.log('[StreamClient] Drift event received:', driftResult);
        this.emit('drift', driftResult);
      }
      return;
    }

    if (type === TYPE_SUBTITLE_RELIABLE) {
      if (!this.reliableReceiver) return;

      const chunk = parseChunk(bytes) as ReliableSubtitleChunk | null;
      if (chunk && 'seq' in chunk) {
        this.reliableReceiver.receivePacket(chunk);
      }
      return;
    }

    const chunk = parseChunk(bytes);
    if (!chunk) {
      return;
    }

    if (chunk.type === 'video') {
      this.emit('video', chunk);
    } else if (chunk.type === 'subtitle' && !('seq' in chunk)) {
      this.emit('subtitle', chunk);
    }
  }

  async disconnect(): Promise<void> {
    if (this.reliableReceiver) {
      this.reliableReceiver.close();
      this.reliableReceiver = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.sessionInfo = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSessionInfo(): SessionInfo | null {
    return this.sessionInfo;
  }

  getReliableStats(): ReliableReceiverStats | null {
    return this.reliableReceiver ? this.reliableReceiver.getStats() : null;
  }
}

import ReconnectingWebSocket from 'reconnecting-websocket';
import { AnomalyResult, StatisticsData } from '../types';

type MessageHandler = (message: AnomalyResult | StatisticsData) => void;

class WebSocketService {
  private socket: ReconnectingWebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private url: string = '';

  connect(url: string): void {
    if (this.socket) {
      this.disconnect();
    }
    this.url = url;
    this.socket = new ReconnectingWebSocket(url);
    
    this.socket.onopen = () => {
      console.log('WebSocket connected');
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlers.forEach(handler => handler(data));
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  getUrl(): string {
    return this.url;
  }
}

export const wsService = new WebSocketService();

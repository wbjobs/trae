import { EventEmitter } from 'events';
import type { Device } from '../../../common/types';

interface PollingClient {
  id: string;
  deviceId: string;
  lastPoll: number;
  pendingMessages: CommandMessage[];
  response?: {
    resolve: (messages: any[]) => void;
    checkMessages: () => void;
    timeout: NodeJS.Timeout;
  };
}

interface CommandMessage {
  id: string;
  deviceId: string;
  command: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'acknowledged' | 'failed';
}

export class LongPollingService extends EventEmitter {
  private clients: Map<string, PollingClient> = new Map();
  private commandQueue: CommandMessage[] = [];
  private maxInactivity = 5 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout;
  private readonly POLL_TIMEOUT = 25000;

  constructor() {
    super();
    this.cleanupInterval = setInterval(() => this.cleanupInactiveClients(), 60000);
  }

  handlePoll(deviceId: string, lastMessageId?: string, timeout?: number): Promise<any[]> {
    return new Promise((resolve) => {
      let client = this.clients.get(deviceId);
      
      if (client && client.response) {
        clearTimeout(client.response.timeout);
        client.response.resolve([]);
      }
      
      if (!client) {
        client = {
          id: deviceId,
          deviceId,
          lastPoll: Date.now(),
          pendingMessages: []
        };
        this.clients.set(deviceId, client);
        this.emit('deviceConnected', deviceId);
        console.log(`[LongPolling] Device ${deviceId} connected`);
      }

      client.lastPoll = Date.now();

      if (client.pendingMessages.length > 0) {
        const messages = [...client.pendingMessages];
        client.pendingMessages = [];
        resolve(messages);
        return;
      }

      const pollTimeout = timeout || this.POLL_TIMEOUT;
      
      const timeoutId = setTimeout(() => {
        if (client) {
          client.response = undefined;
        }
        resolve([]);
      }, pollTimeout);

      const checkMessages = () => {
        if (client && client.pendingMessages.length > 0) {
          clearTimeout(timeoutId);
          const messages = [...client.pendingMessages];
          client.pendingMessages = [];
          client.response = undefined;
          resolve(messages);
        }
      };

      client.response = { resolve, checkMessages, timeout: timeoutId };
    });
  }

  sendToDevice(deviceId: string, command: string): CommandMessage {
    const commandMsg: CommandMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      deviceId,
      command,
      timestamp: Date.now(),
      status: 'pending'
    };

    const client = this.clients.get(deviceId);
    if (client) {
      client.pendingMessages.push(commandMsg);
      commandMsg.status = 'sent';
      if (client.response) {
        client.response.checkMessages();
      }
      console.log(`[LongPolling] Sent command to ${deviceId}: ${command}`);
    } else {
      this.commandQueue.push(commandMsg);
      console.log(`[LongPolling] Queued command for ${deviceId}: ${command}`);
    }

    this.emit('commandSent', commandMsg);
    return commandMsg;
  }

  broadcast(command: string, filter?: (deviceId: string) => boolean): CommandMessage[] {
    const messages: CommandMessage[] = [];
    for (const deviceId of this.clients.keys()) {
      if (!filter || filter(deviceId)) {
        messages.push(this.sendToDevice(deviceId, command));
      }
    }
    return messages;
  }

  acknowledgeCommand(commandId: string, deviceId: string): boolean {
    const cmd = this.commandQueue.find(c => c.id === commandId);
    if (cmd) {
      cmd.status = 'acknowledged';
      this.emit('commandAcknowledged', cmd);
      return true;
    }
    return false;
  }

  getConnectedDevices(): string[] {
    return Array.from(this.clients.keys());
  }

  isDeviceConnected(deviceId: string): boolean {
    return this.clients.has(deviceId);
  }

  getDeviceStatus(deviceId: string): { connected: boolean; lastPoll: number; pendingMessages: number } | null {
    const client = this.clients.get(deviceId);
    if (!client) return null;
    return {
      connected: true,
      lastPoll: client.lastPoll,
      pendingMessages: client.pendingMessages.length
    };
  }

  private cleanupInactiveClients(): void {
    const now = Date.now();
    for (const [deviceId, client] of this.clients) {
      if (now - client.lastPoll > this.maxInactivity) {
        this.clients.delete(deviceId);
        this.emit('deviceDisconnected', deviceId);
        console.log(`[LongPolling] Device ${deviceId} disconnected due to inactivity`);
      }
    }
  }

  getCommandQueue(deviceId?: string): CommandMessage[] {
    if (deviceId) {
      return this.commandQueue.filter(c => c.deviceId === deviceId);
    }
    return [...this.commandQueue];
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clients.clear();
    this.commandQueue = [];
  }
}

export const longPollingService = new LongPollingService();

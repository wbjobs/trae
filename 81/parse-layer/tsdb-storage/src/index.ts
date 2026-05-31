import { EventEmitter } from 'events';
import type { ParsedMessage, ForwardLog } from '../../../common/types';

interface StorageRecord {
  timestamp: number;
  tags: Record<string, string>;
  fields: Record<string, any>;
}

export class TSDBStorage extends EventEmitter {
  private rawMessages: Map<string, ParsedMessage[]> = new Map();
  private parsedLogs: ParsedMessage[] = [];
  private forwardLogs: ForwardLog[] = [];
  private maxRetention = 24 * 60 * 60 * 1000;

  async storeRawMessage(message: ParsedMessage): Promise<void> {
    const deviceKey = message.deviceId || 'unknown';
    if (!this.rawMessages.has(deviceKey)) {
      this.rawMessages.set(deviceKey, []);
    }
    const arr = this.rawMessages.get(deviceKey)!;
    arr.push(message);
    
    if (arr.length > 1000) {
      arr.shift();
    }
    
    this.emit('rawMessageStored', message);
    console.log(`[TSDB] Stored raw message from ${deviceKey}, total: ${arr.length}`);
  }

  async storeParsedLog(log: ParsedMessage): Promise<void> {
    this.parsedLogs.unshift(log);
    this.cleanupOldData();
    this.emit('parsedLogStored', log);
  }

  async storeForwardLog(log: ForwardLog): Promise<void> {
    this.forwardLogs.unshift(log);
    this.cleanupOldData();
    this.emit('forwardLogStored', log);
  }

  async queryRawMessages(filters: {
    deviceId?: string;
    protocol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<{ list: ParsedMessage[]; total: number }> {
    let result: ParsedMessage[] = [];
    
    if (filters.deviceId) {
      result = [...(this.rawMessages.get(filters.deviceId) || [])];
    } else {
      for (const arr of this.rawMessages.values()) {
        result.push(...arr);
      }
    }
    
    if (filters.protocol) {
      result = result.filter(m => m.protocol === filters.protocol);
    }
    if (filters.startTime) {
      result = result.filter(m => m.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      result = result.filter(m => m.timestamp <= filters.endTime!);
    }

    const total = result.length;
    const limit = filters.limit || 100;
    
    return {
      list: result.slice(0, limit),
      total
    };
  }

  async queryParsedLogs(filters: {
    protocol?: string;
    deviceId?: string;
    success?: boolean;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<{ list: ParsedMessage[]; total: number }> {
    let result = [...this.parsedLogs];
    
    if (filters.protocol) {
      result = result.filter(l => l.protocol === filters.protocol);
    }
    if (filters.deviceId) {
      result = result.filter(l => l.deviceId === filters.deviceId);
    }
    if (filters.success !== undefined) {
      result = result.filter(l => l.success === filters.success);
    }
    if (filters.startTime) {
      result = result.filter(l => l.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      result = result.filter(l => l.timestamp <= filters.endTime!);
    }

    const total = result.length;
    const limit = filters.limit || 100;
    
    return {
      list: result.slice(0, limit),
      total
    };
  }

  async queryForwardLogs(filters: {
    sourceDevice?: string;
    targetType?: string;
    success?: boolean;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<{ list: ForwardLog[]; total: number }> {
    let result = [...this.forwardLogs];
    
    if (filters.sourceDevice) {
      result = result.filter(l => l.sourceDevice === filters.sourceDevice);
    }
    if (filters.targetType) {
      result = result.filter(l => l.targetType === filters.targetType);
    }
    if (filters.success !== undefined) {
      result = result.filter(l => l.success === filters.success);
    }
    if (filters.startTime) {
      result = result.filter(l => l.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      result = result.filter(l => l.timestamp <= filters.endTime!);
    }

    const total = result.length;
    const limit = filters.limit || 100;
    
    return {
      list: result.slice(0, limit),
      total
    };
  }

  async getStatistics(): Promise<{
    totalMessages: number;
    successRate: number;
    messagesByProtocol: Record<string, number>;
    messagesByDevice: Record<string, number>;
  }> {
    const totalMessages = this.parsedLogs.length;
    const successCount = this.parsedLogs.filter(l => l.success).length;
    const successRate = totalMessages > 0 ? successCount / totalMessages : 0;
    
    const messagesByProtocol: Record<string, number> = {};
    const messagesByDevice: Record<string, number> = {};
    
    for (const log of this.parsedLogs) {
      messagesByProtocol[log.protocol] = (messagesByProtocol[log.protocol] || 0) + 1;
      if (log.deviceId) {
        messagesByDevice[log.deviceId] = (messagesByDevice[log.deviceId] || 0) + 1;
      }
    }

    return {
      totalMessages,
      successRate,
      messagesByProtocol,
      messagesByDevice
    };
  }

  private cleanupOldData(): void {
    const now = Date.now();
    const cutoff = now - this.maxRetention;
    
    this.parsedLogs = this.parsedLogs.filter(l => l.timestamp >= cutoff);
    this.forwardLogs = this.forwardLogs.filter(l => l.timestamp >= cutoff);
    
    if (this.parsedLogs.length > 10000) {
      this.parsedLogs = this.parsedLogs.slice(0, 10000);
    }
    if (this.forwardLogs.length > 10000) {
      this.forwardLogs = this.forwardLogs.slice(0, 10000);
    }
  }

  async exportData(format: 'json' | 'csv', type: 'raw' | 'parsed' | 'forward'): Promise<string> {
    let data: any[] = [];
    
    switch (type) {
      case 'raw':
        data = Array.from(this.rawMessages.values()).flat();
        break;
      case 'parsed':
        data = this.parsedLogs;
        break;
      case 'forward':
        data = this.forwardLogs;
        break;
    }

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      if (data.length === 0) return '';
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).join(','));
      return [headers, ...rows].join('\n');
    }
  }
}

export const tsdbStorage = new TSDBStorage();

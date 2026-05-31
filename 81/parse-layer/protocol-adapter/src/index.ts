import { EventEmitter } from 'events';
import type { ProtocolConfig, ParsedMessage, MessageSchema } from '../../../common/types';
import { messageParser } from '../../message-parser/src';

export interface ProtocolMessage {
  protocol: string;
  data: string;
  deviceId?: string;
  timestamp: number;
  schemaId?: string;
}

export interface ProtocolAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(deviceId: string, data: string): Promise<void>;
  onMessage(callback: (msg: ProtocolMessage) => void): void;
}

class MQTTAdapter implements ProtocolAdapter {
  private config: ProtocolConfig;
  private emitter = new EventEmitter();
  private started = false;

  constructor(config: ProtocolConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    console.log(`[MQTT] Starting adapter on ${this.config.host}:${this.config.port}`);
    this.started = true;
    setInterval(() => {
      if (this.started && Math.random() > 0.7) {
        this.emitter.emit('message', {
          protocol: 'MQTT',
          data: Buffer.from(JSON.stringify({
            deviceId: 'dev_' + Math.floor(Math.random() * 100),
            temperature: Math.random() * 50,
            humidity: Math.random() * 100,
            timestamp: Date.now()
          })).toString('hex'),
          deviceId: 'dev_' + Math.floor(Math.random() * 100),
          timestamp: Date.now()
        });
      }
    }, 2000);
  }

  async stop(): Promise<void> {
    this.started = false;
    console.log(`[MQTT] Adapter stopped`);
  }

  async send(deviceId: string, data: string): Promise<void> {
    console.log(`[MQTT] Sending to ${deviceId}: ${data}`);
  }

  onMessage(callback: (msg: ProtocolMessage) => void): void {
    this.emitter.on('message', callback);
  }
}

class TCPAdapter implements ProtocolAdapter {
  private config: ProtocolConfig;
  private emitter = new EventEmitter();
  private started = false;

  constructor(config: ProtocolConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    console.log(`[TCP] Starting adapter on ${this.config.host}:${this.config.port}`);
    this.started = true;
    setInterval(() => {
      if (this.started && Math.random() > 0.8) {
        const buf = Buffer.alloc(16);
        buf.writeInt32BE(Math.floor(Math.random() * 100), 0);
        buf.writeInt32BE(Math.floor(Math.random() * 100), 4);
        buf.writeInt32BE(Date.now() / 1000, 8);
        this.emitter.emit('message', {
          protocol: 'TCP',
          data: buf.toString('hex'),
          deviceId: 'tcp_dev_' + Math.floor(Math.random() * 50),
          timestamp: Date.now()
        });
      }
    }, 3000);
  }

  async stop(): Promise<void> {
    this.started = false;
    console.log(`[TCP] Adapter stopped`);
  }

  async send(deviceId: string, data: string): Promise<void> {
    console.log(`[TCP] Sending to ${deviceId}: ${data}`);
  }

  onMessage(callback: (msg: ProtocolMessage) => void): void {
    this.emitter.on('message', callback);
  }
}

class HTTPAdapter implements ProtocolAdapter {
  private config: ProtocolConfig;
  private emitter = new EventEmitter();
  private started = false;

  constructor(config: ProtocolConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    console.log(`[HTTP] Starting adapter on ${this.config.host}:${this.config.port}`);
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    console.log(`[HTTP] Adapter stopped`);
  }

  async send(deviceId: string, data: string): Promise<void> {
    console.log(`[HTTP] Sending to ${deviceId}: ${data}`);
  }

  onMessage(callback: (msg: ProtocolMessage) => void): void {
    this.emitter.on('message', callback);
  }

  handleWebhook(data: any, deviceId?: string): void {
    this.emitter.emit('message', {
      protocol: 'HTTP',
      data: typeof data === 'string' ? data : JSON.stringify(data),
      deviceId,
      timestamp: Date.now()
    });
  }
}

class ModbusAdapter implements ProtocolAdapter {
  private config: ProtocolConfig;
  private emitter = new EventEmitter();
  private started = false;

  constructor(config: ProtocolConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    console.log(`[Modbus] Starting adapter on ${this.config.host}:${this.config.port}`);
    this.started = true;
    setInterval(() => {
      if (this.started && Math.random() > 0.75) {
        const buf = Buffer.alloc(8);
        buf.writeUInt16BE(1, 0);
        buf.writeUInt16BE(3, 2);
        buf.writeUInt16BE(Math.floor(Math.random() * 1000), 4);
        this.emitter.emit('message', {
          protocol: 'Modbus',
          data: buf.toString('hex'),
          deviceId: 'modbus_' + Math.floor(Math.random() * 30),
          timestamp: Date.now()
        });
      }
    }, 5000);
  }

  async stop(): Promise<void> {
    this.started = false;
    console.log(`[Modbus] Adapter stopped`);
  }

  async send(deviceId: string, data: string): Promise<void> {
    console.log(`[Modbus] Sending to ${deviceId}: ${data}`);
  }

  onMessage(callback: (msg: ProtocolMessage) => void): void {
    this.emitter.on('message', callback);
  }
}

export class ProtocolAdapterManager extends EventEmitter {
  private adapters: Map<string, ProtocolAdapter> = new Map();
  private configs: Map<string, ProtocolConfig> = new Map();
  private parsedMessageCallback?: (msg: ParsedMessage) => void;
  private messageQueue: { msg: ProtocolMessage; configId: string }[] = [];
  private isProcessing = false;
  private schemaMap: Map<string, string[]> = new Map();

  registerAdapter(config: ProtocolConfig): void {
    this.configs.set(config.id, config);
    const adapter = this.createAdapter(config);
    this.adapters.set(config.id, adapter);
    
    adapter.onMessage((msg) => {
      this.queueMessage(msg, config.id);
    });
  }

  registerSchemaForProtocol(protocolId: string, schemaId: string): void {
    if (!this.schemaMap.has(protocolId)) {
      this.schemaMap.set(protocolId, []);
    }
    const schemas = this.schemaMap.get(protocolId)!;
    if (!schemas.includes(schemaId)) {
      schemas.push(schemaId);
    }
  }

  private queueMessage(msg: ProtocolMessage, configId: string): void {
    this.messageQueue.push({ msg, configId });
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      if (item) {
        try {
          await this.handleMessage(item.msg, item.configId);
        } catch (error) {
          console.error('[AdapterManager] Error processing message:', error);
        }
      }
    }
    
    this.isProcessing = false;
  }

  unregisterAdapter(configId: string): void {
    const adapter = this.adapters.get(configId);
    if (adapter) {
      adapter.stop();
      this.adapters.delete(configId);
      this.configs.delete(configId);
    }
  }

  private createAdapter(config: ProtocolConfig): ProtocolAdapter {
    switch (config.type) {
      case 'MQTT':
        return new MQTTAdapter(config);
      case 'TCP':
        return new TCPAdapter(config);
      case 'HTTP':
        return new HTTPAdapter(config);
      case 'Modbus':
        return new ModbusAdapter(config);
      default:
        return new MQTTAdapter(config);
    }
  }

  private async handleMessage(msg: ProtocolMessage, configId: string): Promise<void> {
    const config = this.configs.get(configId);
    const protocolType = config?.type || msg.protocol;
    
    let schemaId = msg.schemaId;
    if (!schemaId && configId) {
      const protocolSchemas = this.schemaMap.get(configId);
      if (protocolSchemas && protocolSchemas.length > 0) {
        schemaId = protocolSchemas[0];
      }
    }

    const parsed = messageParser.parse(msg.data, protocolType, schemaId, msg.deviceId);
    this.emit('parsed', parsed);
    if (this.parsedMessageCallback) {
      this.parsedMessageCallback(parsed);
    }
  }

  async startAll(): Promise<void> {
    for (const [id, adapter] of this.adapters) {
      try {
        await adapter.start();
        console.log(`[AdapterManager] Started adapter: ${id}`);
      } catch (error) {
        console.error(`[AdapterManager] Failed to start adapter ${id}:`, error);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [id, adapter] of this.adapters) {
      try {
        await adapter.stop();
        console.log(`[AdapterManager] Stopped adapter: ${id}`);
      } catch (error) {
        console.error(`[AdapterManager] Failed to stop adapter ${id}:`, error);
      }
    }
  }

  async send(configId: string, deviceId: string, data: string): Promise<void> {
    const adapter = this.adapters.get(configId);
    if (adapter) {
      await adapter.send(deviceId, data);
    }
  }

  onParsedMessage(callback: (msg: ParsedMessage) => void): void {
    this.parsedMessageCallback = callback;
  }

  getAdapter(configId: string): ProtocolAdapter | undefined {
    return this.adapters.get(configId);
  }
}

export const adapterManager = new ProtocolAdapterManager();

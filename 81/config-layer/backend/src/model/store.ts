import type { ProtocolConfig, MessageSchema, RouteRule, Device, ParsedMessage, ForwardLog } from '../../../../common/types';
import { generateId } from '../../../../common/utils';

class DataStore {
  private protocols: Map<string, ProtocolConfig> = new Map();
  private schemas: Map<string, MessageSchema> = new Map();
  private routes: Map<string, RouteRule> = new Map();
  private devices: Map<string, Device> = new Map();
  private parseLogs: ParsedMessage[] = [];
  private forwardLogs: ForwardLog[] = [];

  constructor() {
    this.initMockData();
  }

  private initMockData() {
    const now = Date.now();
    
    const defaultProtocols: ProtocolConfig[] = [
      { id: generateId(), name: 'MQTT网关', type: 'MQTT', version: '3.1.1', description: 'MQTT消息协议网关', port: 1883, host: '0.0.0.0', createdAt: now, updatedAt: now },
      { id: generateId(), name: 'HTTP接口', type: 'HTTP', version: '1.1', description: 'HTTP REST API接口', port: 8080, host: '0.0.0.0', createdAt: now, updatedAt: now },
      { id: generateId(), name: 'TCP服务', type: 'TCP', version: '1.0', description: 'TCP长连接服务', port: 9000, host: '0.0.0.0', createdAt: now, updatedAt: now }
    ];
    defaultProtocols.forEach(p => this.protocols.set(p.id, p));

    const defaultSchemas: MessageSchema[] = [
      {
        id: generateId(),
        name: '传感器数据上报',
        protocolId: defaultProtocols[0].id,
        fields: [
          { id: generateId(), name: 'deviceId', type: 'string', length: 32, required: true, description: '设备ID' },
          { id: generateId(), name: 'temperature', type: 'number', required: true, description: '温度' },
          { id: generateId(), name: 'humidity', type: 'number', required: true, description: '湿度' },
          { id: generateId(), name: 'timestamp', type: 'number', required: true, description: '时间戳' }
        ],
        createdAt: now,
        updatedAt: now
      }
    ];
    defaultSchemas.forEach(s => this.schemas.set(s.id, s));

    const defaultRoutes: RouteRule[] = [
      {
        id: generateId(),
        name: '温度告警转发',
        priority: 10,
        enabled: true,
        conditions: [{ type: 'content', operator: 'gt', field: 'temperature', value: '30' }],
        targets: [{ type: 'webhook', value: 'http://alert.example.com/temperature' }],
        description: '温度超过30度时转发告警',
        createdAt: now,
        updatedAt: now
      }
    ];
    defaultRoutes.forEach(r => this.routes.set(r.id, r));

    const defaultDevices: Device[] = [
      { id: generateId(), name: '温度传感器-001', type: 'sensor', protocol: 'MQTT', status: 'online', ip: '192.168.1.101', lastHeartbeat: now, createdAt: now, updatedAt: now },
      { id: generateId(), name: '温湿度传感器-002', type: 'sensor', protocol: 'MQTT', status: 'online', ip: '192.168.1.102', lastHeartbeat: now, createdAt: now, updatedAt: now },
      { id: generateId(), name: '控制器-001', type: 'controller', protocol: 'TCP', status: 'offline', ip: '192.168.1.201', createdAt: now, updatedAt: now }
    ];
    defaultDevices.forEach(d => this.devices.set(d.id, d));

    for (let i = 0; i < 10; i++) {
      this.parseLogs.push({
        id: generateId(),
        rawData: Buffer.from(`test_data_${i}`).toString('hex'),
        protocol: i % 2 === 0 ? 'MQTT' : 'HTTP',
        deviceId: defaultDevices[i % 3].id,
        timestamp: now - i * 60000,
        parsedData: { value: i * 10 },
        success: i % 5 !== 0,
        error: i % 5 === 0 ? 'Parse error' : undefined
      });
    }
  }

  getProtocols(): ProtocolConfig[] {
    return Array.from(this.protocols.values());
  }

  getProtocol(id: string): ProtocolConfig | undefined {
    return this.protocols.get(id);
  }

  addProtocol(data: Omit<ProtocolConfig, 'id' | 'createdAt' | 'updatedAt'>): ProtocolConfig {
    const now = Date.now();
    const protocol: ProtocolConfig = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    this.protocols.set(protocol.id, protocol);
    return protocol;
  }

  updateProtocol(id: string, data: Partial<ProtocolConfig>): ProtocolConfig | undefined {
    const protocol = this.protocols.get(id);
    if (!protocol) return undefined;
    const updated = { ...protocol, ...data, updatedAt: Date.now() };
    this.protocols.set(id, updated);
    return updated;
  }

  deleteProtocol(id: string): boolean {
    return this.protocols.delete(id);
  }

  getSchemas(): MessageSchema[] {
    return Array.from(this.schemas.values());
  }

  getSchema(id: string): MessageSchema | undefined {
    return this.schemas.get(id);
  }

  addSchema(data: Omit<MessageSchema, 'id' | 'createdAt' | 'updatedAt'>): MessageSchema {
    const now = Date.now();
    const schema: MessageSchema = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    this.schemas.set(schema.id, schema);
    return schema;
  }

  updateSchema(id: string, data: Partial<MessageSchema>): MessageSchema | undefined {
    const schema = this.schemas.get(id);
    if (!schema) return undefined;
    const updated = { ...schema, ...data, updatedAt: Date.now() };
    this.schemas.set(id, updated);
    return updated;
  }

  deleteSchema(id: string): boolean {
    return this.schemas.delete(id);
  }

  getRoutes(): RouteRule[] {
    return Array.from(this.routes.values());
  }

  getRoute(id: string): RouteRule | undefined {
    return this.routes.get(id);
  }

  addRoute(data: Omit<RouteRule, 'id' | 'createdAt' | 'updatedAt'>): RouteRule {
    const now = Date.now();
    const route: RouteRule = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    this.routes.set(route.id, route);
    return route;
  }

  updateRoute(id: string, data: Partial<RouteRule>): RouteRule | undefined {
    const route = this.routes.get(id);
    if (!route) return undefined;
    const updated = { ...route, ...data, updatedAt: Date.now() };
    this.routes.set(id, updated);
    return updated;
  }

  deleteRoute(id: string): boolean {
    return this.routes.delete(id);
  }

  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  addDevice(data: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Device {
    const now = Date.now();
    const device: Device = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    this.devices.set(device.id, device);
    return device;
  }

  updateDevice(id: string, data: Partial<Device>): Device | undefined {
    const device = this.devices.get(id);
    if (!device) return undefined;
    const updated = { ...device, ...data, updatedAt: Date.now() };
    this.devices.set(id, updated);
    return updated;
  }

  deleteDevice(id: string): boolean {
    return this.devices.delete(id);
  }

  getParseLogs(page = 1, pageSize = 20, protocol?: string): { list: ParsedMessage[]; total: number } {
    let logs = [...this.parseLogs].sort((a, b) => b.timestamp - a.timestamp);
    if (protocol) {
      logs = logs.filter(l => l.protocol === protocol);
    }
    const total = logs.length;
    const start = (page - 1) * pageSize;
    return { list: logs.slice(start, start + pageSize), total };
  }

  addParseLog(log: Omit<ParsedMessage, 'id'>): ParsedMessage {
    const fullLog: ParsedMessage = { ...log, id: generateId() };
    this.parseLogs.unshift(fullLog);
    if (this.parseLogs.length > 10000) {
      this.parseLogs = this.parseLogs.slice(0, 10000);
    }
    return fullLog;
  }

  getForwardLogs(page = 1, pageSize = 20): { list: ForwardLog[]; total: number } {
    const logs = [...this.forwardLogs].sort((a, b) => b.timestamp - a.timestamp);
    const total = logs.length;
    const start = (page - 1) * pageSize;
    return { list: logs.slice(start, start + pageSize), total };
  }

  addForwardLog(log: Omit<ForwardLog, 'id'>): ForwardLog {
    const fullLog: ForwardLog = { ...log, id: generateId() };
    this.forwardLogs.unshift(fullLog);
    if (this.forwardLogs.length > 10000) {
      this.forwardLogs = this.forwardLogs.slice(0, 10000);
    }
    return fullLog;
  }
}

export const store = new DataStore();

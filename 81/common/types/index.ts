export interface ProtocolConfig {
  id: string;
  name: string;
  type: 'MQTT' | 'HTTP' | 'TCP' | 'UDP' | 'WebSocket' | 'Modbus' | 'BACnet';
  version: string;
  description: string;
  port?: number;
  host?: string;
  options?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface MessageField {
  id?: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'binary';
  length?: number;
  offset?: number;
  encoding?: 'utf8' | 'ascii' | 'hex' | 'base64';
  required: boolean;
  defaultValue?: any;
  description?: string;
  children?: MessageField[];
}

export interface MessageSchema {
  id: string;
  name: string;
  protocolId: string;
  fields: MessageField[];
  headerPattern?: string;
  footerPattern?: string;
  lengthField?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RouteRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: RouteCondition[];
  targets: RouteTarget[];
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RouteCondition {
  type: 'protocol' | 'topic' | 'content' | 'device' | 'time';
  operator: 'eq' | 'ne' | 'contains' | 'regex' | 'gt' | 'lt';
  field: string;
  value: string;
}

export interface RouteTarget {
  type: 'device' | 'group' | 'topic' | 'webhook';
  value: string;
  transform?: string;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  protocol: string;
  status: 'online' | 'offline' | 'error';
  ip?: string;
  lastHeartbeat?: number;
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface ParsedMessage {
  id: string;
  rawData: string;
  protocol: string;
  deviceId?: string;
  timestamp: number;
  parsedData: Record<string, any>;
  schemaId?: string;
  success: boolean;
  error?: string;
}

export interface ForwardLog {
  id: string;
  messageId: string;
  ruleId: string;
  sourceDevice: string;
  targetType: string;
  targetValue: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export type Schema = MessageSchema;

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  permissions: string[];
  createdAt: number;
}

export interface AuthToken {
  token: string;
  userId: string;
  expiresAt: number;
}

export interface ProtocolVersion {
  id: string;
  protocolId: string;
  version: string;
  schemaId?: string;
  config: Record<string, any>;
  changelog: string;
  status: 'draft' | 'testing' | 'stable' | 'deprecated';
  releasedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GrayRelease {
  id: string;
  versionId: string;
  name: string;
  description?: string;
  strategy: 'percentage' | 'deviceList' | 'deviceGroup' | 'canary';
  percentage?: number;
  deviceIds?: string[];
  groupIds?: string[];
  canaryDevices?: string[];
  status: 'pending' | 'running' | 'paused' | 'completed' | 'rolledback';
  successRate: number;
  errorCount: number;
  totalCount: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceVersion {
  deviceId: string;
  protocolId: string;
  currentVersion: string;
  targetVersion?: string;
  upgradeStatus: 'idle' | 'pending' | 'upgrading' | 'success' | 'failed';
  lastUpgradeAt?: number;
  upgradeError?: string;
  createdAt: number;
  updatedAt: number;
}

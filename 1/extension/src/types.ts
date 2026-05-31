export interface HeaderCondition {
  name: string;
  value: string;
  operator: 'equals' | 'contains' | 'exists';
}

export interface HeaderModification {
  name: string;
  value: string;
  operation: 'set' | 'remove';
}

export interface RuleGroup {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Rule {
  id: string;
  groupId: string;
  name: string;
  urlPattern: string;
  methods: string[];
  headerConditions: HeaderCondition[];
  actionType: 'forward' | 'mock';
  forwardUrl?: string;
  mockStatusCode?: number;
  mockHeaders?: Record<string, string>;
  mockBody?: string;
  requestHeaders: HeaderModification[];
  responseHeaders: HeaderModification[];
  enabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LogEntry {
  id: string;
  ruleId?: string;
  ruleName?: string;
  requestUrl: string;
  requestMethod: string;
  actionType: 'forward' | 'mock' | 'none';
  status: 'success' | 'error';
  responseTime?: number;
  responseStatusCode?: number;
  errorMessage?: string;
  timestamp: string;
}

export interface UrlStats {
  url: string;
  count: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
}

export interface StatusCodeStats {
  statusCode: number;
  count: number;
}

export interface StatsSummary {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  avgResponseTime: number;
  topUrls: UrlStats[];
  statusCodes: StatusCodeStats[];
}

export interface ExportData {
  version: number;
  exportedAt: string;
  group: { id: string; name: string; description?: string } | null;
  rules: Rule[];
}

export interface ExtensionSettings {
  apiUrl: string;
  apiKey: string;
  autoSync: boolean;
  syncInterval: number;
}

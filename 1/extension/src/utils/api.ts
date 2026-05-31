import { Rule, LogEntry, ExtensionSettings, RuleGroup, StatsSummary, ExportData } from '../types';

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(settings: ExtensionSettings) {
    this.baseUrl = settings.apiUrl.replace(/\/$/, '');
    this.apiKey = settings.apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
  }

  async getGroups(): Promise<RuleGroup[]> {
    return this.request<RuleGroup[]>('/api/groups');
  }

  async getActiveGroup(): Promise<RuleGroup> {
    return this.request<RuleGroup>('/api/groups/active');
  }

  async createGroup(name: string, description?: string): Promise<RuleGroup> {
    return this.request<RuleGroup>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async updateGroup(id: string, name: string, description?: string): Promise<RuleGroup> {
    return this.request<RuleGroup>(`/api/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description }),
    });
  }

  async activateGroup(id: string): Promise<RuleGroup> {
    return this.request<RuleGroup>(`/api/groups/${id}/activate`, {
      method: 'PATCH',
    });
  }

  async deleteGroup(id: string): Promise<void> {
    return this.request<void>(`/api/groups/${id}`, {
      method: 'DELETE',
    });
  }

  async getRules(): Promise<Rule[]> {
    return this.request<Rule[]>('/api/rules');
  }

  async createRule(rule: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>): Promise<Rule> {
    return this.request<Rule>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  }

  async updateRule(id: string, rule: Partial<Rule>): Promise<Rule> {
    return this.request<Rule>(`/api/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    });
  }

  async enableRule(id: string): Promise<Rule> {
    return this.request<Rule>(`/api/rules/${id}/enable`, {
      method: 'PATCH',
    });
  }

  async disableRule(id: string): Promise<Rule> {
    return this.request<Rule>(`/api/rules/${id}/disable`, {
      method: 'PATCH',
    });
  }

  async deleteRule(id: string): Promise<void> {
    return this.request<void>(`/api/rules/${id}`, {
      method: 'DELETE',
    });
  }

  async reorderRules(order: { id: string; priority: number }[]): Promise<Rule[]> {
    return this.request<Rule[]>('/api/rules/reorder', {
      method: 'POST',
      body: JSON.stringify({ order }),
    });
  }

  async importRules(rules: Omit<Rule, 'id' | 'groupId' | 'createdAt' | 'updatedAt'>[], groupId?: string): Promise<{ imported: number; rules: Rule[] }> {
    return this.request<{ imported: number; rules: Rule[] }>('/api/rules/import', {
      method: 'POST',
      body: JSON.stringify({ rules, groupId }),
    });
  }

  async exportRules(groupId?: string): Promise<ExportData> {
    const path = groupId ? `/api/rules/export/${groupId}` : '/api/rules/export';
    return this.request<ExportData>(path);
  }

  async getLogs(limit: number = 100): Promise<LogEntry[]> {
    return this.request<LogEntry[]>(`/api/logs?limit=${limit}`);
  }

  async createLog(log: Omit<LogEntry, 'id'> & { timestamp?: string }): Promise<LogEntry> {
    return this.request<LogEntry>('/api/logs', {
      method: 'POST',
      body: JSON.stringify(log),
    });
  }

  async clearLogs(): Promise<void> {
    return this.request<void>('/api/logs', {
      method: 'DELETE',
    });
  }

  async getStats(hours: number = 24): Promise<StatsSummary> {
    return this.request<StatsSummary>(`/api/stats?hours=${hours}`);
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>('/api/health');
  }
}

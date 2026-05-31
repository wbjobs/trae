import client from './client';

export interface AlertRule {
  id: number;
  name: string;
  anomaly_rule_id: number;
  channel_type: 'email' | 'dingding' | 'wechat';
  channel_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleCreate {
  name: string;
  anomaly_rule_id: number;
  channel_type: string;
  channel_config: Record<string, any>;
}

export interface AlertHistory {
  id: number;
  alert_rule_id: number;
  anomaly_record_id: number | null;
  channel_type: string;
  status: 'success' | 'failed';
  error_message: string | null;
  sent_at: string;
  response_data: Record<string, any> | null;
}

export const alertApi = {
  getAllRules: () => client.get<AlertRule[]>('/alerts/rules'),
  getRuleById: (id: number) => client.get<AlertRule>(`/alerts/rules/${id}`),
  createRule: (data: AlertRuleCreate) =>
    client.post<AlertRule>('/alerts/rules', data),
  updateRule: (id: number, data: Partial<AlertRuleCreate> & { is_active?: boolean }) =>
    client.put<AlertRule>(`/alerts/rules/${id}`, data),
  deleteRule: (id: number) => client.delete(`/alerts/rules/${id}`),
  getHistory: (alertRuleId?: number, limit: number = 100) =>
    client.get<AlertHistory[]>('/alerts/history', {
      params: { alert_rule_id: alertRuleId, limit },
    }),
  testEmail: (recipients: string[], subject?: string) =>
    client.post('/alerts/test/email', undefined, { params: { recipients, subject } }),
  testDingding: (webhook: string, title?: string, content?: string) =>
    client.post('/alerts/test/dingding', undefined, { params: { webhook, title, content } }),
  testWechat: (webhook: string, title?: string, content?: string) =>
    client.post('/alerts/test/wechat', undefined, { params: { webhook, title, content } }),
};

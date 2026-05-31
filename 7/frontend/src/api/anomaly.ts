import client from './client';

export interface AnomalyDetectionRule {
  id: number;
  name: string;
  datasource_id: number;
  algorithm: '3sigma' | 'moving_average' | 'isolation_forest';
  params: Record<string, any>;
  window_size: number;
  threshold: number;
  min_continuous: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnomalyDetectionRuleCreate {
  name: string;
  datasource_id: number;
  algorithm: string;
  params: Record<string, any>;
  window_size: number;
  threshold: number;
  min_continuous: number;
}

export interface AnomalyRecord {
  id: number;
  datasource_id: number;
  anomaly_rule_id: number;
  timestamp: string;
  value: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description?: string;
  context_data?: Record<string, any>;
  status: 'new' | 'investigating' | 'resolved' | 'ignored';
  cause?: string;
  created_at: string;
  updated_at: string;
}

export const anomalyApi = {
  getAllRules: () => client.get<AnomalyDetectionRule[]>('/anomaly-detection/rules'),
  getRuleById: (id: number) => client.get<AnomalyDetectionRule>(`/anomaly-detection/rules/${id}`),
  createRule: (data: AnomalyDetectionRuleCreate) =>
    client.post<AnomalyDetectionRule>('/anomaly-detection/rules', data),
  updateRule: (id: number, data: Partial<AnomalyDetectionRuleCreate> & { is_active?: boolean }) =>
    client.put<AnomalyDetectionRule>(`/anomaly-detection/rules/${id}`, data),
  deleteRule: (id: number) => client.delete(`/anomaly-detection/rules/${id}`),
  detect: (id: number) => client.post(`/anomaly-detection/rules/${id}/detect`),
  getAllRecords: (limit: number = 100) =>
    client.get<AnomalyRecord[]>('/anomaly-detection/records', { params: { limit } }),
  getRecordById: (id: number) =>
    client.get<AnomalyRecord>(`/anomaly-detection/records/${id}`),
  updateRecord: (id: number, data: { status?: string; cause?: string }) =>
    client.put<AnomalyRecord>(`/anomaly-detection/records/${id}`, data),
  exportRules: (ruleIds?: number[]) =>
    client.post('/anomaly-detection/rules/export', ruleIds ? { rule_ids: ruleIds } : {}, {
      responseType: 'blob',
    }),
  importRules: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/anomaly-detection/rules/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  analyzeRootCause: (recordId: number) =>
    client.post(`/anomaly-detection/records/${recordId}/analyze-root-cause`),
};

import axios from 'axios';
import {
  ApiResponse,
  GrayRule,
  CreateRuleRequest,
  UpdateRuleRequest,
  TestRuleResult,
  SampleRecord,
  SamplingStats,
  SamplingConfig,
  UpstreamStats
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const rulesApi = {
  async getAll(): Promise<GrayRule[]> {
    const response = await api.get<ApiResponse<GrayRule[]>>('/rules');
    return response.data.data || [];
  },

  async getById(id: string): Promise<GrayRule> {
    const response = await api.get<ApiResponse<GrayRule>>(`/rules/${id}`);
    return response.data.data!;
  },

  async create(data: CreateRuleRequest): Promise<GrayRule> {
    const response = await api.post<ApiResponse<GrayRule>>('/rules', data);
    return response.data.data!;
  },

  async update(id: string, data: UpdateRuleRequest): Promise<GrayRule> {
    const response = await api.put<ApiResponse<GrayRule>>(`/rules/${id}`, data);
    return response.data.data!;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/rules/${id}`);
  },

  async toggle(id: string, enabled: boolean): Promise<GrayRule> {
    const response = await api.patch<ApiResponse<GrayRule>>(`/rules/${id}/toggle`, { enabled });
    return response.data.data!;
  },

  async reorder(ruleIds: string[]): Promise<GrayRule[]> {
    const response = await api.post<ApiResponse<GrayRule[]>>('/rules/reorder', { ruleIds });
    return response.data.data || [];
  },

  async test(id: string, userId: string): Promise<TestRuleResult> {
    const response = await api.get<ApiResponse<TestRuleResult>>(`/rules/${id}/test`, {
      params: { userId },
    });
    return response.data.data!;
  },

  async importRules(rules: CreateRuleRequest[]): Promise<GrayRule[]> {
    const response = await api.post<ApiResponse<GrayRule[]>>('/rules/import', { rules });
    return response.data.data || [];
  },

  async exportRules(): Promise<CreateRuleRequest[]> {
    const response = await api.get<CreateRuleRequest[]>('/rules/export');
    return response.data;
  },
};

export const healthApi = {
  async getHealth(): Promise<any> {
    const response = await api.get<ApiResponse<any>>('/health');
    return response.data.data;
  },

  async getConfig(): Promise<any> {
    const response = await api.get<ApiResponse<any>>('/config');
    return response.data.data;
  },

  async publishConfig(config: any): Promise<void> {
    await api.post('/config/publish', config);
  },
};

export const samplingApi = {
  async getRecentSamples(
    limit?: number,
    upstreamType?: string,
    matched?: boolean,
    userId?: string
  ): Promise<SampleRecord[]> {
    const response = await api.get<ApiResponse>('/sampling/samples', {
      params: { limit, upstream_type: upstreamType, matched, user_id: userId },
    });
    return response.data.samples || [];
  },

  async getStats(): Promise<SamplingStats> {
    const response = await api.get<ApiResponse>('/sampling/stats');
    return response.data.stats!;
  },

  async compareUpstreams(
    upstreamA: string = 'v1',
    upstreamB: string = 'v2',
    limit: number = 200
  ): Promise<Record<string, UpstreamStats>> {
    const response = await api.get<ApiResponse>('/sampling/compare', {
      params: { upstreamA, upstreamB, limit },
    });
    return response.data.comparison || {};
  },

  async getConfig(): Promise<SamplingConfig> {
    const response = await api.get<ApiResponse>('/sampling/config');
    return response.data.config!;
  },

  async updateConfig(config: Partial<SamplingConfig>): Promise<SamplingConfig> {
    const response = await api.put<ApiResponse>('/sampling/config', config);
    return response.data.config!;
  },
};

export default api;

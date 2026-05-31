import { Card, PermissionGroup, TimeRule, AccessLog, User } from '@/types';

const DEFAULT_BASE_URL = 'http://localhost:50051';

let baseUrl = DEFAULT_BASE_URL;
let authToken: string | null = null;

export const setBaseUrl = (url: string) => {
  baseUrl = url;
};

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

export interface LoginResponse {
  token: string;
  user: User;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
};

export const logout = async (): Promise<void> => {
  await request('/api/auth/logout', { method: 'POST' });
};

export const getCards = async (params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  permissionGroupId?: string;
}): Promise<{ cards: Card[]; total: number; page: number; pageSize: number }> => {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', params.page.toString());
  if (params?.pageSize) query.append('page_size', params.pageSize.toString());
  if (params?.search) query.append('search', params.search);
  if (params?.status) query.append('status', params.status);
  if (params?.permissionGroupId) query.append('permission_group_id', params.permissionGroupId);

  return request(`/api/cards?${query.toString()}`);
};

export const getCard = async (id: string): Promise<Card> => {
  return request(`/api/cards/${id}`);
};

export interface RegisterCardRequest {
  uid: string;
  sak?: string;
  atqa?: string;
  cardType?: string;
  userName: string;
  permissionGroupId: string;
  description?: string;
  keyA?: string;
  keyB?: string;
  expiresAt?: number;
}

export const registerCard = async (data: RegisterCardRequest): Promise<Card> => {
  const response = await request<{ card_id: string; card: Card }>('/api/cards', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.card;
};

export const updateCard = async (id: string, data: Partial<Card>): Promise<Card> => {
  return request(`/api/cards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const unregisterCard = async (id: string): Promise<void> => {
  await request(`/api/cards/${id}`, { method: 'DELETE' });
};

export const getPermissionGroups = async (): Promise<PermissionGroup[]> => {
  return request<{ groups: PermissionGroup[] }>('/api/permission-groups')
    .then(res => res.groups);
};

export const createPermissionGroup = async (name: string, description: string): Promise<PermissionGroup> => {
  const response = await request<{ group: PermissionGroup }>('/api/permission-groups', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  return response.group;
};

export const getTimeRules = async (permissionGroupId: string): Promise<TimeRule[]> => {
  return request<{ rules: TimeRule[] }>(`/api/permission-groups/${permissionGroupId}/time-rules`)
    .then(res => res.rules);
};

export interface AddTimeRuleRequest {
  permissionGroupId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone?: string;
  description?: string;
}

export const addTimeRule = async (data: AddTimeRuleRequest): Promise<TimeRule> => {
  const response = await request<{ rule: TimeRule }>(
    `/api/permission-groups/${data.permissionGroupId}/time-rules`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return response.rule;
};

export const deleteTimeRule = async (ruleId: string): Promise<void> => {
  await request(`/api/time-rules/${ruleId}`, { method: 'DELETE' });
};

export const getAccessLogs = async (params?: {
  page?: number;
  pageSize?: number;
  cardUid?: string;
  doorId?: string;
  result?: string;
  startTime?: number;
  endTime?: number;
}): Promise<{ logs: AccessLog[]; total: number; page: number; pageSize: number }> => {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', params.page.toString());
  if (params?.pageSize) query.append('page_size', params.pageSize.toString());
  if (params?.cardUid) query.append('card_uid', params.cardUid);
  if (params?.doorId) query.append('door_id', params.doorId);
  if (params?.result) query.append('result', params.result);
  if (params?.startTime) query.append('start_time', params.startTime.toString());
  if (params?.endTime) query.append('end_time', params.endTime.toString());

  return request(`/api/access-logs?${query.toString()}`);
};

export const remoteOpenDoor = async (doorId: string, reason: string): Promise<{ success: boolean; access_log_id: string }> => {
  return request('/api/doors/remote-open', {
    method: 'POST',
    body: JSON.stringify({ door_id: doorId, reason }),
  });
};

export const getDashboardStats = async (): Promise<{
  totalCards: number;
  activeCards: number;
  todayAccessCount: number;
  todayAllowedCount: number;
  todayDeniedCount: number;
}> => {
  return request('/api/dashboard/stats');
};

export const getRecentAccessLogs = async (limit: number = 10): Promise<AccessLog[]> => {
  return request<{ logs: AccessLog[] }>(`/api/access-logs/recent?limit=${limit}`)
    .then(res => res.logs);
};

export interface SuspiciousCard {
  id: string;
  uid: string;
  owner_name: string;
  anomaly_score: number;
  indicators: string[];
  first_detected: number;
  last_seen: number;
  violation_count: number;
  is_blacklisted: boolean;
}

export interface BlacklistedCard {
  id: string;
  uid: string;
  card_type: string;
  reason: string;
  source: string;
  detected_at: number;
  expires_at: number;
  is_active: boolean;
  reported_by: string;
}

export interface AntiCloneResult {
  is_genuine: boolean;
  confidence: number;
  reasons: string[];
  action_required: 'Allow' | 'Warn' | 'Block' | 'Blacklist';
  anomaly_score: number;
}

export const getSuspiciousCards = async (params?: {
  page?: number;
  pageSize?: number;
  minScore?: number;
}): Promise<{ cards: SuspiciousCard[]; total: number; page: number }> => {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', params.page.toString());
  if (params?.pageSize) query.append('page_size', params.pageSize.toString());
  if (params?.minScore) query.append('min_score', params.minScore.toString());

  return request(`/api/blacklist/suspicious?${query.toString()}`);
};

export const getBlacklistedCards = async (params?: {
  page?: number;
  pageSize?: number;
  activeOnly?: boolean;
}): Promise<{ cards: BlacklistedCard[]; total: number; page: number }> => {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', params.page.toString());
  if (params?.pageSize) query.append('page_size', params.pageSize.toString());
  if (params?.activeOnly !== undefined) query.append('active_only', params.activeOnly.toString());

  return request(`/api/blacklist?${query.toString()}`);
};

export const addToBlacklist = async (data: {
  uid: string;
  reason: string;
  source?: string;
  reportedBy?: string;
  expiresAt?: number;
}): Promise<{ success: boolean; blacklist_id: string }> => {
  return request('/api/blacklist', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const removeFromBlacklist = async (uid: string): Promise<{ success: boolean }> => {
  return request(`/api/blacklist/${uid}`, { method: 'DELETE' });
};

export const checkBlacklist = async (uid: string): Promise<{ is_blacklisted: boolean; entry?: BlacklistedCard }> => {
  return request(`/api/blacklist/check/${uid}`);
};

export const reportSuspiciousCard = async (data: {
  uid: string;
  anomalyScore: number;
  indicators: string[];
  reason: string;
  reportedBy?: string;
}): Promise<{ success: boolean; suspicious_card_id: string; auto_blacklisted: boolean }> => {
  return request('/api/suspicious/report', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

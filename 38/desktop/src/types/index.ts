export interface User {
  id: string;
  username: string;
  role: 'super_admin' | 'admin' | 'user';
  name: string;
  created_at: number;
}

export interface Card {
  id: string;
  uid: string;
  sak: string;
  atqa: string;
  card_type: string;
  user_id: string;
  user_name: string;
  permission_group_id: string;
  permission_group_name: string;
  status: 'active' | 'inactive' | 'expired';
  description: string;
  created_at: number;
  expires_at: number;
  has_key_a: boolean;
  has_key_b: boolean;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  card_count: number;
  created_at: number;
}

export interface TimeRule {
  id: string;
  permission_group_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  description: string;
}

export interface AccessLog {
  id: string;
  card_uid: string;
  card_id: string;
  user_name: string;
  door_id: string;
  door_name: string;
  event_type: 'card' | 'remote' | 'api';
  result: 'allowed' | 'denied';
  timestamp: number;
  details: string;
}

export interface NfcReader {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
}

export interface NfcReadResult {
  uid: string;
  sak: string;
  atqa: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  serverAddress: string;
}

export interface AppConfig {
  serverAddress: string;
  defaultReader: string | null;
  theme: 'light' | 'dark';
}

export type DayOfWeek = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  [-1]: '每天',
  [0]: '周日',
  [1]: '周一',
  [2]: '周二',
  [3]: '周三',
  [4]: '周四',
  [5]: '周五',
  [6]: '周六',
};

export const WORK_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5];
export const WEEKEND: DayOfWeek[] = [0, 6];

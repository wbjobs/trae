export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  category?: string;
  created_at: string;
  updated_at: string;
}

export interface PasswordListItem {
  id: string;
  title: string;
  username: string;
  url?: string;
  category?: string;
  updated_at: string;
}

export interface AddPasswordRequest {
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  category?: string;
}

export interface UpdatePasswordRequest {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  category?: string;
}

export interface PasswordStrengthResponse {
  score: number;
  label: string;
  suggestions: string[];
  crack_time: string;
}

export interface PasswordAnalysis {
  total_passwords: number;
  weak_passwords: WeakPassword[];
  duplicate_passwords: DuplicatePassword[];
  reused_passwords: ReusedPassword[];
  old_passwords: OldPassword[];
  average_strength: number;
  security_score: number;
  recommendations: string[];
}

export interface WeakPassword {
  id: string;
  title: string;
  score: number;
  label: string;
  suggestions: string[];
}

export interface DuplicatePassword {
  password: string;
  count: number;
  entries: PasswordRef[];
}

export interface ReusedPassword {
  password: string;
  count: number;
  entries: PasswordRef[];
}

export interface OldPassword {
  id: string;
  title: string;
  days_since_change: number;
}

export interface PasswordRef {
  id: string;
  title: string;
}

export interface ServerStatus {
  running: boolean;
  port?: number;
  token?: string;
}

export interface ServerConfig {
  port?: number;
}

export interface EmergencyContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  share: string;
  created_at: string;
}

export interface EmergencyContactInput {
  name: string;
  email: string;
  phone?: string;
}

export interface EmergencyConfig {
  enabled: boolean;
  threshold: number;
  waiting_period_days: number;
  contacts: EmergencyContact[];
  created_at: string;
  updated_at: string;
}

export interface SetupEmergencyRequest {
  contacts: EmergencyContactInput[];
  threshold: number;
  waiting_period_days: number;
}

export interface RecoveryRequest {
  id: string;
  contact_id: string;
  contact_name: string;
  verification_code: string;
  requested_at: string;
  approved: boolean;
}

export interface RecoveryStatus {
  can_recover: boolean;
  collected_shares: number;
  required_shares: number;
  waiting_period_remaining_days: number;
  contacts_responded: string[];
}

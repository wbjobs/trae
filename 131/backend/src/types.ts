export interface UpstreamNode {
  host: string;
  port: number;
  weight?: number;
}

export interface UpstreamConfig {
  type: 'v1' | 'v2' | 'canary';
  nodes?: UpstreamNode[];
  upstream_id?: string;
  timeout?: {
    connect?: number;
    send?: number;
    read?: number;
  };
}

export interface MatchConfig {
  header?: string;
  value?: string;
  user_id_header?: string;
  percentage?: number;
  hash_key?: string;
  user_ids?: string[];
}

export interface GrayRule {
  id: string;
  name: string;
  description?: string;
  match?: MatchConfig;
  upstream: UpstreamConfig;
  enabled: boolean;
  priority: number;
  created_at?: string;
  updated_at?: string;
}

export interface PluginConfig {
  rules: GrayRule[];
  default_upstream?: UpstreamConfig;
}

export interface CreateRuleRequest {
  name: string;
  description?: string;
  match?: MatchConfig;
  upstream: UpstreamConfig;
  enabled?: boolean;
  priority?: number;
}

export interface UpdateRuleRequest extends Partial<CreateRuleRequest> {}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface RuleValidationResult {
  valid: boolean;
  errors?: string[];
}

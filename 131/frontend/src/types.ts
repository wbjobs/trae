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
  count?: number;
  total?: number;
  samples?: SampleRecord[];
  stats?: SamplingStats;
  comparison?: Record<string, UpstreamStats>;
  config?: SamplingConfig;
}

export interface TestRuleResult {
  matches: boolean;
  upstreamType?: string;
  hashValue?: number;
  percentage?: number;
}

export interface SampleRecord {
  timestamp: number;
  request_id?: string;
  trace_id?: string;
  user_id?: string;
  upstream_type: string;
  matched_rule: boolean;
  config_version: number;
  method: string;
  uri: string;
  host: string;
  client_ip: string;
  latency: number;
  status_code: number;
  request_headers?: Record<string, string>;
  response_headers?: Record<string, string>;
  request_body?: string;
  response_body?: string;
  server_received_at?: number;
}

export interface SamplingConfig {
  enabled: boolean;
  rate: number;
  max_body_size: number;
  kafka_enabled: boolean;
  kafka_topic: string;
}

export interface UpstreamStats {
  count: number;
  avg_latency: number;
  error_rate: number;
  p95_latency: number;
  p99_latency: number;
}

export interface SamplingStats {
  total_samples: number;
  sampling_config: {
    enabled: boolean;
    rate: number;
    max_body_size: number;
  };
  upstream_type_distribution: Record<string, number>;
  match_rate: {
    matched: number;
    unmatched: number;
    percentage: number;
  };
  average_latency_ms: number;
  status_code_distribution: Record<string, number>;
  kafka: {
    enabled: boolean;
    topics?: string[];
    topicInfo?: any;
  };
}

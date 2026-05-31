export interface AnomalyResult {
  metricId: string;
  value: number;
  timestamp: number;
  source: string;
  isAnomaly: boolean;
  algorithm: string;
  score: number;
  threshold: number;
  message: string;
  tags?: Record<string, string>;
}

export interface StatisticsData {
  type: string;
  activeConnections: number;
  totalMessages: number;
  totalAnomalies: number;
  anomaliesByMetric: Record<string, number>;
  anomaliesByAlgorithm: Record<string, number>;
  timestamp: number;
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  isAnomaly: boolean;
  score: number;
  algorithm: string;
}

export interface AlertConfig {
  id: string;
  metricId: string;
  algorithm: string;
  enabled: boolean;
  channels: string[];
  threshold: number;
  minInterval: number;
}

export interface AlertHistory {
  id: string;
  metricId: string;
  value: number;
  timestamp: number;
  algorithm: string;
  score: number;
  message: string;
  channels: string[];
  status: 'sent' | 'failed' | 'pending';
}

export interface RootCauseAnalysis {
  type: string;
  alert: AnomalyResult;
  possibleCauses: ScoredCause[];
  suggestions: string[];
  confidence: number;
  severityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  analysisTimeMs: number;
}

export interface ScoredCause {
  patternCode: string;
  patternName: string;
  possibleCauses: string[];
  suggestions: string[];
  scoreComponents: Record<string, number>;
  totalScore: number;
}

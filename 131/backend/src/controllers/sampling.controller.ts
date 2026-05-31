import { Request, Response } from 'express';
import { kafkaService } from '../services/kafka.service';
import { config } from '../config';
import { logger } from '../utils/logger';

interface SampleRecord {
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
}

class SamplingController {
  private recentSamples: SampleRecord[] = [];
  private maxRecentSamples = 1000;

  async recordSample(req: Request, res: Response): Promise<void> {
    try {
      const sampleData = req.body as SampleRecord;

      // 验证必要字段
      if (!sampleData.uri || !sampleData.method) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: uri and method',
        });
        return;
      }

      // 添加服务器时间戳
      sampleData.timestamp = sampleData.timestamp || Date.now();
      sampleData.server_received_at = Date.now();

      // 存储到最近样本（用于快速查询）
      this.recentSamples.unshift(sampleData);
      if (this.recentSamples.length > this.maxRecentSamples) {
        this.recentSamples.pop();
      }

      // 发送到 Kafka
      if (config.kafka.enabled) {
        await kafkaService.sendSample(sampleData);
      }

      res.status(201).json({
        success: true,
        recorded: true,
        sample_id: sampleData.request_id || `sample-${Date.now()}`,
      });
    } catch (error) {
      logger.error('Failed to record sample:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record sample',
      });
    }
  }

  async recordBatchSamples(req: Request, res: Response): Promise<void> {
    try {
      const samples = req.body as SampleRecord[];

      if (!Array.isArray(samples)) {
        res.status(400).json({
          success: false,
          error: 'Request body must be an array of samples',
        });
        return;
      }

      const now = Date.now();
      samples.forEach((sample) => {
        sample.timestamp = sample.timestamp || now;
        sample.server_received_at = now;
      });

      // 存储到最近样本
      this.recentSamples.unshift(...samples);
      if (this.recentSamples.length > this.maxRecentSamples) {
        this.recentSamples = this.recentSamples.slice(0, this.maxRecentSamples);
      }

      // 批量发送到 Kafka
      if (config.kafka.enabled && samples.length > 0) {
        await kafkaService.sendBatchSamples(samples);
      }

      res.status(201).json({
        success: true,
        recorded: samples.length,
      });
    } catch (error) {
      logger.error('Failed to record batch samples:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record batch samples',
      });
    }
  }

  async getRecentSamples(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 100;
      const upstreamType = req.query.upstream_type as string;
      const matched = req.query.matched as string;
      const userId = req.query.user_id as string;

      let samples = this.recentSamples.slice(0, limit);

      if (upstreamType) {
        samples = samples.filter((s) => s.upstream_type === upstreamType);
      }

      if (matched === 'true') {
        samples = samples.filter((s) => s.matched_rule === true);
      } else if (matched === 'false') {
        samples = samples.filter((s) => s.matched_rule === false);
      }

      if (userId) {
        samples = samples.filter((s) => s.user_id === userId);
      }

      res.json({
        success: true,
        total: samples.length,
        samples,
      });
    } catch (error) {
      logger.error('Failed to get recent samples:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recent samples',
      });
    }
  }

  async getSamplingStats(req: Request, res: Response): Promise<void> {
    try {
      const recentSamples = this.recentSamples;

      // 统计不同上游类型的样本数
      const upstreamTypeStats: Record<string, number> = {};
      recentSamples.forEach((sample) => {
        const type = sample.upstream_type || 'unknown';
        upstreamTypeStats[type] = (upstreamTypeStats[type] || 0) + 1;
      });

      // 统计匹配率
      const matchedCount = recentSamples.filter((s) => s.matched_rule).length;
      const unmatchedCount = recentSamples.length - matchedCount;

      // 计算平均延迟
      const totalLatency = recentSamples.reduce((sum, s) => sum + (s.latency || 0), 0);
      const avgLatency = recentSamples.length > 0 ? totalLatency / recentSamples.length : 0;

      // 按状态码统计
      const statusCodeStats: Record<string, number> = {};
      recentSamples.forEach((sample) => {
        const code = String(sample.status_code || 'unknown');
        statusCodeStats[code] = (statusCodeStats[code] || 0) + 1;
      });

      const kafkaStats = config.kafka.enabled
        ? await kafkaService.getStats()
        : { enabled: false };

      res.json({
        success: true,
        stats: {
          total_samples: recentSamples.length,
          sampling_config: {
            enabled: config.sampling.enabled,
            rate: config.sampling.rate,
            max_body_size: config.sampling.maxBodySize,
          },
          upstream_type_distribution: upstreamTypeStats,
          match_rate: {
            matched: matchedCount,
            unmatched: unmatchedCount,
            percentage: recentSamples.length > 0
              ? (matchedCount / recentSamples.length) * 100
              : 0,
          },
          average_latency_ms: avgLatency,
          status_code_distribution: statusCodeStats,
          kafka: kafkaStats,
        },
      });
    } catch (error) {
      logger.error('Failed to get sampling stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sampling stats',
      });
    }
  }

  async compareUpstreams(req: Request, res: Response): Promise<void> {
    try {
      const { upstreamA = 'v1', upstreamB = 'v2', limit = 200 } = req.query;

      const samples = this.recentSamples.slice(0, parseInt(limit as string, 10));

      const samplesA = samples.filter((s) => s.upstream_type === upstreamA);
      const samplesB = samples.filter((s) => s.upstream_type === upstreamB);

      const calcStats = (samples: SampleRecord[]) => {
        if (samples.length === 0) {
          return {
            count: 0,
            avg_latency: 0,
            error_rate: 0,
            p95_latency: 0,
            p99_latency: 0,
          };
        }

        const latencies = samples.map((s) => s.latency || 0).sort((a, b) => a - b);
        const errors = samples.filter((s) => (s.status_code || 0) >= 500).length;

        return {
          count: samples.length,
          avg_latency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          error_rate: (errors / samples.length) * 100,
          p95_latency: latencies[Math.floor(latencies.length * 0.95)] || 0,
          p99_latency: latencies[Math.floor(latencies.length * 0.99)] || 0,
        };
      };

      res.json({
        success: true,
        comparison: {
          [upstreamA as string]: calcStats(samplesA),
          [upstreamB as string]: calcStats(samplesB),
        },
      });
    } catch (error) {
      logger.error('Failed to compare upstreams:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to compare upstreams',
      });
    }
  }

  async getSamplingConfig(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        config: {
          enabled: config.sampling.enabled,
          rate: config.sampling.rate,
          max_body_size: config.sampling.maxBodySize,
          kafka_enabled: config.kafka.enabled,
          kafka_topic: config.kafka.topic,
        },
      });
    } catch (error) {
      logger.error('Failed to get sampling config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sampling config',
      });
    }
  }

  async updateSamplingConfig(req: Request, res: Response): Promise<void> {
    try {
      const { enabled, rate } = req.body;

      if (rate !== undefined && (rate < 0 || rate > 1)) {
        res.status(400).json({
          success: false,
          error: 'Rate must be between 0 and 1',
        });
        return;
      }

      // 更新运行时配置
      if (enabled !== undefined) {
        config.sampling.enabled = enabled;
      }
      if (rate !== undefined) {
        config.sampling.rate = rate;
      }

      logger.info(`Sampling config updated: enabled=${config.sampling.enabled}, rate=${config.sampling.rate}`);

      res.json({
        success: true,
        config: {
          enabled: config.sampling.enabled,
          rate: config.sampling.rate,
        },
      });
    } catch (error) {
      logger.error('Failed to update sampling config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update sampling config',
      });
    }
  }
}

export const samplingController = new SamplingController();
export default samplingController;

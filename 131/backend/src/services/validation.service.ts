import Joi from 'joi';
import { CreateRuleRequest, UpdateRuleRequest, RuleValidationResult } from '../types';

const upstreamNodeSchema = Joi.object({
  host: Joi.string().required().description('后端服务主机地址'),
  port: Joi.number().port().required().description('后端服务端口'),
  weight: Joi.number().integer().min(1).default(1).description('节点权重'),
});

const upstreamConfigSchema = Joi.object({
  type: Joi.string().valid('v1', 'v2', 'canary').required().description('上游版本类型'),
  nodes: Joi.array().items(upstreamNodeSchema).optional(),
  upstream_id: Joi.string().optional().description('APISIX 上游ID'),
  timeout: Joi.object({
    connect: Joi.number().integer().min(1).default(3000),
    send: Joi.number().integer().min(1).default(3000),
    read: Joi.number().integer().min(1).default(3000),
  }).optional(),
}).xor('nodes', 'upstream_id').message('必须提供 nodes 或 upstream_id 其中之一');

const matchConfigSchema = Joi.object({
  header: Joi.string().default('x-version').description('匹配的请求头'),
  value: Joi.string().optional().description('请求头匹配值'),
  user_id_header: Joi.string().default('x-user-id').description('用户ID请求头'),
  percentage: Joi.number().integer().min(0).max(100).optional().description('灰度百分比'),
  hash_key: Joi.string().optional().description('哈希一致性密钥'),
  user_ids: Joi.array().items(Joi.string()).optional().description('白名单用户ID列表'),
});

const createRuleSchema = Joi.object({
  name: Joi.string().required().min(1).max(100).description('规则名称'),
  description: Joi.string().max(500).optional().description('规则描述'),
  match: matchConfigSchema.optional(),
  upstream: upstreamConfigSchema.required(),
  enabled: Joi.boolean().default(true).description('是否启用'),
  priority: Joi.number().integer().default(0).description('优先级，数值越大越先匹配'),
});

const updateRuleSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  match: matchConfigSchema.optional(),
  upstream: upstreamConfigSchema.optional(),
  enabled: Joi.boolean().optional(),
  priority: Joi.number().integer().optional(),
});

export class ValidationService {
  public validateCreateRule(data: CreateRuleRequest): RuleValidationResult {
    const { error } = createRuleSchema.validate(data, { abortEarly: false });

    if (error) {
      return {
        valid: false,
        errors: error.details.map((detail) => detail.message),
      };
    }

    return { valid: true };
  }

  public validateUpdateRule(data: UpdateRuleRequest): RuleValidationResult {
    const { error } = updateRuleSchema.validate(data, { abortEarly: false });

    if (error) {
      return {
        valid: false,
        errors: error.details.map((detail) => detail.message),
      };
    }

    return { valid: true };
  }

  public validateUserId(userId: string, percentage: number, hashKey?: string): boolean {
    if (!userId) return false;

    let key = userId;
    if (hashKey) {
      key += hashKey;
    }

    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const normalizedHash = Math.abs(hash) % 100;
    return normalizedHash < percentage;
  }

  public generateId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const validationService = new ValidationService();

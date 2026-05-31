import { GrayRule, CreateRuleRequest, UpdateRuleRequest } from '../types';
import { etcdService } from './etcd.service';
import { validationService } from './validation.service';
import { logger } from '../utils/logger';

export class RuleService {
  public async getAllRules(): Promise<GrayRule[]> {
    logger.debug('Fetching all rules');
    const rules = await etcdService.getRules();
    return rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  public async getRuleById(id: string): Promise<GrayRule | null> {
    logger.debug(`Fetching rule: ${id}`);
    return etcdService.getRuleById(id);
  }

  public async createRule(request: CreateRuleRequest): Promise<GrayRule> {
    logger.info(`Creating rule: ${request.name}`);

    const validation = validationService.validateCreateRule(request);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
    }

    const rule: GrayRule = {
      id: validationService.generateId(),
      name: request.name,
      description: request.description,
      match: request.match,
      upstream: request.upstream,
      enabled: request.enabled !== undefined ? request.enabled : true,
      priority: request.priority !== undefined ? request.priority : 0,
    };

    return etcdService.createRule(rule);
  }

  public async updateRule(id: string, request: UpdateRuleRequest): Promise<GrayRule> {
    logger.info(`Updating rule: ${id}`);

    const existing = await etcdService.getRuleById(id);
    if (!existing) {
      throw new Error(`Rule with id ${id} not found`);
    }

    const validation = validationService.validateUpdateRule(request);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
    }

    const updates: Partial<GrayRule> = {};

    if (request.name !== undefined) updates.name = request.name;
    if (request.description !== undefined) updates.description = request.description;
    if (request.match !== undefined) updates.match = request.match;
    if (request.upstream !== undefined) updates.upstream = request.upstream;
    if (request.enabled !== undefined) updates.enabled = request.enabled;
    if (request.priority !== undefined) updates.priority = request.priority;

    return etcdService.updateRule(id, updates);
  }

  public async deleteRule(id: string): Promise<void> {
    logger.info(`Deleting rule: ${id}`);
    await etcdService.deleteRule(id);
  }

  public async toggleRule(id: string, enabled: boolean): Promise<GrayRule> {
    logger.info(`${enabled ? 'Enabling' : 'Disabling'} rule: ${id}`);
    return etcdService.toggleRule(id, enabled);
  }

  public async reorderRules(ruleIds: string[]): Promise<GrayRule[]> {
    logger.info('Reordering rules');

    const rules = await etcdService.getRules();
    const ruleMap = new Map(rules.map((r) => [r.id, r]));

    const updatedRules: GrayRule[] = ruleIds.map((id, index) => {
      const rule = ruleMap.get(id);
      if (!rule) {
        throw new Error(`Rule with id ${id} not found`);
      }
      return {
        ...rule,
        priority: ruleIds.length - index,
        updated_at: new Date().toISOString(),
      };
    });

    const remainingRules = rules.filter((r) => !ruleIds.includes(r.id));
    remainingRules.forEach((r) => {
      updatedRules.push({
        ...r,
        priority: 0,
        updated_at: new Date().toISOString(),
      });
    });

    await etcdService.saveRules(updatedRules);
    return updatedRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  public async testRule(ruleId: string, userId: string): Promise<{
    matches: boolean;
    upstreamType?: string;
    hashValue?: number;
    percentage?: number;
  }> {
    logger.debug(`Testing rule ${ruleId} for user ${userId}`);

    const rule = await etcdService.getRuleById(ruleId);
    if (!rule) {
      throw new Error(`Rule with id ${ruleId} not found`);
    }

    if (!rule.match) {
      return {
        matches: true,
        upstreamType: rule.upstream.type,
      };
    }

    if (rule.match.user_ids && rule.match.user_ids.includes(userId)) {
      return {
        matches: true,
        upstreamType: rule.upstream.type,
      };
    }

    if (rule.match.percentage !== undefined) {
      const matches = validationService.validateUserId(
        userId,
        rule.match.percentage,
        rule.match.hash_key
      );

      let hashValue: number | undefined;
      if (rule.match.hash_key) {
        const key = userId + rule.match.hash_key;
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
          const char = key.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        hashValue = Math.abs(hash) % 100;
      }

      return {
        matches,
        upstreamType: rule.upstream.type,
        hashValue,
        percentage: rule.match.percentage,
      };
    }

    if (rule.match.header && rule.match.value) {
      return {
        matches: true,
        upstreamType: rule.upstream.type,
      };
    }

    return {
      matches: false,
    };
  }

  public subscribeToChanges(callback: (rules: GrayRule[]) => void): () => void {
    return etcdService.subscribe(callback);
  }

  public async importRules(rulesToImport: CreateRuleRequest[]): Promise<GrayRule[]> {
    logger.info(`Importing ${rulesToImport.length} rules`);

    const createdRules: GrayRule[] = [];
    for (const ruleData of rulesToImport) {
      const rule = await this.createRule(ruleData);
      createdRules.push(rule);
    }

    return createdRules;
  }

  public async exportRules(): Promise<CreateRuleRequest[]> {
    logger.info('Exporting rules');
    const rules = await this.getAllRules();

    return rules.map((rule) => ({
      name: rule.name,
      description: rule.description,
      match: rule.match,
      upstream: rule.upstream,
      enabled: rule.enabled,
      priority: rule.priority,
    }));
  }
}

export const ruleService = new RuleService();

import { EventEmitter } from 'events';
import axios from 'axios';
import type { ParsedMessage, RouteRule, RouteCondition, RouteTarget, ForwardLog } from '../../../common/types';
import { generateId } from '../../../common/utils';
import { loadBalancer } from '../../load-balancer/src';

export class MessageRouter extends EventEmitter {
  private rules: RouteRule[] = [];
  private webhookCache: Map<string, any> = new Map();
  private enableLoadBalancer = true;

  loadRules(rules: RouteRule[]): void {
    this.rules = rules.sort((a, b) => a.priority - b.priority);
    console.log(`[Router] Loaded ${rules.length} routing rules`);
  }

  addRule(rule: RouteRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  updateRule(rule: RouteRule): void {
    const index = this.rules.findIndex(r => r.id === rule.id);
    if (index > -1) {
      this.rules[index] = rule;
      this.rules.sort((a, b) => a.priority - b.priority);
    }
  }

  async route(message: ParsedMessage): Promise<ForwardLog[]> {
    const logs: ForwardLog[] = [];
    const matchedRules = this.findMatchingRules(message);

    console.log(`[Router] Message from ${message.deviceId} matched ${matchedRules.length} rules`);

    for (const rule of matchedRules) {
      const processedTargets = new Set<string>();
      
      for (const target of rule.targets) {
        let finalTarget = target;
        
        if (this.enableLoadBalancer && target.type === 'webhook') {
          const selected = loadBalancer.selectTarget(message, [target]);
          if (selected) {
            finalTarget = selected;
          }
        }
        
        const targetKey = `${target.type}:${target.value}`;
        if (processedTargets.has(targetKey)) continue;
        processedTargets.add(targetKey);
        
        const log = await this.forwardToTarget(message, finalTarget, rule.id);
        logs.push(log);
      }
    }

    return logs;
  }

  setLoadBalancerEnabled(enabled: boolean): void {
    this.enableLoadBalancer = enabled;
  }

  private findMatchingRules(message: ParsedMessage): RouteRule[] {
    return this.rules.filter(rule => {
      if (!rule.enabled) return false;
      return rule.conditions.every(condition => this.evaluateCondition(condition, message));
    });
  }

  private evaluateCondition(condition: RouteCondition, message: ParsedMessage): boolean {
    const fieldValue = this.getFieldValue(condition.field, message);
    if (fieldValue === undefined) return false;

    const value = String(fieldValue);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'eq':
        return value === targetValue;
      case 'ne':
        return value !== targetValue;
      case 'contains':
        return value.includes(targetValue);
      case 'regex':
        try {
          return new RegExp(targetValue).test(value);
        } catch {
          return false;
        }
      case 'gt':
        return parseFloat(value) > parseFloat(targetValue);
      case 'lt':
        return parseFloat(value) < parseFloat(targetValue);
      default:
        return false;
    }
  }

  private getFieldValue(field: string, message: ParsedMessage): any {
    if (field === 'protocol') return message.protocol;
    if (field === 'deviceId') return message.deviceId;
    if (field === 'timestamp') return message.timestamp;
    if (message.parsedData && field in message.parsedData) {
      return message.parsedData[field];
    }
    return undefined;
  }

  private async forwardToTarget(
    message: ParsedMessage,
    target: RouteTarget,
    ruleId: string
  ): Promise<ForwardLog> {
    const timestamp = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      const transformedData = target.transform
        ? this.applyTransform(message.parsedData, target.transform)
        : message.parsedData;

      switch (target.type) {
        case 'webhook':
          await this.sendToWebhook(target.value, transformedData, message);
          break;
        case 'topic':
          this.emit('topicMessage', target.value, transformedData, message);
          break;
        case 'device':
          this.emit('deviceCommand', target.value, transformedData, message);
          break;
        case 'group':
          this.emit('groupMessage', target.value, transformedData, message);
          break;
        default:
          throw new Error(`Unknown target type: ${target.type}`);
      }

      console.log(`[Router] Forwarded to ${target.type}:${target.value}`);
    } catch (e: any) {
      success = false;
      error = e.message;
      console.error(`[Router] Forward failed to ${target.type}:${target.value}:`, error);
    }

    return {
      id: generateId(),
      messageId: message.id,
      ruleId,
      sourceDevice: message.deviceId || 'unknown',
      targetType: target.type,
      targetValue: target.value,
      timestamp,
      success,
      error
    };
  }

  private applyTransform(data: Record<string, any>, transformScript: string): any {
    try {
      const fn = new Function('data', transformScript);
      return fn(data);
    } catch (e: any) {
      console.warn(`[Router] Transform failed: ${e.message}`);
      return data;
    }
  }

  private async sendToWebhook(url: string, data: any, message: ParsedMessage): Promise<void> {
    const cacheKey = `${url}:${message.id}`;
    if (this.webhookCache.has(cacheKey)) {
      return;
    }

    this.webhookCache.set(cacheKey, true);
    setTimeout(() => this.webhookCache.delete(cacheKey), 5000);

    try {
      await axios.post(url, {
        messageId: message.id,
        deviceId: message.deviceId,
        protocol: message.protocol,
        timestamp: message.timestamp,
        data
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      throw new Error(`Webhook request failed: ${e.message}`);
    }
  }
}

export const messageRouter = new MessageRouter();

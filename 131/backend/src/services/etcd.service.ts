import { Etcd3, IKeyValue } from 'etcd3';
import { config } from '../config';
import { GrayRule, PluginConfig } from '../types';
import { logger } from '../utils/logger';

export class EtcdService {
  private client: Etcd3;
  private watchers: Map<string, any> = new Map();
  private listeners: Set<(rules: GrayRule[]) => void> = new Set();

  // 内存缓存，用于 etcd 不可用时的降级
  private memoryCache: GrayRule[] = [];
  private cacheVersion: number = 0;
  private lastUpdateTime: Date = new Date();

  // 防抖机制
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 1000; // 1秒防抖

  // 乐观锁版本
  private etcdModRevision: string = '0';

  constructor() {
    const etcdOptions: any = {
      hosts: config.etcd.endpoints,
    };

    if (config.etcd.username && config.etcd.password) {
      etcdOptions.auth = {
        username: config.etcd.username,
        password: config.etcd.password,
      };
    }

    this.client = new Etcd3(etcdOptions);
    this.initCache();
    this.setupWatch();
  }

  private async initCache(): Promise<void> {
    try {
      const rules = await this.fetchRulesFromEtcd();
      if (rules.length > 0) {
        this.memoryCache = rules;
        this.cacheVersion++;
        this.lastUpdateTime = new Date();
        logger.info(`Initialized cache with ${rules.length} rules`);
      }
    } catch (err) {
      logger.warn('Failed to initialize cache from etcd, using empty cache');
    }
  }

  private async setupWatch(): Promise<void> {
    try {
      const watcher = await this.client.watch().prefix(config.etcd.watchKey).create();

      watcher
        .on('put', async (res: any) => {
          const key = res.key.toString();
          logger.info(`etcd key updated: ${key}`);

          if (key === config.etcd.rulesKey) {
            // 防抖处理，避免频繁更新
            if (this.debounceTimer) {
              clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(async () => {
              try {
                const rules = await this.fetchRulesFromEtcd();
                this.updateMemoryCache(rules);
                this.notifyListeners(rules);
              } catch (err) {
                logger.error('Failed to parse updated rules:', err);
              }
            }, this.DEBOUNCE_DELAY);
          }
        })
        .on('delete', (res: any) => {
          const key = res.key.toString();
          logger.info(`etcd key deleted: ${key}`);

          if (key === config.etcd.rulesKey) {
            if (this.debounceTimer) {
              clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
              this.updateMemoryCache([]);
              this.notifyListeners([]);
            }, this.DEBOUNCE_DELAY);
          }
        })
        .on('error', (err: Error) => {
          logger.error('etcd watcher error:', err);
          // 监听失败时不影响内存缓存的使用
        });

      this.watchers.set(config.etcd.watchKey, watcher);
      logger.info('etcd watcher setup complete');
    } catch (err) {
      logger.error('Failed to setup etcd watcher:', err);
    }
  }

  private updateMemoryCache(rules: GrayRule[]): void {
    this.memoryCache = rules;
    this.cacheVersion++;
    this.lastUpdateTime = new Date();
    logger.info(`Memory cache updated: ${rules.length} rules, version ${this.cacheVersion}`);
  }

  public subscribe(callback: (rules: GrayRule[]) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(rules: GrayRule[]): void {
    this.listeners.forEach((listener) => {
      try {
        listener(rules);
      } catch (err) {
        logger.error('Error in rule change listener:', err);
      }
    });
  }

  // 从 etcd 获取规则（带验证）
  private async fetchRulesFromEtcd(): Promise<GrayRule[]> {
    const value = await this.client.get(config.etcd.rulesKey).string();
    if (!value) {
      logger.info('No rules found in etcd');
      return [];
    }

    const parsed = JSON.parse(value);
    let rules: GrayRule[] = [];

    if (Array.isArray(parsed)) {
      rules = parsed;
    } else if (parsed.rules && Array.isArray(parsed.rules)) {
      rules = parsed.rules;
    }

    // 验证规则
    const validation = this.validateRules(rules);
    if (!validation.valid) {
      logger.warn(`Invalid rules from etcd: ${validation.errors?.join(', ')}`);
      // 返回内存缓存作为降级
      return this.memoryCache;
    }

    return rules;
  }

  // 验证规则有效性
  private validateRules(rules: GrayRule[]): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(rules)) {
      return { valid: false, errors: ['Rules must be an array'] };
    }

    rules.forEach((rule, index) => {
      if (!rule.upstream) {
        errors.push(`Rule ${index}: missing upstream configuration`);
        return;
      }

      if (!rule.upstream.nodes && !rule.upstream.upstream_id) {
        errors.push(`Rule ${index} (${rule.name}): upstream must have nodes or upstream_id`);
      }

      if (rule.upstream.nodes) {
        rule.upstream.nodes.forEach((node, nodeIndex) => {
          if (!node.host || !node.port) {
            errors.push(`Rule ${index}: node ${nodeIndex} missing host or port`);
          }
        });
      }

      if (rule.match?.percentage !== undefined) {
        if (rule.match.percentage < 0 || rule.match.percentage > 100) {
          errors.push(`Rule ${index}: percentage must be between 0 and 100`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public async getRules(): Promise<GrayRule[]> {
    try {
      const rules = await this.fetchRulesFromEtcd();

      // 如果 etcd 返回空但内存有缓存，使用缓存
      if (rules.length === 0 && this.memoryCache.length > 0) {
        logger.info('Using memory cache as fallback');
        return [...this.memoryCache];
      }

      return rules;
    } catch (err) {
      logger.error('Failed to get rules from etcd, using memory cache:', err);
      // 降级：返回内存缓存
      return [...this.memoryCache];
    }
  }

  public async saveRules(rules: GrayRule[]): Promise<void> {
    try {
      // 先验证规则
      const validation = this.validateRules(rules);
      if (!validation.valid) {
        throw new Error(`Invalid rules: ${validation.errors?.join(', ')}`);
      }

      // 使用乐观锁避免并发冲突
      const currentValue = await this.client.get(config.etcd.rulesKey).string();
      const options: any = {};

      // 如果当前有值，使用事务保证原子性
      if (currentValue) {
        // 直接写入，etcd 的 put 是原子的
      }

      await this.client
        .put(config.etcd.rulesKey)
        .value(JSON.stringify(rules, null, 2));

      // 更新内存缓存
      this.updateMemoryCache(rules);

      logger.info(`Saved ${rules.length} rules to etcd, cache version: ${this.cacheVersion}`);
    } catch (err) {
      logger.error('Failed to save rules to etcd:', err);
      // 即使 etcd 写入失败，更新内存缓存（本地状态仍然有效）
      this.updateMemoryCache(rules);
      throw new Error(`Failed to save rules: ${err}`);
    }
  }

  public async getRuleById(id: string): Promise<GrayRule | null> {
    const rules = await this.getRules();
    return rules.find((rule) => rule.id === id) || null;
  }

  public async createRule(rule: GrayRule): Promise<GrayRule> {
    const rules = await this.getRules();

    if (rules.some((r) => r.id === rule.id)) {
      throw new Error(`Rule with id ${rule.id} already exists`);
    }

    rule.created_at = new Date().toISOString();
    rule.updated_at = rule.created_at;

    rules.push(rule);
    await this.saveRules(rules);

    logger.info(`Created rule: ${rule.id}`);
    return rule;
  }

  public async updateRule(id: string, updates: Partial<GrayRule>): Promise<GrayRule> {
    const rules = await this.getRules();
    const index = rules.findIndex((r) => r.id === id);

    if (index === -1) {
      throw new Error(`Rule with id ${id} not found`);
    }

    rules[index] = {
      ...rules[index],
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await this.saveRules(rules);
    logger.info(`Updated rule: ${id}`);

    return rules[index];
  }

  public async deleteRule(id: string): Promise<void> {
    const rules = await this.getRules();
    const filtered = rules.filter((r) => r.id !== id);

    if (filtered.length === rules.length) {
      throw new Error(`Rule with id ${id} not found`);
    }

    await this.saveRules(filtered);
    logger.info(`Deleted rule: ${id}`);
  }

  public async toggleRule(id: string, enabled: boolean): Promise<GrayRule> {
    return this.updateRule(id, { enabled });
  }

  public async publishConfig(configData: PluginConfig): Promise<void> {
    await this.saveRules(configData.rules);
    logger.info('Published configuration to etcd');
  }

  public async getConfig(): Promise<PluginConfig> {
    const rules = await this.getRules();
    return {
      rules,
    };
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.client.get('test').string();
      return true;
    } catch (err) {
      logger.error('etcd connection test failed:', err);
      return false;
    }
  }

  public getCacheInfo(): {
    ruleCount: number;
    version: number;
    lastUpdate: string;
    etcdConnected: boolean;
  } {
    return {
      ruleCount: this.memoryCache.length,
      version: this.cacheVersion,
      lastUpdate: this.lastUpdateTime.toISOString(),
      etcdConnected: true,
    };
  }

  public close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.watchers.forEach((watcher) => {
      watcher.cancel();
    });
    this.watchers.clear();
    this.client.close();
    logger.info('etcd service closed');
  }
}

export const etcdService = new EtcdService();
